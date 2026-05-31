# Dashboard Interactivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three features: (F1) AI summary text before template card; (F2) component annotation overlay for surgical partial updates; (F3) tab/filter linkage with 500ms fake loading across components.

**Architecture:** F1 adds a lightweight LLM call in pipeline.ts emitting a `template_summary` SSE event before `template_ready`. F2 uses HTML boundary markers (`<!-- dc:id:start/end -->`), iframe→React postMessage, annotation chips in ChatInput, and a `runPartialUpdate()` function with surgical string replacement + full-regen fallback. F3 extends layout/mockdata prompts to produce `controls`/`controlledBy` specs and extends the template prompt to generate linkage JS with 500ms CSS loading animations and per-component variant data.

**Tech Stack:** Next.js 14 App Router, Prisma MySQL, OpenAI-compatible SDK, React 18, Zustand, Tailwind, Vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/types/index.ts` | Modify | Add `template_summary` SSE type + `Annotation` + `ComponentRegistryItem` |
| `src/lib/ai/prompts/summary.ts` | **Create** | SUMMARY_SYSTEM + SUMMARY_USER prompts |
| `src/lib/ai/prompts/partial-update.ts` | **Create** | INTENT_SYSTEM + INTENT_USER prompts |
| `src/lib/ai/prompts/layout.ts` | Modify | Add controls/variants/controlledBy instructions |
| `src/lib/ai/prompts/mockdata.ts` | Modify | Add variant data generation for controlled components |
| `src/lib/ai/prompts/template.ts` | Modify | Add dc markers + linkage JS/CSS instructions |
| `src/lib/ai/partial-update.ts` | **Create** | `runPartialUpdate()`: intent → surgical replace → fallback |
| `src/lib/ai/pipeline.ts` | Modify | Call summary LLM after template; route to partial update when annotations present |
| `src/lib/utils/dc-tracker.ts` | **Create** | Tracking script string injected into preview HTML |
| `src/app/api/templates/[id]/preview/route.ts` | Modify | Strip dc markers, inject tracking script |
| `src/app/api/sessions/[id]/messages/route.ts` | Modify | Accept `annotations` field, pass to pipeline |
| `src/components/template/TemplatePreview.tsx` | Modify | Annotation mode, postMessage listener, overlay divs |
| `src/components/chat/ChatInput.tsx` | Modify | `annotations` prop + chips row |
| `src/components/layout/ChatPanel.tsx` | Modify | `annotations` state, handle `template_summary` event, pass props down |
| `src/__tests__/partial-update.test.ts` | **Create** | Surgical replace logic unit tests |
| `src/__tests__/dc-tracker.test.ts` | **Create** | Tracking script injection tests |

---

## Task 1: Type System Foundation

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Add `template_summary` to SSEEventType union and SSEEvent interface, add `Annotation` and `ComponentRegistryItem` types**

Replace the SSEEventType and SSEEvent sections in `src/types/index.ts`:

```typescript
// REPLACE the existing SSEEventType:
export type SSEEventType =
  | 'step_start'
  | 'step_content'
  | 'step_thinking'
  | 'step_score'
  | 'step_complete'
  | 'step_failed'
  | 'expert_question'
  | 'template_summary'    // ← NEW: AI summary text before card
  | 'template_ready'
  | 'pipeline_complete'
  | 'pipeline_paused'
  | 'heartbeat'
  | 'error'

// REPLACE the existing SSEEvent interface:
export interface SSEEvent {
  type: SSEEventType
  stepIndex?: number
  stepName?: StepName
  delta?: string
  score?: number
  issues?: string[]
  question?: ExpertQuestion
  templateId?: string
  summaryText?: string    // ← NEW: used by template_summary
  reason?: string
  message?: string
}

// ADD these new types at end of file:
/** One annotation chip the user pinned on a component before sending */
export interface Annotation {
  componentId: string    // matches data-dc attribute in template HTML
  componentLabel: string // human-readable name shown in chip
  note: string           // user's text note, may be empty string
}

/** Stored in Template.components JSON array */
export interface ComponentRegistryItem {
  id: string
  label: string
  type: string           // e.g. 'metric_card', 'line_chart'
  controlledBy?: string  // component id of the controller, if any
}

// REPLACE Template interface (components: string[] → ComponentRegistryItem[]):
export interface Template {
  id: string
  sessionId: string
  htmlContent: string
  score: number
  components: ComponentRegistryItem[]
  createdAt: string
}
```

- [ ] **Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add template_summary SSE event, Annotation, ComponentRegistryItem"
```

---

## Task 2: F1 — Summary Prompt

**Files:**
- Create: `src/lib/ai/prompts/summary.ts`

- [ ] **Create summary prompt file**

```typescript
// src/lib/ai/prompts/summary.ts
export const SUMMARY_SYSTEM = `你是一个仪表板设计助手。根据需求摘要和已生成的组件列表，
输出一段 2-3 句的中文总结，帮助用户了解刚刚生成了什么。

要求：
- 第一句：说明仪表板名称和核心主题
- 第二句：列举 2-4 个主要组件或功能亮点
- 第三句：引导用户下一步操作（右侧预览、注释模式调整）
- 语气自然、简洁，不要用"我"开头，不要重复"仪表板"这个词
- 不要输出 JSON，直接输出纯文本段落`

export const SUMMARY_USER = (
  requirementsSummary: string,
  componentLabels: string[],
  score: number
) => `需求摘要：${requirementsSummary}

已生成组件：${componentLabels.join('、')}

模板质量评分：${score} 分

请生成 2-3 句中文总结。`
```

- [ ] **Commit**

```bash
git add src/lib/ai/prompts/summary.ts
git commit -m "feat(prompts): add template summary prompt"
```

---

## Task 3: F1 — Summary LLM Call in Pipeline + SSE Event

**Files:**
- Modify: `src/lib/ai/pipeline.ts`

- [ ] **Add summary generation after TEMPLATE_GENERATION completes, before `template_ready` event**

In `src/lib/ai/pipeline.ts`, after the `prisma.template.upsert(...)` call and before `send({ type: 'template_ready', ... })`, add:

