# TaskFlow V1 前端完善版

V1 在独立目录完善原 TaskFlow。当前工作区前五阶段已完成验收：本地快照、项目管理、一级子任务、截止日期与逾期筛选、列表/看板/统计项目联动，以及页面懒加载和图表按需。第五阶段实际结果见 [ACCEPTANCE.md](docs/stage5/ACCEPTANCE.md) 与 [性能对比](docs/stage5/PERFORMANCE.md)，第四阶段见 [ACCEPTANCE.md](docs/stage4/ACCEPTANCE.md)，第三阶段见 [ACCEPTANCE.md](docs/stage3/ACCEPTANCE.md)，第二阶段记录见 [COMPLETED.md](docs/stage2/COMPLETED.md)。第六阶段[交付清单](docs/stage6/DELIVERY.md)中已完成独立 Pages 首次部署和基础资源检查，完整线上业务验收仍待完成；第三至第五阶段成果已推送到独立 GitHub 仓库，业务归档提交为 [c8bd241](https://github.com/bieyuejie/taskflow-v1/commit/c8bd241846afa25a0670fd12f2710f49b0d469b2)，详见[版本保存记录](docs/stage6/GITHUB_SAVE.md)。

## 工作区与来源

- 源码目录：`D:/Frontend/project.v1/taskflow.v1`。
- 只读来源：`D:/Frontend/projects/taskflow`，基线提交 `f0520603aecb13de401b144eee38632b8e4a3c13`。
- 基线共 32 个受控文件，复制内容已核验一致，允许 CRLF/LF 差异；原 `.git`、依赖目录、构建产物、缓存、日志及未跟踪的 `vercel.json` 未导入。
- V1 使用独立 Git 仓库和 `master` 分支，没有沿用原远程。第二阶段版本保存在 [bieyuejie/taskflow-v1](https://github.com/bieyuejie/taskflow-v1)，标签为 `stage2-complete`；2026-11-04 按用户要求将该仓库改为公开，已验证未登录可访问，见[可见性变更记录](docs/stage6/VISIBILITY_CHANGE.md)。第三至第五阶段成果已保存到同一独立仓库，网站已完成首次部署，完整线上业务验收待完成。
- 两份 V1 方案文档位于上级目录，开发约束见上级 `AGENTS.md`。

## 启动与检查

使用 Node 24.x，依赖严格按现有 `package-lock.json` 安装，不升级、不新增依赖。

```sh
npm ci
npm run dev
```

本地入口为 `http://localhost:5173/taskflow-v1/`，端口占用时以 Vite 输出为准。

```sh
npm run lint
npm run format:check
npm run verify
npm run check
npm run build
npm run preview
npm run verify:browser
```

`lint`、`format:check` 和 `check` 都是只读检查。显式修复使用 `npm run lint:fix`，格式化使用 `npm run format`。所有命令仅在当前 V1 源码目录运行。

`verify` 使用 Node 内置 assert、现有 Vite 和进程内模拟存储，覆盖83组字段/关联校验、CRUD、105条跨页读取，以及1005条子任务/逾期任务跨页、1009条项目顶层任务/1010条全部项目汇总、项目隔离及空项目/完成率、异常空页和网络失败保留缓存、项目与父子关联、优先级同步、级联删除、四时区日期边界、保存失败回滚及保存成功后查询失败、请求乱序、损坏数据保留、恢复重试、Token与ID高水位；不访问用户浏览器的数据。

先构建后可运行 `npm run verify:browser`，依次执行 `scripts/verifyBrowser.mjs`、`scripts/verifyStage3Browser.mjs`、`scripts/verifyStage4Browser.mjs` 和 `scripts/verifyLazyRoutesBrowser.mjs`。它们仅用 Node/Vite 和浏览器原生调试协议，在全新临时配置的无头 Edge/Chrome 中检查存储恢复、项目管理、任务归属、一级子任务、截止日期、逾期筛选，以及搜索/分页、三页项目联动、汇总与实际图表提示、失败重试、鼠标拖拽和延迟请求导航；最后验证各页面实际按访问请求资源、重访复用及图表实例/ResizeObserver卸载释放，覆盖1280px、375px、768px。日期验收通过实际日历点击选择/清除；部分异常与大量关联场景只在临时配置中准备测试快照或延迟 action。视口模拟不代表真实手机触摸输入验收。浏览器路径可通过 `TASKFLOW_BROWSER_PATH` 指定；结束后关闭浏览器并清理本次临时配置。常规 CI 的 `npm run check` 不依赖本机浏览器。

截图输出可通过 `TASKFLOW_BROWSER_ARTIFACT_STAGE`（stage1～stage6）和 `TASKFLOW_BROWSER_ARTIFACT_DATE`（YYYY-MM-DD）指定，默认保留第四阶段入口的原行为；第五阶段实际验证参数见该阶段验收记录，使用独立目录保留旧截图。

## 当前功能和阶段边界

保留演示登录、任务 CRUD、搜索防抖、状态筛选、分页、三列看板和统计图。已支持项目新增/编辑/选择/级联删除及至少保留一个项目，任务创建时指定项目、编辑时项目不可更改；一级子任务可新增、编辑、完成/重新打开和删除，单独显示进度，优先级随父任务同步，删除父任务级联删除子任务。

任务列表展示顶层任务，支持项目、关键词、状态及“仅看逾期”组合筛选。顶层任务可通过日历选择、编辑和清除截止日期，存储为本地 `YYYY-MM-DD` 或 `null`；子任务没有截止日期。逾期只包含截止日期早于本地今日的未完成顶层任务，当天不逾期，已完成任务不逾期。日期标签在本地跨日及页面重新获得焦点时更新。

列表、看板、统计共享项目选择；看板及任务总数、完成率、状态/优先级图表统一汇总当前项目或全部项目的顶层任务。关键词、状态和逾期属于列表局部筛选，不缩小看板或项目整体统计；空项目完成率为0%，子任务进度单独计算。全量任务跨页加载，查询失败保留有效缓存并隐藏旧展示；重试只查询。拖拽写失败恢复卡片，保存成功但查询失败时重试不重复保存。页面本地加载保护避免上一页的忙碌状态阻止新页面初始化，离开页面后不继续启动挂载流程的任务查询。

全部页面通过路由动态import加载；ECharts仅注册当前使用的饼图、柱图、标题、提示、图例、网格和Canvas渲染器。图表接入集中在statsCharts.js，卸载释放实例和尺寸监听，已在三种宽度验证。性能对比按同环境真实文件字节记录，未测量或承诺加载耗时提升。

登录统一使用 `taskflow_v1_token`，业务数据使用 `taskflow_v1_data`，快照为 `{ schemaVersion: 1, projects, tasks }`，不保存 Token 或密码。写入成功后才更新有效内存；损坏数据、未知版本或读取失败会暂停业务页面并保留原值，可重试读取。损坏数据重置需要明确确认，重置写失败继续保留原值；退出登录保留项目及任务数据。

V1 不实现真实注册、后端、数据库、AI、同步或真实账号安全系统。本地数据仅限同一浏览器单标签页使用，不保证多标签并发、跨设备同步或按账号隔离。更换浏览器、清理站点存储或改变站点 origin 后不能继续访问原浏览器中的数据。

## 检查与性能记录

- [第一阶段验收记录](docs/stage1/ACCEPTANCE.md)：实施内容、验证、原项目隔离与剩余工作。
- [第二阶段8项问题修复验证](docs/stage2/REPAIR_2026-10-28.md)：原值保护、故障回滚、确认恢复、登录与浏览器操作的实际结果。
- [第三阶段验收记录](docs/stage3/ACCEPTANCE.md)：项目、子任务、截止日期、逾期筛选及异常/移动布局的实际验证。
- [第四阶段验收记录](docs/stage4/ACCEPTANCE.md)：项目联动、汇总与图表、搜索/分页、重试/拖拽及跨页面延迟查询的完整验证和两项问题修复。
- [第五阶段优化前构建指标](docs/stage5/stage5-before-2026-11-04-build.json)：2026-11-04 重新构建后的环境、依赖、输入哈希及 JS/chunk/gzip 基准，用于与最终结果比较。
- [第五阶段验收记录](docs/stage5/ACCEPTANCE.md)：页面动态加载、图表按需、实际资源释放及完整业务/异常/布局回归。
- [第五阶段性能对比](docs/stage5/PERFORMANCE.md)：同环境总体JS减少25.12%、JS gzip减少24.27%、最大chunk减少53.83%，含原始记录与计量边界。
- [基线来源与逐文件哈希](docs/stage1/baseline.json)：32 个文件来源和操作前原项目状态。
- [原始构建指标](docs/stage1/baseline-build.json)：配置修改前的基线，包含环境、依赖、输入哈希、JS/chunk/gzip 数据。
- [V1 配置构建指标](docs/stage1/stage1-build.json)：独立 base 配置后的结果，作为后续同环境比较入口；不是性能优化结果。

为新构建保存记录（名称不能与已有记录重复）：

```sh
npm run build
npm run measure:build -- my-measurement stage5
```

第二个参数指定记录阶段（stage1～stage6），省略时仍默认写入 docs/stage1；记录重名会拒绝覆盖。体积按 UTF-8 实际文件字节计数，gzip 为逐文件压缩后求和；kB = 1000 bytes。Vite 日志可能按字符串长度展示 JS 原始体积，存在中文时与实际文件字节略有差异；比较以 JSON 中的 bytes 为准。

原 `PROGRESS_REVIEW.md` 和 `V1_REVIEW.md` 是历史记录，不代表当前 V1 已完成或已上线。已完成范围的浏览器结果以对应阶段验收记录为准；第五阶段性能改动已验收，第六阶段首次部署及基础资源检查见[部署记录](docs/stage6/DEPLOYMENT.md)，完整线上业务及最终交付验收仍待完成。

## 独立部署状态

独立源码仓库为 `bieyuejie/taskflow-v1`，Vite base 为 `/taskflow-v1/`。Pages 发布源为 GitHub Actions，实际配置见[配置记录](docs/stage6/PAGES_SETUP.md)。[TaskFlow V1 网站入口](https://bieyuejie.github.io/taskflow-v1/)已完成首次部署，工作流成功，入口及全部17个静态文件 HTTP 200 且与云端实际产物哈希一致，详见[部署记录](docs/stage6/DEPLOYMENT.md)。完整线上浏览器业务验收尚未完成。

GitHub Actions 仅允许手动触发，并限制目标为上述仓库的 `master` 分支。流程为 `npm ci → npm run check → 构建 → Pages 发布`。首次部署运行见 [41826205389](https://github.com/bieyuejie/taskflow-v1/actions/runs/41826205389)，发布提交为 `25d83eb`；本次未开启自动发布，原 `taskflow` 仓库和站点未操作。

路由使用 hash 模式及 `import.meta.env.BASE_URL`。origin 指向独立的 `taskflow-v1` 仓库，当前归档标签为 `stage2-complete`，尚未标记最终 `v1.0.0`。
