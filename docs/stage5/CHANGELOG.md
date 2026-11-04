# 第五阶段变更记录

## 2026-11-04：完成图表按需引入及第五阶段验收

- 原因：检查用户完成的 ECharts 按需注册，修正 `ToolttipComponent` 为实际导出的 `TooltipComponent`，随后完成阶段剩余测量、三宽度资源/异常/布局与完整业务回归。
- 业务文件：`src/utils/statsCharts.js` 仅修正两处拼写并格式化；图表选项、DOM接入、尺寸监听及dispose流程沿用原实现。`src/router/index.js` 保留此前已验证的全部动态页面。未新增或升级依赖，lockfile未改动。
- 验证工具：`scripts/lazyRoutesBrowserCase.mjs` 增加真实ECharts实例标记清理及原生ResizeObserver跟踪，离页后改变宽度再进入仍正常；`scripts/verifyLazyRoutesBrowser.mjs` 扩为1280/375/768px；`scripts/verifyStage4Browser.mjs` 增加可选截图阶段/日期，原默认行为不变，阶段5输出到自身目录保留旧截图；`package.json` 将懒加载验证追加到完整浏览器入口。方案影响已补入PLAN。
- 发现并修正验收同步问题：懒加载后仅等待导航栏文字和Store空闲，可能在目标页面挂载前读到旧页面；`scripts/stage4BrowserCases.mjs` 改为等待目标页面实际容器。首轮记录为 `BROWSER_INITIAL_WAIT_2026-11-04.txt`，修正后完整重跑通过，无相关业务逻辑改动。
- 结果：完整check（ESLint零警告、Prettier、全部Node assert）、构建、完整四入口浏览器回归及独立资源释放专项通过；1280/375/768px图表实际提示、数据/项目联动、错误恢复、拖拽及全部既有业务回归通过，无横向溢出和未捕获异常。截图已检查；详细证据见ACCEPTANCE及各日志。
- 同环境测量：JS总量2,166,382→1,622,270 bytes（减少25.12%），JS gzip 722,921→547,485 bytes（减少24.27%），最大chunk 2,161,732→998,102 bytes（减少53.83%）。环境/依赖深度比较一致，构建输入仅router、statsCharts、package脚本变化。保留初始、仅路由分包、最终原始JSON及计算结果；不虚构加载耗时改善，详见PERFORMANCE.md。
- 文档：新增ACCEPTANCE.md、PERFORMANCE.md、最终指标/比较JSON与check/build/完整浏览器日志，README更新为前五阶段完成。主包仍约998kB，既有体积及混合导入提示保留并说明，未改Element Plus全局注册或隐藏构建警告。
- 后续边界：第五阶段范围内无待完成项，第六阶段交付/发布尚未开始。真实手机触摸硬件未宣称验收；本轮未提交、推送、部署或标记最终版本，未操作只读基线或V2/V3。

## 2026-11-04：验证登录动态加载并保存路由分包中间指标

- 原因：验证最后一个静态页面 Login 改为动态 import 后，已登录直接访问业务页面不会加载登录页，退出和守卫重定向仍正常。
- 影响文件：助手仅格式化用户已改好的 `src/router/index.js`；`scripts/lazyRoutesBrowserCase.mjs` 增加 Login 资源、退出、未授权访问及冷刷新检查；README 同步所有页面动态加载的当前进度。新增 `LOGIN_LAZY_CHECK_2026-11-04.txt`、`LOGIN_LAZY_BUILD_2026-11-04.txt`、`LOGIN_LAZY_BROWSER_2026-11-04.txt`、`stage5-routes-lazy-2026-11-04-build.json`。
- 验证：完整 `npm run check`、当前构建和页面懒加载浏览器专项全部通过。首次登录路由请求独立 Login chunk，业务页冷刷新不预加载 Login；退出时按需加载，未登录访问统计先被守卫拦截且不请求 Stats，登录路由刷新正常，Token 清理且业务数据保留。列表、看板、统计和项目管理已有资源与刷新回归一并通过，无未捕获异常。此次为1280px专项。
- 中间测量：同环境、同依赖，与优化前相比仅路由源码哈希变化。7个JS chunk，总JS 2,161,911 bytes，总gzip 724,235 bytes；最大chunk为Stats，1,035,326 bytes，gzip 343,685 bytes。相比初始基准，总gzip增加1,314 bytes；路由分包的已验证效果是页面按访问时机请求，并未改善总gzip，后续继续图表按需及最终比较。
- 后续准备：通过本地锁定 ECharts 5.5.1 的实际模块导出确认 core、PieChart/BarChart、标题/提示/图例/网格及 CanvasRenderer 均可使用，未新增依赖或修改图表实现。
- 未完成项：ECharts按需注册、最终体积比较、完整多宽度/异常及资源释放验收待后续步骤。下一教学步骤替换图表顶部全量导入并注册所需模块，尚未实施。第五阶段未完成，未提交、推送或发布。

## 2026-11-04：验证任务列表动态加载

- 原因：检查用户完成的 TaskList 动态 import，确认登录前及直接访问其他页面时不提前加载任务列表。
- 影响文件：助手仅格式化 `src/router/index.js`，保留用户已正确完成的列表路由修改；`scripts/lazyRoutesBrowserCase.mjs` 增加 TaskList 资源请求、重访及冷刷新断言；`scripts/verifyLazyRoutesBrowser.mjs` 将最终提示改为通用页面懒加载。新增 `TASK_LIST_LAZY_CHECK_2026-11-04.txt`、`TASK_LIST_LAZY_BUILD_2026-11-04.txt`、`TASK_LIST_LAZY_BROWSER_2026-11-04.txt`。
- 验证：完整 `npm run check`、当前源码构建及懒加载浏览器专项全部通过。登录前没有 TaskList chunk，登录后首次进入才请求独立资源，默认3条任务正常；从统计页返回列表复用模块；统计/看板/项目页冷刷新均未请求 TaskList，实际导航和列表直接刷新正常，快照保持。统计、看板和项目管理已有专项一并通过，无未捕获异常。此次为1280px专项，未新增依赖或修改lockfile。
- 未完成项：页面动态导入仅剩 Login，ECharts 仍为全量入口；最终测量和完整多宽度验收待后续步骤。下一教学步骤仅处理登录路由，尚未实施。第五阶段未完成，未提交、推送或发布。

