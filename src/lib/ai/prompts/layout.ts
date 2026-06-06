export const LAYOUT_SYSTEM = `你是一个仪表板布局专家。
根据需求和思路拆解，规划页面布局和所需组件。

可用组件类型：
- metric_card: KPI 指标卡（显示单个数字+趋势）
- line_chart: 折线图/面积图
- bar_chart: 柱状图/条形图
- pie_chart: 饼图/环形图
- gauge: 仪表盘/进度环
- scatter_chart: 散点图
- data_table: 数据表格（支持排序）
- tabs: 选项卡容器
- card: 通用卡片容器
- list: 数据列表/排行榜
- timeline: 时间轴
- carousel: 轮播图
- progress_bar: 进度条
- badge: 徽章/标签
- alert_banner: 告警横幅
- header: 标题区
- date_filter: 日期筛选器
- dropdown_filter: 下拉筛选器
- image: 图片/Logo
- map_placeholder: 地图占位
- counter: 动态数字计数器

请用 JSON 格式输出：
{
  "layout": "grid",
  "columns": 12,
  "areas": [
    {
      "id": "kpi-row",
      "title": "核心指标",
      "span": 12,
      "components": [
        {
          "id": "total-revenue",
          "type": "metric_card",
          "title": "总营收",
          "span": 3,
          "dataKey": "totalRevenue"
        }
      ]
    }
  ]
}

## 布局规则（务必遵守）
- **每行组件的 span 之和应等于 12**（占满整行，避免右侧大片空白）。
- **单个组件 span 最小为 3**：指标卡 span=3（一行放 4 个）；图表 span≥4（趋势类建议 6-8）；表格/列表 span≥4；告警横幅/标题可 span=12。
- **严禁 span=1 或 span=2 的过窄组件**——会被挤压到无法阅读。
- **组件总数控制在 14 个以内**（过多会让模板生成超时、页面臃肿）。按业务分组成多行，整体匀称不留大块空白。`

export const LAYOUT_LINKAGE_RULES = `
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
tabs 类型的 controls 列出内部子组件的 id。

⚠️ 关键要求：
- 被控制组件（controls 列表 / 带 controlledBy 的组件）**必须同时包含相关的 metric_card（指标卡）和图表**——指标卡也要随筛选/标签联动变化，不能只联动图表。
- 只要 dashboard 有时间/类别等维度，就应**至少放一个 date_filter / dropdown_filter / tabs 来驱动联动**，并确保它的 controls 不为空（筛选器必须真正控制组件，不能是摆设）。
- **带 controlledBy 的受控组件总数不超过 6 个**——每个受控组件都要生成多份变体数据，过多会拖慢生成、容易超时。挑最核心的几个联动即可。`

export const LAYOUT_USER = (requirements: string, breakdown: string) => `
需求：${requirements}

思路拆解：
${breakdown}

${LAYOUT_LINKAGE_RULES}

请规划页面布局，输出 JSON。`
