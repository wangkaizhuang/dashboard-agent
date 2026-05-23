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
