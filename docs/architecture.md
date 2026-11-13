# 前端架构与调整入口

本项目继续使用 React、Zustand、Radix UI 和 Tailwind，不引入第二套框架或通用插件系统。拆分以独立变化的职责为边界，避免只是把一个长文件切成相互依赖的碎片。

## 数据到界面的流向

```text
utils/api + utils/rpc
        ↓
utils/init → stores/nodes（实时状态）+ stores/app（配置与已保存偏好）
        ↓
hooks（筛选、统计、请求生命周期）
        ↓
views（页面组合）→ components（独立界面区域）→ components/ui（基础交互）
```

- `utils` 不依赖 React，负责数据规则、格式化和图表配置转换。
- `hooks` 负责订阅和有生命周期的工作，清理定时器、监听和过期请求。派生数据直接计算，不镜像到 state。
- `views` 负责路由与页面组合。页面内的筛选、弹窗和业务区域不继续堆进 view。
- `components/ui` 不读取节点 store，不包含流量、费用等业务规则。
- `components/home`、`components/nodes`、`components/overview` 分别封装首页操作、节点卡片内部区域和概览，不互相导入。

## 常见调整入口

| 要调整的内容                   | 入口                                                               |
| ------------------------------ | ------------------------------------------------------------------ |
| 首页区域顺序                   | `src/views/HomeView.tsx`                                           |
| 分组、搜索、视图按钮及窄屏布局 | `src/components/home/NodeToolbar.tsx`                              |
| 搜索字段、匹配规则             | `src/utils/nodeSearch.ts`                                          |
| 分组过滤、离线置后、视图断点   | `src/hooks/useHomeNodes.ts`                                        |
| 首页滚动恢复                   | `src/hooks/useHomeScrollRestoration.ts`                            |
| 卡片网格、空结果、入场动画     | `src/components/home/NodeResults.tsx`                              |
| 延迟弹窗布局                   | `src/components/home/NodePingDialog.tsx`                           |
| 节点标题、在线时长、费用、标签 | `src/components/NodeCard.tsx`                                      |
| CPU / 内存 / 硬盘 / 流量       | `src/components/nodes/NodeResourceMetrics.tsx`                     |
| 实时与累计上下行               | `src/components/nodes/NodeNetworkMetrics.tsx`                      |
| 卡片延迟、丢包展示             | `src/components/nodes/NodePingSummary.tsx`                         |
| 延迟统计、线路归组、阈值       | `src/hooks/useNodePingStats.ts`、`src/hooks/useNodePingDisplay.ts` |
| 列表排序                       | `src/utils/nodeSort.ts`                                            |
| 地球连线几何与退化端点过滤     | `src/utils/globeGeometry.ts`                                       |
| 地球按帧时间积分、惯性与阻尼   | `src/utils/globeMotion.ts`                                         |
| 概览布局、地球 / 地图占位      | `src/components/NodeGeneralCards.tsx`                              |
| 概览统计和单位                 | `src/hooks/useNodeOverview.ts`                                     |
| 概览卡统一外观                 | `src/components/overview/OverviewMetricCard.tsx`                   |
| 费用 / 汇率弹层                | `src/components/overview/OverviewFinanceCard.tsx`                  |
| 负载请求、轮询、GPU 温度       | `src/hooks/useLoadRecords.ts`                                      |
| 负载图曲线、坐标轴、提示内容   | `src/utils/charts/loadChartOptions.ts`                             |
| 负载图卡片布局                 | `src/components/LoadChart.tsx`                                     |
| 延迟图请求与任务选择生命周期   | `src/hooks/usePingChartData.ts`                                    |
| 延迟图曲线和任务筛选 UI        | `src/components/PingChart.tsx`                                     |
| 可滚动标签与选中项自动显露     | `src/components/ui/tabs/scrollable-tabs-list.tsx`                  |
| 页面顶栏、底部浮层             | `src/components/Header.tsx`、`Footer.tsx`、`VisitorInfoCard.tsx`   |
| 主题色与全局排版               | `src/styles/main.css`                                              |

## 必须保留的边界

- 实时状态仍由 `utils/init` 统一管理，不让每张节点卡新开连接。
- 卡片和列表共享延迟统计，拆分不能重复拉取记录。
- 主页面、节点卡、列表、图表与地理可视化维持延迟加载；拆分时不在入口导入 ECharts 或地球实现。
- 分组内容与节点使用稳定身份，不以分组名重新挂载整张结果区。退出分组的节点可卸载，仍需显示的节点保留 DOM 和订阅；只有新出现的节点进入动画。
- 首页通过 React Activity 保留状态。分组、搜索和滚动不能因详情页往返而丢失。
- 地球动画只在尺寸变化时重设 WebGL 绘图缓冲区；角速度按真实帧间隔计算，停止、离屏及后台时释放动画循环。
- 负载轮询串行执行；节点或范围变化时旧响应不能写回新视图。
- 圆角曲线统一在 `styles/main.css` 的 `--surface-corner-shape` 与条件样式中维护；完整圆形保持圆形。原生 `corner-shape` 不支持时保留 `border-radius`，不要逐组件塞入裁剪补丁。
- 分组和时间范围使用 Radix Tabs 的键盘模型；不额外叠加另一套焦点管理。搜索和视图切换不放进 tablist。
- 访客信息展开使用 CSS grid 行高过渡，摘要决定宽度；隐藏详情同时设置 aria-hidden 和 inert。
- 图表弹窗保留节点身份至退场动画结束后清理，打开和退场期间暂停地球；图表懒加载提供固定最小高度的占位。减少动态效果时仍保留短淡出，以完成清理生命周期。
- 弹层通过 Radix Portal 处理碰撞和焦点；不再根据某张概览卡的百分比宽度手工定位浮层。
- 保留原有 localStorage 键、主题设置 schema 和打包契约。

## 验证方式

根目录运行 `bun run lint:check` 和 `bun run build`。交互检查至少覆盖 320 / 390 / 768 / 1024px、卡片与列表、双栈与单栈、分组与搜索、详情往返、弹层与深浅色。

没有测试套件；不添加复述 JSX 的快照测试。数据规则的实质调整可用独立断言或适当的专项测试验证。UI 验证必须区分模拟数据与真实面板验收。