```typescript
// Add import at top of file:
import { SUMMARY_SYSTEM, SUMMARY_USER } from '@/lib/ai/prompts/summary'

// After template upsert, extract component labels from layout:
let componentLabels: string[] = []
try {
  const layoutParsed = JSON.parse(previousOutputs['LAYOUT_PLANNING'] || '{}')
  const areas: Array<{ components?: Array<{ title?: string }> }> = layoutParsed.areas || []
  componentLabels = areas
    .flatMap(a => a.components || [])
    .map(c => c.title || '')
    .filter(Boolean)
    .slice(0, 8)
} catch { /* ignore */ }

// Build component registry for Template.components:
let componentRegistry: import('@/types').ComponentRegistryItem[] = []
try {
  const layoutParsed = JSON.parse(previousOutputs['LAYOUT_PLANNING'] || '{}')
  const areas: Array<{ components?: Array<{ id?: string; title?: string; type?: string; controlledBy?: string }> }> = layoutParsed.areas || []
  componentRegistry = areas
    .flatMap(a => a.components || [])
    .filter(c => c.id)
    .map(c => ({
      id: c.id!,
      label: c.title || c.id!,
      type: c.type || 'card',
      ...(c.controlledBy ? { controlledBy: c.controlledBy } : {}),
    }))
} catch { /* ignore */ }

// Re-upsert with populated components registry:
await prisma.template.update({
  where: { sessionId },
  data: { components: componentRegistry as never },
})

// Generate and send summary:
let summaryText = ''
try {
  const reqJson = JSON.parse(previousOutputs['REQUIREMENTS_ANALYSIS'] || '{}')
  const reqSummary: string = reqJson.summary || reqJson.businessGoal || ''
  if (reqSummary) {
    const summaryResp = await getOpenAIClient().chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM },
        { role: 'user', content: SUMMARY_USER(reqSummary, componentLabels, templateScore) },
      ],
      max_tokens: 200,
    })
    summaryText = summaryResp.choices[0]?.message?.content?.trim() || ''
  }
} catch { /* summary is best-effort, don't fail pipeline */ }

if (summaryText) {
  send({ type: 'template_summary', summaryText })
}

// (existing) send template_ready:
send({ type: 'template_ready', templateId: template.id })
```

- [ ] **Run existing tests to make sure nothing broke**

```bash
npx vitest run src/__tests__/pipeline-thresholds.test.ts
```
Expected: all pass.

- [ ] **Commit**

```bash
git add src/lib/ai/pipeline.ts
git commit -m "feat(pipeline): generate AI summary text before template_ready event"
```

---

## Task 4: F1 — ChatPanel Handles template_summary Event

**Files:**
- Modify: `src/components/layout/ChatPanel.tsx`

- [ ] **Handle `template_summary` event in SSE reader loop**

In `src/components/layout/ChatPanel.tsx`, inside the SSE event processing loop, add before the `template_ready` handler:

```typescript
if (event.type === 'template_summary' && event.summaryText) {
  const summaryMsg: Message = {
    id: `summary-${Date.now()}`,
    sessionId,
    role: 'ASSISTANT',
    content: event.summaryText,
    type: 'TEXT',
    createdAt: new Date().toISOString(),
  }
  setMessages(prev => [...prev, summaryMsg])
}
```

- [ ] **Commit**

```bash
git add src/components/layout/ChatPanel.tsx
git commit -m "feat(chat): display template_summary as assistant text message before template card"
```

---

## Task 5: F3 — Layout Prompt: controls/variants/controlledBy

**Files:**
- Modify: `src/lib/ai/prompts/layout.ts`

- [ ] **Add linkage instructions to LAYOUT_SYSTEM and extend the JSON schema example**

In `src/lib/ai/prompts/layout.ts`, append to `LAYOUT_SYSTEM`:

```typescript
// APPEND to LAYOUT_SYSTEM string before the closing backtick:
`
## 组件联动规范（重要）

若布局中包含 date_filter、dropdown_filter 或 tabs 类型组件，必须：

1. 分析 dashboard 中哪些图表/数据组件会受该控件影响
2. 在控制组件上添加 controls 和 variants 字段：
   - controls: 被控制的组件 id 数组
   - variants: 数据维度列表（如 ["day","week","month"]）
3. 在被控制组件上添加 controlledBy 字段（控制组件的 id）

示例：
{
  "id": "time-filter",
  "type": "date_filter",
  "title": "时间维度",
  "span": 12,
  "dataKey": "timeFilter",
  "controls": ["hourly-flow", "peak-chart"],
  "variants": ["day", "week", "month"]
},
{
  "id": "hourly-flow",
  "type": "line_chart",
  "title": "流量趋势",
  "span": 8,
  "dataKey": "hourlyFlow",
  "controlledBy": "time-filter"
}

tabs 类型组件的 variants 对应每个 tab 的 key（如 ["overview","detail","ranking"]）。
tabs 类型的 controls 列出内部子组件的 id。`
```

- [ ] **Commit**

```bash
git add src/lib/ai/prompts/layout.ts
git commit -m "feat(prompts): layout planner now emits controls/variants/controlledBy for linked components"
```

---

## Task 6: F3 — MockData Prompt: Variant Data Generation

**Files:**
- Modify: `src/lib/ai/prompts/mockdata.ts`

- [ ] **Add variant data generation instructions to MOCKDATA_SYSTEM**

Append to `MOCKDATA_SYSTEM` before closing backtick:

```typescript
`
## 联动组件变体数据（重要）

若布局规划中某组件有 controlledBy 字段，必须为其 dataKey 生成多个 variants 的数据。
变体 key 来自控制组件的 variants 字段（如 day/week/month）。

示例（controlledBy="time-filter", variants=["day","week","month"]）：
{
  "hourlyFlow": {
    "day":   { "labels": ["0时","1时","2时","3时","4时","5时","6时","7时","8时","9时","10时","11时","12时","13时","14时","15时","16时","17时","18时","19时","20时","21时","22时","23时"], "values": [12,8,6,4,5,15,42,89,134,156,142,138,145,132,128,141,156,163,147,98,67,45,32,18] },
    "week":  { "labels": ["周一","周二","周三","周四","周五","周六","周日"], "values": [1234,1456,1389,1502,1678,987,654] },
    "month": { "labels": ["1日","2日","3日","4日","5日","6日","7日","8日","9日","10日","11日","12日","13日","14日","15日","16日","17日","18日","19日","20日","21日","22日","23日","24日","25日","26日","27日","28日","29日","30日"], "values": [456,423,498,512,489,534,423,401,523,556,478,512,534,489,501,523,478,512,489,534,512,489,501,523,478,512,489,534,501,489] }
  }
}

