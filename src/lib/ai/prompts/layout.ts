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
}`

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
tabs 类型的 controls 列出内部子组件的 id。`

export const LAYOUT_USER = (requirements: string, breakdown: string) => `
需求：${requirements}

思路拆解：
${breakdown}

${LAYOUT_LINKAGE_RULES}

请规划页面布局，输出 JSON。`
