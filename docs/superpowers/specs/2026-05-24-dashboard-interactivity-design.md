# Dashboard Agent — 三大交互功能设计文档

**日期**: 2026-05-24  
**状态**: 已批准，进入实现

---

## 功能概览

| 功能 | 描述 | 影响层 |
|------|------|--------|
| F1: 总结语 | 模板卡片前输出一段 AI 总结 | Pipeline SSE + ChatPanel |
| F2: 组件注释局部调整 | 在预览里点击组件注释，发送后按需跳步只改指定组件 | 全栈：前端覆盖层 + API + Pipeline |
| F3: 组件联动 | tab/筛选器控制其他组件做数据切换+假loading | Layout + MockData + Template 生成 |

---

## F1: 总结语（Summary Before Template Card）

### 设计

pipeline 在 `template_ready` 事件之前，新增一个轻量 LLM 调用，生成 2-3 句中文总结。

**SSE 事件顺序**：
```
... step_complete(4) → template_summary(text) → template_ready(templateId) → pipeline_complete
```

**新增 SSE 事件类型**：
```typescript
{ type: 'template_summary', text: string }
```

**总结生成输入**：
- `requirements.summary`（需求分析 JSON 的 summary 字段）
- 已生成的组件列表（从 layout JSON 提取）
- 模板评分

**前端**：ChatPanel 收到 `template_summary` 时，在消息列表插入 ASSISTANT TEXT 消息；收到 `template_ready` 时插入 TEMPLATE_CARD。

---

## F2: 组件注释 + 局部调整

### 2-A: HTML 边界标记（生成时注入）

每个 top-level 组件用注释包裹，data 属性供追踪脚本，注释节点供外科替换：

```html
<!-- dc:total-spaces:start -->
<div class="col-3 card" data-dc="total-spaces" data-dc-label="总车位数">
  <!-- 内容 -->
</div>
<!-- dc:total-spaces:end -->
```

TEMPLATE_GENERATION prompt 新增要求：每个顶层组件 div 必须带 `data-dc` 和 `data-dc-label`，并用 `<!-- dc:id:start/end -->` 包裹。

### 2-B: 预览 API 注入追踪脚本

`/api/templates/[id]/preview` 在 serve HTML 前：
1. 剥除 `<!-- dc:xxx:start/end -->` 注释节点（字符串替换）
2. 保留 `data-dc / data-dc-label` 属性
3. 在 `</body>` 前注入追踪脚本

**追踪脚本**（约 30 行，内联注入）：
```javascript
(function(){
  document.querySelectorAll('[data-dc]').forEach(el => {
    el.addEventListener('mouseenter', () =>
      window.parent.postMessage({ type:'dc:hover', id:el.dataset.dc, label:el.dataset.dcLabel,
        bounds:el.getBoundingClientRect() }, '*'))
    el.addEventListener('mouseleave', () =>
      window.parent.postMessage({ type:'dc:hover-end' }, '*'))
    el.addEventListener('click', e => {
      e.stopPropagation()
      window.parent.postMessage({ type:'dc:click', id:el.dataset.dc, label:el.dataset.dcLabel,
        bounds:el.getBoundingClientRect() }, '*')
    })
  })
})()
```

### 2-C: 注释覆盖层（TemplatePreview 改造）

**新增状态**：
```typescript
annotationMode: boolean
hoveredComponent: { id, label, bounds } | null
lockedComponent: { id, label, bounds } | null   // 同时最多一个待输入
annotatedComponents: Map<string, { id, label, note }>  // 已添加到 chips 的
```

**工具栏**：新增铅笔图标按钮，点击切换 `annotationMode`。

**覆盖层渲染**（绝对定位在 iframe 上方）：
- `hoveredComponent`：蓝色边框 + 名称标签
- `lockedComponent`：橙色边框 + 浮动输入框（可选填注释文字）+ 「添加」按钮
- `annotatedComponents` 中的组件：紫色边框（已注释）

**坐标换算**：`bounds`（iframe 内坐标）+ `iframeRef.getBoundingClientRect()` 偏移。

### 2-D: ChatInput Annotation Chips

**新增 Props**：
```typescript
annotations: Annotation[]           // [{ componentId, componentLabel, note }]
onAnnotationRemove: (id: string) => void
```

**渲染位置**：mode chips 上方，仅在 `annotations.length > 0` 时显示：

```
[🔲 总车位数 ×]  [🔲 每小时流量: 改成折线图 ×]
──────────────────────────────────────────────
[快速] [深思] [专家]      Enter 发送 · Shift+Enter 换行
```

点击 ×：删除 chip，通知 TemplatePreview 清除该组件紫色状态。

### 2-E: 局部更新 Pipeline（按需跳步）

**API**：`POST /api/sessions/[id]/messages` 新增 `annotations: Annotation[]` 字段。