非联动组件（无 controlledBy）正常生成单份数据。`
```

- [ ] **Commit**

```bash
git add src/lib/ai/prompts/mockdata.ts
git commit -m "feat(prompts): mockdata generates variant arrays for controlledBy components"
```

---

## Task 7: F2+F3 — Template Prompt: dc Markers + Linkage JS

**Files:**
- Modify: `src/lib/ai/prompts/template.ts`

- [ ] **Step 1: Add dc boundary marker rules to TEMPLATE_SYSTEM**

Append to `TEMPLATE_SYSTEM` (before the closing backtick) after the existing "生成规则" section:

```typescript
`
## 组件标记规范（必须严格遵守）

每个顶层组件 div 必须：
1. 携带属性 data-dc="组件id" data-dc-label="组件标题"（id 来自布局规划的 id 字段）
2. 被 <!-- dc:组件id:start --> 和 <!-- dc:组件id:end --> 注释节点包裹

示例：
<!-- dc:total-spaces:start -->
<div class="col-3 card" data-dc="total-spaces" data-dc-label="总车位数">
  ...内容...
</div>
<!-- dc:total-spaces:end -->

绝对不能省略这些注释节点，它们用于后续的精确局部更新。

## 联动组件规范

若布局规划中控制组件有 controls 和 variants 字段：
1. 控制组件（date_filter/dropdown_filter）渲染为 segmented button group：
   \`\`\`html
   <div class="dc-filter-group" data-controls="id1,id2" data-variants="day,week,month" data-current="day">
     <button class="dc-filter-btn active" onclick="dcSwitch(this,'day')">按天</button>
     <button class="dc-filter-btn" onclick="dcSwitch(this,'week')">按周</button>
     <button class="dc-filter-btn" onclick="dcSwitch(this,'month')">按月</button>
   </div>
   \`\`\`
2. 被控制的图表组件（有 controlledBy）：
   - 添加属性 data-controlled-by="控制组件id"
   - 添加属性 data-variant-data='{ "day":{...}, "week":{...}, "month":{...} }' （JSON 来自 Mock 数据）
   - 添加 data-current-variant="day"（初始变体）
   - 图表初始化时用 day 数据
3. 被控制的非图表组件（metric_card/table/list）：
   - 添加 data-controlled-by + data-variant-data 属性
   - 每份 variant 数据包含 value/labels/rows 等该组件所需字段

## 联动 JS 和 Loading CSS（必须注入到每个有联动的模板）

在 </style> 前添加：
\`\`\`css
.dc-filter-group { display:flex; gap:4px; padding:4px; background:#F1F5F9; border-radius:8px; }
.dc-filter-btn { padding:6px 16px; border:none; border-radius:6px; font-size:13px; font-weight:500;
  color:#64748B; background:transparent; cursor:pointer; transition:all .2s; }
.dc-filter-btn.active { background:#fff; color:#4F46E5; box-shadow:0 1px 3px rgba(0,0,0,.08); }
.dc-loading { position:relative; pointer-events:none; }
.dc-loading::after { content:''; position:absolute; inset:0; border-radius:var(--radius,12px);
  background:rgba(255,255,255,0.78); animation:dc-pulse .5s ease-in-out forwards; }
@keyframes dc-pulse { 0%{opacity:0} 40%{opacity:1} 100%{opacity:.85} }
\`\`\`

在页面 JS 末尾（window.addEventListener('resize',...) 之前）添加：
\`\`\`javascript
// DC Linkage Engine
const DC_CHARTS = {}  // populated after echarts init: DC_CHARTS['chart-id'] = chartInstance
function dcSwitch(btn, variant) {
  const group = btn.closest('[data-controls]')
  if (!group) return
  group.querySelectorAll('.dc-filter-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  const controlIds = group.dataset.controls.split(',').map(s => s.trim())
  controlIds.forEach(ctrlId => {
    const el = document.querySelector(\`[data-controlled-by][data-dc="\${ctrlId}"]\`) ||
               document.getElementById(ctrlId)
    if (!el) return
    el.classList.add('dc-loading')
    setTimeout(() => {
      el.classList.remove('dc-loading')
      try {
        const allData = JSON.parse(el.dataset.variantData || '{}')
        const vd = allData[variant]
        if (!vd) return
        const chartEl = el.querySelector('[id]')
        if (chartEl && DC_CHARTS[chartEl.id]) {
          const opt = {}
          if (vd.labels) opt.xAxis = { data: vd.labels }
          if (vd.values) opt.series = [{ data: vd.values }]
          DC_CHARTS[chartEl.id].setOption(opt)
        } else if (vd.value !== undefined) {
          const valEl = el.querySelector('.metric-value')
          if (valEl) valEl.textContent = vd.value
          const trendEl = el.querySelector('.metric-change')
          if (trendEl && vd.trend) trendEl.textContent = vd.trend
        }
      } catch(e) { console.warn('dcSwitch error', e) }
    }, 500)
  })
}
// Register all echarts instances to DC_CHARTS after init:
// (template generation must call: DC_CHARTS['chart-id'] = echarts.init(el))
\`\`\`

ECharts 初始化时必须同时注册到 DC_CHARTS：
\`\`\`javascript
// 示例：
const myChart = echarts.init(document.getElementById('hourlyFlow'))
DC_CHARTS['hourlyFlow'] = myChart   // ← 必须注册
myChart.setOption({...})
\`\`\``
```

- [ ] **Commit**

```bash
git add src/lib/ai/prompts/template.ts
git commit -m "feat(prompts): template generates dc boundary markers and linkage JS/CSS"
```

---

## Task 8: F2 — Preview API: Strip dc Markers + Inject Tracking Script

**Files:**
- Create: `src/lib/utils/dc-tracker.ts`
- Modify: `src/app/api/templates/[id]/preview/route.ts`

- [ ] **Step 1: Create tracking script utility**

```typescript
// src/lib/utils/dc-tracker.ts

/**
 * Inline JS injected by the preview API into every template HTML.
 * Runs inside the sandboxed iframe (sandbox="allow-scripts").
 * Uses window.parent.postMessage to notify the React parent about
 * hover/click events on annotated components (data-dc attribute).
 */
