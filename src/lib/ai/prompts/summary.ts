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
