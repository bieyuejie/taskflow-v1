# 第五阶段验收记录

日期：2026-11-04（Asia/Shanghai）。结论：第五阶段通过。

本阶段按教学节奏完成全部页面懒加载、ECharts 按需注册；助手负责构建、实际资源请求、资源释放、同环境体积比较和完整业务回归。第六阶段交付发布尚未开始，本次未提交、推送、部署或标记版本。

## 范围与实现

- 遵守上级 AGENTS.md 和两份 V1 原文，在 `D:/Frontend/project.v1/taskflow.v1` 工作，未操作只读基线或 V2/V3。
- `src/router/index.js`：Login、TaskList、Kanban、Stats、Projects 全部通过动态 import 加载，沿用 hash 路由、base 和登录守卫。
- `src/utils/statsCharts.js`：使用 ECharts core，仅注册 PieChart、BarChart、TitleComponent、TooltipComponent、LegendComponent、GridComponent 和 CanvasRenderer。图表 DOM 接入、更新、ResizeObserver 与卸载销毁仍集中在该工具文件。
- 数据模型、API、存储键、统计规则、Element Plus 默认主题和尺寸不变。无新增或升级依赖，`package-lock.json` 未改动，`npm ls --depth=0` 通过。
- `scripts/measureBuild.mjs` 增加可选记录阶段，默认 stage1，阶段5显式指定 stage5；既有数据记录不覆盖。方案见 [PLAN.md](PLAN.md)。

## 同环境性能记录

| 指标 | 优化前 bytes | 优化后 bytes | 减少 |
| --- | ---: | ---: | ---: |
| JS 总量 | 2,166,382 | 1,622,270 | 25.12% |
| JS gzip 总量 | 722,921 | 547,485 | 24.27% |
| 最大 JS chunk | 2,161,732 | 998,102 | 53.83% |

同 Windows x64、Node v24.19.0、npm 11.17.0 和锁定依赖。环境及依赖记录深度比较通过；构建输入仅 router、statsCharts 与 package.json（验证入口脚本）变化。原始输入/产物哈希均保留。

仅做路由拆分时，总 gzip 实际增加1,314 bytes；最终减少来自后续按需引入等整体结果，不将分包自动当成总体积改善。JS/gzip 为实际文件字节及逐 JS 文件压缩求和，不含 CSS/HTML，不代表已测得的下载耗时或帧率。详细口径、分阶段数据及原始 JSON 见 [PERFORMANCE.md](PERFORMANCE.md)。

## 实际浏览器验收

使用当前构建、本地 Vite preview、Edge 原生 CDP 及全新临时配置；不连接用户日常浏览器。1280px、375px、768px 均完成以下验证：

| 场景 | 结果 |
| --- | --- |
| 登录与列表加载 | 未登录不请求 TaskList，登录后首次进入才请求其独立 chunk；业务页冷刷新不预加载 Login，退出时按需加载，未授权路由先被守卫拦截 |
| 看板与统计加载 | 登录/列表不预加载 Kanban 或 Stats，首次导航才请求，对应模块重访复用；各页面直接刷新可正常加载，业务快照不变 |
| 图表实际显示 | 饼图、柱图、标题、图例、坐标轴显示；实际悬停验证 B 项目饼图已完成2条、柱图低优先级1条；项目/全部/空项目及汇总数据一致 |
| 图表资源释放 | 首次离开统计页，两个真实图表 DOM 的实例标记清空且节点移出文档；跟踪实际 ResizeObserver，两个图表容器均解除观察；离页后调整尺寸无未捕获异常，再进入可正常创建 |
| 搜索、筛选与分页 | 第2/11页、搜索trim/防抖/回首页/清空、项目与状态组合、零结果、卸载取消搜索均通过 |
| 失败与恢复 | 存储损坏/未知版本/读写失败保护、确认恢复、登录保存失败、列表/看板/统计重试、拖拽写失败回滚、保存成功但查询失败后只读重试均通过 |
| 关联与日期回归 | 项目管理、任务归属、子任务完成/编辑/删除及父子联动、级联计数/删除、截止日期及0004年闰日、逾期组合筛选、刷新保留通过 |
| 延迟导航 | 请求未完成切换页面正确加载当前项目；三页挂载项目查询延迟时离开，恢复旧请求不再继续任务查询 |
| 布局与异常 | 所有实际场景无页面横向溢出，无未捕获异常；三种宽度的统计截图已检查 |

浏览器脚本只在隔离配置中准备大量数据或包装 action/存储读取与写入。资源释放跟踪以原生 ResizeObserver 的子类调用原方法进行，图表实例检查依据锁定 ECharts 的实际销毁行为。375px/768px 为桌面 Chromium 视口模拟，拖拽使用鼠标与原生 HTML5 拖放，不声称真实手机触摸输入已验收。

## 检查与证据

- `npm run check`：完整 ESLint 零警告、Prettier 和所有 Node assert 通过，见 [CHECK_2026-11-04.txt](CHECK_2026-11-04.txt)。
- `npm run build`：通过，见 [BUILD_2026-11-04.txt](BUILD_2026-11-04.txt)。
- `npm run verify:browser`：四个入口依次执行，原有存储/项目、第三阶段、第四阶段及三宽度懒加载/释放场景全部通过，见 [BROWSER_FULL_2026-11-04.txt](BROWSER_FULL_2026-11-04.txt)。
- 独立懒加载/释放专项亦通过，见 [LAZY_AND_DISPOSE_2026-11-04.txt](LAZY_AND_DISPOSE_2026-11-04.txt)。
- `npm ls --depth=0` 通过，lockfile未改动；`git diff --check` 无空白错误，只有既有Windows换行提示。
- 图表截图：[1280px](STATS_1280_2026-11-04.png)、[375px](STATS_375_2026-11-04.png)、[768px](STATS_768_2026-11-04.png)。本轮通过环境参数保存到stage5，原stage4截图保留。

实际执行浏览器的 PowerShell 参数：

```powershell
$env:TASKFLOW_BROWSER_ARTIFACT_STAGE='stage5'
$env:TASKFLOW_BROWSER_ARTIFACT_DATE='2026-11-04'
npm run verify:browser
```

## 修正与边界

- 逐步教学中修正 Projects 路径多余括号、TooltipComponent 拼写等错误，保留每步的检查、构建和浏览器记录。
- 页面变为动态加载后，旧浏览器导航助手只等导航文字和Store空闲，可能先读取旧页面。首轮最终回归复现于 [BROWSER_INITIAL_WAIT_2026-11-04.txt](BROWSER_INITIAL_WAIT_2026-11-04.txt)；修正为等待目标页面容器实际挂载，随后完整重跑通过。这是验收同步条件调整，未为此改变业务逻辑。
- 当前应用入口仍约998kB，构建保留超过500kB与静态/动态导入混用提示；未隐藏警告、调整警告阈值或额外改造现有Element Plus全局注册方式。本轮量化改进按实测记录。
- 第五阶段约定范围内无待完成项。第六阶段再处理交付文档、独立仓库版本保存与Pages发布/线上验收；当前源码仍为本地变更，未提交、推送、发布或标记v1.0.0，不能将本记录解读为V1全部交付。