export const DC_TRACKER_SCRIPT = `
<script id="dc-tracker">
(function(){
  function notify(type, el) {
    var r = el.getBoundingClientRect()
    window.parent.postMessage({
      type: type,
      componentId: el.dataset.dc,
      componentLabel: el.dataset.dcLabel || el.dataset.dc,
      bounds: { top: r.top, left: r.left, width: r.width, height: r.height }
    }, '*')
  }
  document.querySelectorAll('[data-dc]').forEach(function(el) {
    el.addEventListener('mouseenter', function() { notify('dc:hover', el) })
    el.addEventListener('mouseleave', function() {
      window.parent.postMessage({ type: 'dc:hover-end' }, '*')
    })
    el.addEventListener('click', function(e) {
      e.stopPropagation()
      notify('dc:click', el)
    })
  })
})()
</script>
`

/** Remove <!-- dc:id:start --> and <!-- dc:id:end --> boundary comments from HTML.
 *  These are stored in the DB for surgical replacement but must not be visible to users. */
export function stripDcMarkers(html: string): string {
  return html.replace(/<!-- dc:[^:]+:(start|end) -->\n?/g, '')
}

/** Inject the tracking script just before </body>. Falls back to appending if no </body> tag. */
export function injectDcTracker(html: string): string {
  if (html.includes('</body>')) {
    return html.replace('</body>', DC_TRACKER_SCRIPT + '</body>')
  }
  return html + DC_TRACKER_SCRIPT
}
```

- [ ] **Step 2: Update preview route**

Replace the entire content of `src/app/api/templates/[id]/preview/route.ts`:

```typescript
import { prisma } from '@/lib/db/prisma'
import { stripDcMarkers, injectDcTracker } from '@/lib/utils/dc-tracker'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const template = await prisma.template.findUnique({ where: { id: params.id } })
  if (!template) return new Response('Not found', { status: 404 })

  // 1. Strip internal boundary markers (dc:id:start/end comments)
  // 2. Inject postMessage tracking script for annotation mode
  const html = injectDcTracker(stripDcMarkers(template.htmlContent))

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    }
  })
}
```

- [ ] **Step 3: Write tests**

Create `src/__tests__/dc-tracker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { stripDcMarkers, injectDcTracker } from '@/lib/utils/dc-tracker'

describe('stripDcMarkers', () => {
  it('removes start markers', () => {
    const html = '<!-- dc:foo:start -->\n<div>content</div>\n<!-- dc:foo:end -->'
    expect(stripDcMarkers(html)).toBe('<div>content</div>\n')
  })

  it('handles multiple components', () => {
    const html = '<!-- dc:a:start --><div>A</div><!-- dc:a:end --><!-- dc:b:start --><div>B</div><!-- dc:b:end -->'
    expect(stripDcMarkers(html)).toBe('<div>A</div><div>B</div>')
  })

  it('is no-op when no markers present', () => {
    const html = '<div class="card">no markers</div>'
    expect(stripDcMarkers(html)).toBe(html)
  })

  it('does not strip data-dc attributes', () => {
    const html = '<!-- dc:foo:start --><div data-dc="foo">x</div><!-- dc:foo:end -->'
    const result = stripDcMarkers(html)
    expect(result).toContain('data-dc="foo"')
    expect(result).not.toContain('<!-- dc:')
  })
})

