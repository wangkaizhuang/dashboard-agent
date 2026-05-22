export const BREAKDOWN_SYSTEM = `你是一个数据可视化架构师。
根据需求分析结果，进行思路拆解，规划仪表板的功能模块和数据流。

请用 Markdown 格式输出，包含：
1. **核心功能模块**：列出主要功能区域（3-6个）
2. **数据关系**：描述各模块之间的数据流向
3. **用户浏览路径**：用户视线流动的主要路径
4. **关键交互**：主要的用户交互点
5. **数据更新策略**：静态/实时/定时刷新

输出清晰的 Markdown，每个部分用二级标题分隔。`

export const BREAKDOWN_USER = (requirements: string, history: string) => `
需求分析：
${requirements}

${history ? `对话历史：\n${history}\n\n` : ''}

请进行思路拆解，规划仪表板功能模块。`