## 2026-11-04：验证看板动态加载并修正项目页路径拼写

- 原因：检查用户完成的看板懒加载步骤；同时发现项目管理动态导入路径误写为 `../views(/Projects.vue`，会导致构建无法解析该模块。
- 影响文件：`src/router/index.js` 保留用户的 Kanban 动态 import，修正 Projects 路径为 `../views/Projects.vue` 并格式化；`scripts/lazyRoutesBrowserCase.mjs` 扩展看板首访/重访/刷新资源记录与项目管理路由检查；README 同步已验证范围。新增 `KANBAN_LAZY_CHECK_2026-11-04.txt`、`KANBAN_LAZY_BUILD_2026-11-04.txt`、`KANBAN_LAZY_BROWSER_2026-11-04.txt`。
- 验证：完整 `npm run check`、构建及懒加载浏览器专项全部通过。登录页、任务列表及统计页均未提前请求 Kanban chunk，首次访问看板才请求独立资源，三列各1条默认任务；重访复用模块，直接刷新正常且不预加载 Stats。统计页懒加载回归、项目管理实际导航和直接刷新均通过，业务快照不变，无未捕获异常。此次为1280px专项，无新增依赖及lockfile变更。
- 未完成项：登录和任务列表尚为静态导入，ECharts 仍为全量入口；其余懒加载、最终同环境体积比较和完整多宽度浏览器验收待后续步骤。下一教学步骤仅处理 TaskList，尚未实施。第五阶段未完成，未提交、推送或发布。

## 2026-11-04：验证统计页动态加载

- 原因：检查用户完成的统计页懒加载步骤，并确认构建分包在实际浏览器中按访问时机加载。
- 影响文件：`src/router/index.js` 由用户删除 Stats 静态导入并改用动态 import，助手仅使用既有 Prettier 整理该文件格式；新增 `scripts/verifyLazyRoutesBrowser.mjs`、`scripts/lazyRoutesBrowserCase.mjs`，基于现有临时浏览器/CDP方式验证实际 ResourceTiming 资源记录。新增本目录 `STATS_LAZY_CHECK_2026-11-04.txt`、`STATS_LAZY_BUILD_2026-11-04.txt`、`STATS_LAZY_BROWSER_2026-11-04.txt`、`stage5-stats-lazy-2026-11-04-build.json`；README 同步当前进度。无依赖变更。
- 验证：`npm run check` 通过；新增浏览器脚本单独 ESLint 零警告及格式检查通过；构建和 `node scripts/verifyLazyRoutesBrowser.mjs` 通过。登录页和任务列表均未请求 Stats chunk，首次进入统计页才请求独立资源，两个图表与3/1/33%汇总正常；返回列表后再次进入不重复请求模块，统计路由直接刷新正常，业务快照不变，无未捕获异常。此次为1280px专项，阶段末再跑完整多宽度回归。
- 中间测量：环境、依赖与优化前基准一致，构建输入仅 `src/router/index.js` 哈希变化。3个JS chunk，总JS 2,159,494 bytes，总gzip 720,918 bytes；最大chunk 1,119,560 bytes、gzip 375,192 bytes。本次主要证据是统计代码延迟加载，不将此中间结果当作整个阶段最终优化结论。
- 未完成项：登录、列表、看板的动态加载和 ECharts 按需注册尚待推进，后续继续测量及完整浏览器验收；下一教学步骤仅处理看板路由，尚未实施。未提交、推送或发布。

## 2026-11-04：保存优化前构建基准

- 原因：第四阶段已通过，开始第五阶段前先对当前源码同环境构建并记录实际体积，为后续懒加载和按需引入提供可比基准。
- 影响文件：`scripts/measureBuild.mjs` 增加可选阶段参数，默认 stage1，限定 stage1～stage6，历史记录不覆盖；新增本目录 `PLAN.md`、`BUILD_BEFORE_2026-11-04.txt`、`stage5-before-2026-11-04-build.json` 和本记录；README 更新阶段状态和测量用法。此次未修改业务页面、路由或图表实现。
- 测量：`npm run build` 通过后执行 `npm run measure:build -- stage5-before-2026-11-04 stage5`。共 2 个 JS chunk，总 JS 2,166,382 bytes，总 gzip 722,921 bytes；最大 chunk 2,161,732 bytes，gzip 720,856 bytes。单位为真实文件字节及逐 JS 文件压缩求和，不使用 Vite 日志展示值替代。
- 验证：测量脚本 ESLint 零警告、Prettier 检查通过；`npm ls --depth=0` 核对锁定版本通过。Node assert/子进程验证默认仍指向 stage1、既有记录拒绝覆盖且原值不变、非法阶段拒绝。无新增依赖或 lockfile 变更；本次未改业务代码，未重跑浏览器或全量业务断言。
- 未完成项：路由懒加载、ECharts 按需注册、优化后比较、阶段检查及浏览器验收均待后续步骤；本次只给出统计页懒加载的下一步教学，尚未实施。第五阶段未完成，未提交、推送或发布。