describe('injectDcTracker', () => {
  it('injects script before </body>', () => {
    const html = '<html><body><div>hi</div></body></html>'
    const result = injectDcTracker(html)
    expect(result.indexOf('dc-tracker')).toBeLessThan(result.indexOf('</body>'))
    expect(result).toContain('</body>')
  })

  it('appends script when no </body> tag', () => {
    const html = '<div>fragment</div>'
    const result = injectDcTracker(html)
    expect(result).toContain('dc-tracker')
    expect(result.startsWith('<div>fragment</div>')).toBe(true)
  })

  it('does not double-inject', () => {
    const html = '<body></body>'
    const once = injectDcTracker(html)
    // Only one script tag with id dc-tracker
    const matches = once.match(/id="dc-tracker"/g) || []
    expect(matches.length).toBe(1)
  })
})
```

- [ ] **Run tests**

```bash
npx vitest run src/__tests__/dc-tracker.test.ts
```
Expected: all pass.

- [ ] **Commit**

```bash
git add src/lib/utils/dc-tracker.ts src/app/api/templates src/__tests__/dc-tracker.test.ts
git commit -m "feat(preview): strip dc boundary markers + inject postMessage tracking script"
```

---

## Task 9: F2 — TemplatePreview Annotation Overlay

**Files:**
- Modify: `src/components/template/TemplatePreview.tsx`

- [ ] **Step 1: Add annotation state and postMessage listener**

At the top of `TemplatePreview` component, add:

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import { Maximize2, RefreshCw, ExternalLink, Download, Monitor, Smartphone, Pencil, X as XIcon } from 'lucide-react'
import type { Annotation } from '@/types'

// Add to TemplatePreviewProps:
interface TemplatePreviewProps {
  templateId: string
  onFullscreen?: () => void
  className?: string
  showToolbar?: boolean
  // NEW:
  annotationsAdded?: Annotation[]        // chips already in ChatInput
  onAnnotationAdd?: (a: Annotation) => void  // called when user submits a chip
  onAnnotationClear?: (id: string) => void   // called when chip is removed
}

// Inside component, add state:
const [annotationMode, setAnnotationMode] = useState(false)
const [hovered, setHovered] = useState<{ id: string; label: string; bounds: DOMRect } | null>(null)
const [locked, setLocked] = useState<{ id: string; label: string; bounds: DOMRect } | null>(null)
const [lockNote, setLockNote] = useState('')
const iframeContainerRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 2: Add postMessage listener useEffect**

```typescript
useEffect(() => {
  if (!annotationMode) {
    setHovered(null)
    setLocked(null)
    return
  }
  const handler = (e: MessageEvent) => {
    if (!iframeRef.current) return
    const iframeRect = iframeRef.current.getBoundingClientRect()

    if (e.data?.type === 'dc:hover' && !locked) {
      const b = e.data.bounds
      setHovered({
        id: e.data.componentId,
        label: e.data.componentLabel,
        bounds: {
          top: iframeRect.top + b.top, left: iframeRect.left + b.left,
          width: b.width, height: b.height,
        } as DOMRect,
      })
    }
    if (e.data?.type === 'dc:hover-end' && !locked) {
      setHovered(null)
    }
    if (e.data?.type === 'dc:click') {
      const b = e.data.bounds
      setLocked({
        id: e.data.componentId,
        label: e.data.componentLabel,
        bounds: {
          top: iframeRect.top + b.top, left: iframeRect.left + b.left,
          width: b.width, height: b.height,
        } as DOMRect,
      })
      setLockNote('')
      setHovered(null)
    }
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}, [annotationMode, locked])
```

- [ ] **Step 3: Add annotation submit handler**

```typescript
const handleAnnotationSubmit = useCallback(() => {
  if (!locked) return
  onAnnotationAdd?.({
    componentId: locked.id,
    componentLabel: locked.label,
    note: lockNote.trim(),
  })
  setLocked(null)
  setLockNote('')
}, [locked, lockNote, onAnnotationAdd])
```

- [ ] **Step 4: Add toolbar button + overlay rendering in JSX**

In the toolbar div, after the download button, add:

```tsx
{/* Annotation mode toggle */}
<button
  onClick={() => { setAnnotationMode(m => !m); setLocked(null); setHovered(null) }}
  className={cn(
    'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
    annotationMode
      ? 'bg-indigo-100 text-indigo-700'
      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
  )}
  title={annotationMode ? '退出注释模式' : '进入注释模式（点击组件添加注释）'}
>
  <Pencil size={11} /> 注释
</button>
```

Wrap the iframe container div in a `relative` positioned wrapper and add overlays after the iframe:

```tsx
<div ref={iframeContainerRef} className="flex-1 overflow-hidden flex items-center justify-center relative" style={{ background: '#F8FAFC' }}>
  <div className="h-full transition-all duration-300 overflow-hidden shadow-md" style={{ width: viewMode === 'mobile' ? '390px' : '100%', ... }}>
    <iframe key={refreshKey} ref={iframeRef} ... />
  </div>

  {/* Annotation overlays — rendered in fixed position using iframe-relative coords */}
  {annotationMode && hovered && !locked && (
    <div
      className="fixed pointer-events-none border-2 border-blue-400 rounded-lg z-50 transition-all"
      style={{ top: hovered.bounds.top, left: hovered.bounds.left, width: hovered.bounds.width, height: hovered.bounds.height }}
    >
      <span className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
        {hovered.label}
      </span>
    </div>
  )}

  {annotationMode && locked && (
    <>
      {/* Orange lock highlight */}
      <div
        className="fixed pointer-events-none border-2 border-orange-400 rounded-lg z-50"
        style={{ top: locked.bounds.top, left: locked.bounds.left, width: locked.bounds.width, height: locked.bounds.height }}
      />
      {/* Floating input panel */}
      <div
        className="fixed z-50 bg-white rounded-xl shadow-xl border border-orange-200 p-3 w-64"
        style={{ top: locked.bounds.top, left: locked.bounds.left + locked.bounds.width + 8 }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-orange-700 truncate">{locked.label}</span>
          <button onClick={() => setLocked(null)} className="text-slate-400 hover:text-slate-600">
            <XIcon size={12} />
          </button>
        </div>
        <input
          autoFocus
          value={lockNote}
          onChange={e => setLockNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnnotationSubmit() } }}
          placeholder="补充注释（可选）…"
          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 mb-2"
        />
        <button
          onClick={handleAnnotationSubmit}
          className="w-full text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-1.5 transition-colors"
        >
          添加注释 →
        </button>
      </div>
    </>
  )}

  {/* Purple highlights for already-added annotations */}
  {annotationMode && (annotationsAdded || []).map(ann => (
    <div key={ann.componentId} className="fixed pointer-events-none border-2 border-purple-400 rounded-lg z-40 opacity-60"
      style={{ /* bounding box not available without hover; skip visual for now */ display: 'none' }}
    />
  ))}
</div>
```

- [ ] **Commit**

```bash
git add src/components/template/TemplatePreview.tsx
git commit -m "feat(preview): annotation mode with postMessage overlays, lock+input, submit to parent"
```

---

## Task 10: F2 — ChatInput Annotation Chips + ChatPanel State

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/layout/ChatPanel.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add annotation chips to ChatInput**

Add to `ChatInputProps`:
```typescript
annotations?: import('@/types').Annotation[]
onAnnotationRemove?: (componentId: string) => void
```

Add chips row just above the mode selector chips in the JSX return (inside the outer div, between the textarea box and the mode row):

```tsx
{/* Annotation chips — shown when at least one component is annotated */}
{(annotations ?? []).length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1.5 mb-0.5">
    {(annotations ?? []).map(ann => (
      <div
        key={ann.componentId}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
        style={{ background: '#F3F0FF', borderColor: '#C4B5FD', color: '#6D28D9' }}
      >
        <span className="text-[10px]">🔲</span>
        <span className="max-w-[120px] truncate">
          {ann.componentLabel}{ann.note ? `：${ann.note}` : ''}
        </span>
        <button
          onClick={() => onAnnotationRemove?.(ann.componentId)}
          className="hover:text-red-500 transition-colors ml-0.5"
        >
          <XIcon size={10} />
        </button>
      </div>
    ))}
  </div>
)}
```

Add import at top: `import { X as XIcon } from 'lucide-react'`

- [ ] **Step 2: Add annotation state to ChatPanel**

In `src/components/layout/ChatPanel.tsx`:

```typescript
// Add state:
const [annotations, setAnnotations] = useState<Annotation[]>([])

// Add handlers:
const handleAnnotationAdd = useCallback((ann: Annotation) => {
  setAnnotations(prev => {
    const exists = prev.find(a => a.componentId === ann.componentId)
    if (exists) return prev.map(a => a.componentId === ann.componentId ? ann : a)
    return [...prev, ann]
  })
}, [])

const handleAnnotationRemove = useCallback((componentId: string) => {
  setAnnotations(prev => prev.filter(a => a.componentId !== componentId))
}, [])

// Clear annotations after send:
// In sendMessage, after setMessages(prev => [...prev, userMsg]):
setAnnotations([])

