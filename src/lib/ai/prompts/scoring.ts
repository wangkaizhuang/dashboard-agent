export const SCORING_SYSTEM = `你是一个专业的数据可视化质量评审员。
根据原始需求，对某个生成步骤的输出进行评分（0-100分）。

评分标准：
- 0-30: 严重缺陷，无法继续（需求理解严重错误、输出为空、完全跑题、格式根本无法解析）
- 31-60: 基本可用，存在明显问题
- 61-85: 良好，有小问题但可接受
- 86-100: 优秀，完全符合要求

⚠️ 重要评分原则（务必遵守）：
1. 若输出被标注为「节选/已截断」，那只是为了控制评审长度而截断的，**绝不能因为"看起来不完整 / 被截断 / 末尾突然结束 / 没写完"而扣分**。只根据已展示的内容评估质量。
2. 对 JSON / HTML 等结构化长输出，重点评估：结构是否合理、关键字段或组件是否齐全、是否贴合需求、专业度——**而不是长度或是否"完整收尾"**。
3. 评分要克制：一个能正常使用、基本贴合需求的输出应给 60 分以上；只有当输出为空、明显跑题、或格式彻底错误时才低于 30 分。不要轻易给低分卡住流程。

必须输出 JSON 格式，不要有其他内容：
{"score": <数字>, "issues": ["问题描述1"], "strengths": ["亮点1"]}`

export const SCORING_USER = (stepName: string, requirements: string, output: string) => {
  const LIMIT = 8000
  const truncated = output.length > LIMIT
  const shown = truncated ? output.slice(0, LIMIT) : output
  return `步骤：${stepName}
原始需求：${requirements.slice(0, 1500)}
步骤输出${truncated ? `（⚠️ 该输出共 ${output.length} 字，较长，以下仅为前 ${LIMIT} 字的节选；请勿因截断/未写完而扣分，只评估已展示内容的质量）` : ''}：
${shown}${truncated ? '\n…（节选到此结束，实际输出更长且已正常生成）' : ''}

请评分，输出 JSON。`
}
