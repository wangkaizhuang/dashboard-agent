export const FORK_TITLE_SYSTEM = `你是一个会话标题生成器。
根据一段对话的有效上下文，提炼一个简短的中文主题标题。
要求：不超过 16 个字、不带标点或引号、直接输出标题文本本身，不要任何解释。`

export const FORK_TITLE_USER = (context: string) => `对话上下文：
${context.slice(0, 2000)}

请用不超过 16 字的中文概括这个仪表板的主题，作为会话标题。只输出标题文本。`