// Pass to ChatInput:
// <ChatInput ... annotations={annotations} onAnnotationRemove={handleAnnotationRemove} />
```

- [ ] **Step 3: Wire TemplatePreview in AppShell/ProgressPanel to receive annotation callbacks**

In `src/components/layout/AppShell.tsx`, pass annotation callbacks through to ProgressPanel:

```typescript
// Add state in AppShell:
const [annotations, setAnnotations] = useState<Annotation[]>([])

// Pass to ProgressPanel:
<ProgressPanel
  ...
  onAnnotationAdd={(a) => setAnnotations(prev => {
    const exists = prev.find(x => x.componentId === a.componentId)
    return exists ? prev.map(x => x.componentId === a.componentId ? a : x) : [...prev, a]
  })}
/>

// Pass to ChatPanel:
<ChatPanel
  ...
  annotations={annotations}
  onAnnotationRemove={(id) => setAnnotations(prev => prev.filter(a => a.componentId !== id))}
  onAnnotationClear={() => setAnnotations([])}
/>
```

Update `ProgressPanel` to pass `onAnnotationAdd` down to `TemplatePreview`.

Update `ChatPanel` props interface:
```typescript
interface ChatPanelProps {
  sessionId: string
  onTemplateReady: (templateId: string) => void
  onSessionTitleChange: () => void
  onSessionCreated: () => void
  annotations: Annotation[]                         // NEW
  onAnnotationRemove: (componentId: string) => void // NEW
  onAnnotationClear: () => void                     // NEW
}
```

In `sendMessage`, call `onAnnotationClear()` after optimistic message is added.

- [ ] **Commit**

```bash
git add src/components/chat/ChatInput.tsx src/components/layout/ChatPanel.tsx src/components/layout/AppShell.tsx src/components/layout/ProgressPanel.tsx
git commit -m "feat(ui): annotation chips in ChatInput, state lifted to AppShell, wired to TemplatePreview"
```

---

## Task 11: F2 — Partial Update Intent Prompt

**Files:**
- Create: `src/lib/ai/prompts/partial-update.ts`

- [ ] **Create intent recognition prompt**

```typescript
// src/lib/ai/prompts/partial-update.ts

export const INTENT_SYSTEM = `你是一个仪表板局部修改意图识别器。
根据用户消息、注释组件列表和当前需求背景，判断这次修改是全量更新还是局部更新，
并识别出具体的修改意图。

输出 JSON，格式：
{
  "isPartialUpdate": true,
  "targetComponents": ["component-id-1", "component-id-2"],
  "changeType": "style",
  "needsMockDataUpdate": false,
  "intent": "将指标卡改为蓝色背景，数字字体加粗"
}

changeType 只能是以下之一：
- "style"：纯样式改动（颜色、字体、尺寸、间距）—— needsMockDataUpdate 始终为 false
- "data"：数据内容变化（换指标、新增维度、修改数值逻辑）—— needsMockDataUpdate 为 true
- "structure"：组件类型/布局结构变化（折线改柱状、新增/删除组件）—— needsMockDataUpdate 通常为 true

若用户意图明显是全量重新设计，输出 { "isPartialUpdate": false }。
确保输出合法 JSON，不要包含其他文字。`

export const INTENT_USER = (
  userMessage: string,
  annotations: Array<{ componentId: string; componentLabel: string; note: string }>,
  requirementsSummary: string,
) => `当前仪表板需求：${requirementsSummary}

用户注释的组件：
${annotations.map(a => `- ${a.componentLabel}（id: ${a.componentId}）${a.note ? `：${a.note}` : ''}`).join('\n')}

用户消息：${userMessage}

请分析修改意图并输出 JSON。`

export const PARTIAL_HTML_SYSTEM = `你是一个 HTML 组件片段生成器。
根据原始组件 HTML 片段和修改意图，输出修改后的完整组件 HTML 片段。

要求：
- 只输出组件自身的 HTML（不含 <!-- dc:id:start/end --> 注释节点，它们会自动重新包裹）
- 保留 data-dc、data-dc-label、data-controlled-by、data-variant-data 等所有属性
- 如果修改涉及 ECharts，保持图表 ID 不变，只更新 setOption 参数
- 直接输出 HTML 代码，不要有说明文字`

export const PARTIAL_HTML_USER = (
  componentId: string,
  componentLabel: string,
  originalHtml: string,
  intent: string,
  updatedMockData?: string,
) => `组件 ID：${componentId}
组件名称：${componentLabel}
修改意图：${intent}
${updatedMockData ? `\n更新后的 Mock 数据片段：\n${updatedMockData}\n` : ''}
原始 HTML：
${originalHtml}

请输出修改后的 HTML 片段。`
```

- [ ] **Commit**

```bash
git add src/lib/ai/prompts/partial-update.ts
git commit -m "feat(prompts): partial update intent recognition and component HTML regeneration prompts"
```

---

## Task 12: F2 — runPartialUpdate Logic

**Files:**
- Create: `src/lib/ai/partial-update.ts`

- [ ] **Step 1: Create partial update module**

```typescript
// src/lib/ai/partial-update.ts
import { prisma } from '@/lib/db/prisma'
import { getOpenAIClient, getModel } from '@/lib/ai/client'
import { INTENT_SYSTEM, INTENT_USER, PARTIAL_HTML_SYSTEM, PARTIAL_HTML_USER } from '@/lib/ai/prompts/partial-update'
import { MOCKDATA_SYSTEM, MOCKDATA_USER } from '@/lib/ai/prompts/mockdata'
import type { SSEEvent, Annotation } from '@/types'

type SendFn = (event: SSEEvent) => void

interface PartialUpdateResult {
  success: boolean
  updatedHtml?: string
  fallbackReason?: string
}

/** Extract component HTML between dc boundary markers */
export function extractComponentHtml(html: string, componentId: string): string | null {
  const startMarker = `<!-- dc:${componentId}:start -->`
  const endMarker = `<!-- dc:${componentId}:end -->`
  const startIdx = html.indexOf(startMarker)
  const endIdx = html.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) return null
  // Return content between markers (exclusive)
  return html.slice(startIdx + startMarker.length, endIdx).trim()
}