**`runPartialUpdate()` 流程**：
```
1. 意图识别（新增 prompt，1次 LLM 调用）
   输入: userMessage + annotations + 当前 requirements
   输出: {
     isPartialUpdate: boolean,
     targetComponents: string[],   // component id 列表
     changeType: 'style' | 'data' | 'structure',
     needsMockDataUpdate: boolean,
     intent: string
   }

2a. 若 needsMockDataUpdate: 只对 targetComponents 重新生成 Mock 数据片段
2b. 生成各 targetComponent 的替换 HTML 片段

3. 外科手术替换
   - 按 <!-- dc:id:start --> 和 <!-- dc:id:end --> 定位
   - 替换 innerContent
   - 若正则匹配失败 → 进入 fallback

Fallback: 全量 TEMPLATE_GENERATION
   - 带约束 prompt: "只修改 [组件列表]，其他组件 HTML 和 mock 数据保持原样"
   - 替换整个 Template.htmlContent
```

**判断入口**（pipeline.ts）：
```typescript
if (annotations?.length > 0 && existingTemplate) {
  return runPartialUpdate(...)
}
// 否则走正常 5 步 pipeline
```

---

## F3: 组件联动（Interactivity & Linkage）

### 3-A: Layout 规划层变更

Layout planner prompt 新增：遇到 `date_filter`、`dropdown_filter`、`tabs` 类型组件时，分析 dashboard 中哪些图表/数据组件会受其控制，在该组件的 JSON 里添加：

```json
{
  "id": "time-filter",
  "type": "date_filter",
  "controls": ["hourly-flow", "peak-chart", "daily-summary"],
  "variants": ["day", "week", "month"]
}
```

被控制组件添加：
```json
{
  "id": "hourly-flow",
  "type": "line_chart",
  "controlledBy": "time-filter",
  "variantLabels": { "day": "按天", "week": "按周", "month": "按月" }
}
```

### 3-B: MockData 层变更

MockData prompt：若发现组件有 `controlledBy` 字段，生成多个 variants：

```json
{
  "hourlyFlow": {
    "day":   { "labels": ["0时","1时",...,"23时"], "values": [12,8,...] },
    "week":  { "labels": ["周一","周二",...,"周日"], "values": [234,...] },
    "month": { "labels": ["1日","2日",...,"31日"], "values": [789,...] }
  }
}
```

### 3-C: Template 生成层变更

TEMPLATE_SYSTEM prompt 新增联动规格，生成时：

1. **筛选器/Tab 组件**添加 `data-controls="id1,id2"` 和 `data-variants="day,week,month"` 属性，渲染为 segmented button group
2. **被控制组件**的 `data-variant-data` 属性嵌入完整 JSON（各 variant 数据），`data-controlled-by="filter-id"`
3. **注入联动 JS**：
```javascript
const DC_CHARTS = {}  // echarts 实例注册表
function dcSwitch(controllerId, variant) {
  document.querySelectorAll(`[data-controlled-by="${controllerId}"]`).forEach(el => {
    el.classList.add('dc-loading')
    setTimeout(() => {
      el.classList.remove('dc-loading')
      const data = JSON.parse(el.dataset.variantData)[variant]
      const chart = DC_CHARTS[el.id]
      if (chart) chart.setOption({ xAxis:{data:data.labels}, series:[{data:data.values}] })
    }, 500)
  })
}
```

4. **Loading CSS**（注入到 `<style>`）：
```css
.dc-loading { position:relative; pointer-events:none; }
.dc-loading::after {
  content:''; position:absolute; inset:0; border-radius:var(--radius);
  background:rgba(255,255,255,0.75);
  animation:dc-pulse 0.5s ease-in-out forwards;
}
@keyframes dc-pulse { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0.8} }
```

---

## 数据模型变更

### Template.components（Prisma JSON 字段）

由目前的 `[]` 改为存储组件注册表，供注释覆盖层使用：
```json
[
  { "id": "total-spaces", "label": "总车位数", "type": "metric_card" },
  { "id": "hourly-flow",  "label": "每小时流量", "type": "line_chart",
    "controlledBy": "time-filter" }
]
```

### 新增 SSEEvent 类型

```typescript
| { type: 'template_summary'; text: string }
```

---

## 实现顺序建议

1. **F1**（最简）：SSE 事件 → pipeline 总结调用 → ChatPanel 处理
2. **F3-Layout/Mock**：layout + mockdata prompt 改造，模板联动 JS 注入
3. **F2-边界标记**：template prompt 注入 dc 标记 + preview API 剥除/注入追踪脚本
4. **F2-前端覆盖层**：TemplatePreview 改造 + postMessage 处理
5. **F2-ChatInput chips**：Annotation 类型 + chips 渲染
6. **F2-局部更新 Pipeline**：runPartialUpdate + 意图识别 + 外科替换 + fallback

---

## 风险与注意事项

- iframe `sandbox="allow-scripts"` 允许 `window.parent.postMessage`，无需修改 sandbox 策略
- `data-variant-data` 可能非常大（多维度 × 多 variants），考虑对大模板限制 variant 数量≤3
- 外科替换依赖 `<!-- dc:id:start/end -->` 注释节点精确匹配，prompt 必须强制要求 AI 不省略这些标记
- 联动 JS 只处理 ECharts 图表，非图表组件（metric_card、table）的 variant 切换需要独立渲染逻辑