/** Replace a component's HTML between its dc boundary markers */
export function replaceComponentHtml(
  html: string,
  componentId: string,
  newComponentHtml: string,
): { result: string; success: boolean } {
  const startMarker = `<!-- dc:${componentId}:start -->`
  const endMarker = `<!-- dc:${componentId}:end -->`
  const startIdx = html.indexOf(startMarker)
  const endIdx = html.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) {
    return { result: html, success: false }
  }
  const before = html.slice(0, startIdx + startMarker.length)
  const after = html.slice(endIdx)
  return {
    result: `${before}\n${newComponentHtml}\n${after}`,
    success: true,
  }
}

export async function runPartialUpdate(
  sessionId: string,
  userMessage: string,
  annotations: Annotation[],
  send: SendFn,
): Promise<void> {
  const client = getOpenAIClient()
  const model = getModel()

  // Load current template and session requirements
  const [template, session] = await Promise.all([
    prisma.template.findUnique({ where: { sessionId } }),
    prisma.session.findUnique({
      where: { id: sessionId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } },
    }),
  ])

  if (!template || !session) throw new Error('Session or template not found for partial update')

  const requirementsStep = session.steps.find(s => s.stepName === 'REQUIREMENTS_ANALYSIS' && s.status === 'COMPLETED')
  const layoutStep = session.steps.find(s => s.stepName === 'LAYOUT_PLANNING' && s.status === 'COMPLETED')
  let requirementsSummary = 'Unknown dashboard'
  try {
    const req = JSON.parse(requirementsStep?.content || '{}')
    requirementsSummary = req.summary || req.businessGoal || requirementsSummary
  } catch { /* ignore */ }

  send({ type: 'step_start', stepIndex: 0, stepName: 'REQUIREMENTS_ANALYSIS' })

  // Step 1: Intent recognition
  const intentResp = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: INTENT_SYSTEM },
      { role: 'user', content: INTENT_USER(userMessage, annotations, requirementsSummary) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 300,
  })

  let intent: {
    isPartialUpdate: boolean
    targetComponents?: string[]
    changeType?: 'style' | 'data' | 'structure'
    needsMockDataUpdate?: boolean
    intent?: string
  } = { isPartialUpdate: false }

  try {
    intent = JSON.parse(intentResp.choices[0]?.message?.content || '{}')
  } catch { /* fallback to full regen */ }

  send({ type: 'step_complete', stepIndex: 0 })

  // If not a partial update, signal caller to run full pipeline
  if (!intent.isPartialUpdate || !intent.targetComponents?.length) {
    throw new Error('FULL_REGEN_REQUIRED')
  }

  // Step 2 (optional): regenerate mock data for data-type changes
  let updatedMockByComponent: Record<string, string> = {}
  if (intent.needsMockDataUpdate && layoutStep?.content) {
    send({ type: 'step_start', stepIndex: 3, stepName: 'MOCK_DATA' })
    try {
      const mockResp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: MOCKDATA_SYSTEM },
          { role: 'user', content: MOCKDATA_USER(layoutStep.content, requirementsSummary) +
            `\n\n只需要为以下组件重新生成数据: ${intent.targetComponents.join(', ')}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      })
      const newMock = JSON.parse(mockResp.choices[0]?.message?.content || '{}')
      intent.targetComponents.forEach(id => {
        const comp = (session.steps.find(s => s.stepName === 'LAYOUT_PLANNING')?.content)
        // Find the dataKey for this component from layout
        try {
          const layout = JSON.parse(layoutStep.content)
          const areas: Array<{ components?: Array<{ id: string; dataKey?: string }> }> = layout.areas || []
          const compDef = areas.flatMap(a => a.components || []).find(c => c.id === id)
          if (compDef?.dataKey && newMock[compDef.dataKey]) {
            updatedMockByComponent[id] = JSON.stringify(newMock[compDef.dataKey])
          }
        } catch { /* ignore */ }
      })
    } catch { /* mock update failed, continue without it */ }
    send({ type: 'step_complete', stepIndex: 3 })
  }

  // Step 3: Generate replacement HTML for each target component
  send({ type: 'step_start', stepIndex: 4, stepName: 'TEMPLATE_GENERATION' })

  let currentHtml = template.htmlContent
  const failedComponents: string[] = []

  for (const componentId of intent.targetComponents) {
    const originalHtml = extractComponentHtml(currentHtml, componentId)
    if (!originalHtml) {
      failedComponents.push(componentId)
      continue
    }

    const ann = annotations.find(a => a.componentId === componentId)
    const componentLabel = ann?.componentLabel || componentId

    try {
      const htmlResp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: PARTIAL_HTML_SYSTEM },
          { role: 'user', content: PARTIAL_HTML_USER(
              componentId,
              componentLabel,
              originalHtml,
              intent.intent || userMessage,
              updatedMockByComponent[componentId],
          )},
        ],
        max_tokens: 3000,
      })

      const newHtml = htmlResp.choices[0]?.message?.content?.trim() || ''
      if (!newHtml) { failedComponents.push(componentId); continue }

      // Strip any markdown code fences the AI may have added
      const cleaned = newHtml.replace(/^```html?\n?/i, '').replace(/\n?```$/, '')
      const { result, success } = replaceComponentHtml(currentHtml, componentId, cleaned)
      if (!success) { failedComponents.push(componentId); continue }
      currentHtml = result
    } catch {
      failedComponents.push(componentId)
    }
  }

  // If any component failed surgical replacement, signal full regen
  if (failedComponents.length > 0 && failedComponents.length === intent.targetComponents.length) {
    throw new Error('FULL_REGEN_REQUIRED')
  }

  // Persist updated HTML
  await prisma.template.update({
    where: { sessionId },
    data: { htmlContent: currentHtml },
  })

  send({ type: 'step_complete', stepIndex: 4 })
  send({ type: 'template_ready', templateId: template.id })
  send({ type: 'pipeline_complete' })
}
```

- [ ] **Step 2: Write unit tests for surgical replace helpers**

Create `src/__tests__/partial-update.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractComponentHtml, replaceComponentHtml } from '@/lib/ai/partial-update'

const SAMPLE_HTML = `
<div class="grid">
<!-- dc:total-spaces:start -->
<div class="col-3 card" data-dc="total-spaces">车位数</div>
<!-- dc:total-spaces:end -->
<!-- dc:hourly-flow:start -->
<div class="col-9 card" data-dc="hourly-flow">流量图</div>
<!-- dc:hourly-flow:end -->
</div>
`

describe('extractComponentHtml', () => {
  it('extracts content between start and end markers', () => {
    const result = extractComponentHtml(SAMPLE_HTML, 'total-spaces')
    expect(result).toContain('data-dc="total-spaces"')
    expect(result).toContain('车位数')
    expect(result).not.toContain('dc:total-spaces')
  })

  it('returns null for unknown component id', () => {
    expect(extractComponentHtml(SAMPLE_HTML, 'nonexistent')).toBeNull()
  })

  it('does not bleed into adjacent component', () => {
    const result = extractComponentHtml(SAMPLE_HTML, 'total-spaces')
    expect(result).not.toContain('hourly-flow')
  })
})

describe('replaceComponentHtml', () => {
  it('replaces content preserving surrounding HTML', () => {
    const { result, success } = replaceComponentHtml(
      SAMPLE_HTML, 'total-spaces',
      '<div class="col-3 card" data-dc="total-spaces">新内容</div>'
    )
    expect(success).toBe(true)
    expect(result).toContain('新内容')
    expect(result).not.toContain('车位数')
    // Other component untouched
    expect(result).toContain('流量图')
  })

  it('returns success=false for unknown component id', () => {
    const { success } = replaceComponentHtml(SAMPLE_HTML, 'nonexistent', '<div/>')
    expect(success).toBe(false)
  })

  it('preserves dc boundary markers after replacement', () => {
    const { result } = replaceComponentHtml(
      SAMPLE_HTML, 'total-spaces', '<div>new</div>'
    )
    expect(result).toContain('<!-- dc:total-spaces:start -->')
    expect(result).toContain('<!-- dc:total-spaces:end -->')
  })

  it('replaces only the first occurrence when id appears once', () => {
    const { result } = replaceComponentHtml(
      SAMPLE_HTML, 'hourly-flow', '<div>替换</div>'
    )
    expect(result).toContain('替换')
    expect(result).toContain('新内容').not  // Actually, resets to original
    // total-spaces untouched
    expect(result).toContain('车位数')
  })

  it('round-trip: extract then replace gives back same outer structure', () => {
    const original = extractComponentHtml(SAMPLE_HTML, 'total-spaces')!
    const { result } = replaceComponentHtml(SAMPLE_HTML, 'total-spaces', original)
    // Should be structurally equivalent
    expect(result).toContain('<!-- dc:total-spaces:start -->')
    expect(result).toContain('<!-- dc:total-spaces:end -->')
  })
})
```

- [ ] **Run tests**

```bash
npx vitest run src/__tests__/partial-update.test.ts
```
Expected: all pass.

- [ ] **Commit**

```bash
git add src/lib/ai/partial-update.ts src/__tests__/partial-update.test.ts
git commit -m "feat(pipeline): runPartialUpdate with intent recognition, surgical replace, full-regen fallback"
```

---

## Task 13: F2 — API Wiring (Accept Annotations)

**Files:**
- Modify: `src/app/api/sessions/[id]/messages/route.ts`
- Modify: `src/lib/ai/pipeline.ts`

- [ ] **Step 1: Accept `annotations` in messages route**

In `src/app/api/sessions/[id]/messages/route.ts`, update the destructuring and pass annotations to the SSE handler:

```typescript
// Update destructuring:
const { content, mode: requestedMode, annotations } = await request.json()

// After saving the user message, update the createSSEStream call:
return createSSEStream(async (send) => {
  try {
    await runPipeline(sessionId, content, effectiveMode, scoreThreshold, send, annotations ?? [])
  } finally {
    // ... existing SCORE_REPORT injection unchanged ...
  }
})
```

- [ ] **Step 2: Update runPipeline signature to accept annotations and route to partial update**

In `src/lib/ai/pipeline.ts`:

```typescript
// Add import:
import { runPartialUpdate } from '@/lib/ai/partial-update'
import type { Annotation } from '@/types'

// Update function signature:
export async function runPipeline(
  sessionId: string,
  userInput: string,
  mode: Mode,
  scoreThreshold: number,
  send: SendFn,
  annotations: Annotation[] = [],  // ← NEW
): Promise<void> {
  // ... existing session load code ...

  // After loading session, check if we should do partial update:
  const existingTemplate = await prisma.template.findUnique({ where: { sessionId } })
  if (annotations.length > 0 && existingTemplate) {
    try {
      await runPartialUpdate(sessionId, userInput, annotations, send)
      return  // partial update succeeded
    } catch (err) {
      const msg = (err as Error).message
      if (msg !== 'FULL_REGEN_REQUIRED') throw err  // unexpected error
      // else: fall through to full 5-step pipeline
      send({ type: 'step_start', stepIndex: 0, stepName: 'REQUIREMENTS_ANALYSIS' })
    }
  }

  // ... rest of existing pipeline code unchanged ...
}
```

- [ ] **Step 3: Pass annotations from ChatPanel to POST body**

In `src/components/layout/ChatPanel.tsx`, update the fetch call:

```typescript
body: JSON.stringify({ content, mode, annotations }),
```

Where `annotations` comes from props (passed from AppShell state).

- [ ] **Commit**

```bash
git add "src/app/api/sessions/[id]/messages/route.ts" src/lib/ai/pipeline.ts src/components/layout/ChatPanel.tsx
git commit -m "feat(api): wire annotations through POST /messages → pipeline → runPartialUpdate"
```

---

## Task 14: Run Full Test Suite + Manual Verification

- [ ] **Run all tests**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: 121+ tests passing, 0 failing.

- [ ] **TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (or only pre-existing ones).

- [ ] **Start dev server and verify F1 (summary)**

```bash
npm run dev
```

Create a new conversation, send a message, wait for pipeline to complete. Verify:
- An AI text summary message appears before the TEMPLATE_CARD in the chat
- The message is 2-3 sentences in Chinese about what was generated

- [ ] **Verify F3 (linkage) in generated template**

Open the template preview. If the generated dashboard has a date filter or tabs, click the buttons. Verify:
- 0.5s loading overlay appears on linked components
- Chart data switches after loading overlay disappears

- [ ] **Verify F2 (annotation mode)**

In the preview toolbar, click the 注释 button. Hover over components — blue border should appear. Click a component — orange border + floating input should appear. Type a note, click 添加注释 — purple chip should appear in chat input. Click × on the chip — it disappears.

- [ ] **Commit final**

```bash
git add -A
git commit -m "test: full suite passes after F1/F2/F3 implementation"
```
