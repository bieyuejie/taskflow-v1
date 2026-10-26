# TaskFlow V1 规范核查记录

> 本文保留 2026-10-17 的检查快照。2026-10-26 第一阶段的实际改动与验收见 `docs/stage1/ACCEPTANCE.md`；下文“本次”均指原检查日期。

检查日期：2026-10-17（Asia/Shanghai）。

结论：当前是可构建的旧版基线副本，尚未完成 V1 功能和阶段验收。依赖安装、静态检查与生产构建通过，不代表持久化、关联规则或浏览器验收通过。本次按用户要求核查并保存后续约束，没有开始批量实现六阶段功能。

## 依据与目录调整

- [TaskFlow V1 前端项目方案](../TaskFlow%20V1%20前端项目方案.docx)
- [TaskFlow V1 项目开发规范卡](../TaskFlow%20V1%20项目开发规范卡.docx)
- 用户已明确要求将源码目录改名为 `taskflow.v1` 并在 VS Code 打开。实际源码路径为 `D:/Frontend/project.v1/taskflow.v1`，覆盖两份文档中的 `taskflow` 子目录命名，其他目录边界不变。
- 后续开发约束已写入 `D:/Frontend/project.v1/AGENTS.md`。本次未修改原始 DOCX，未在 `D:/Frontend/projects` 执行任何操作，也未提交、推送或发布。

## 检查发现

| 优先级 | 发现与影响 | 代码证据及后续工作 |
| --- | --- | --- |
| 高 | 未隔离 V1 登录态 | `src/stores/user.js:7,19,25`、`src/router/index.js:23`、`src/api/request.js:23` 仍读写 `taskflow_token`；Mock 仍使用 `fake-xxx`。应集中定义 V1 键及独立演示 Token，禁止操作旧键。 |
| 高 | 任务仅存内存，刷新重置 | `src/mock/index.js:51` 初始化数组，新增/删除直接修改数组；没有 repository、版本化快照、storage 和校验工具。应先实现候选快照校验、一次写入、成功后更新内存，以及损坏数据保留和失败回滚。 |
| 高 | V1 数据与核心业务缺失 | Task 仅六字段，无 projectId/parentId/dueDate；缺少项目页面、store/API、项目选择与子任务组件。项目关联、一级子任务约束、级联删除、父子状态规则、本地日期与逾期筛选均尚未实现。 |
| 高 | 仍指向旧站点路径 | `vite.config.js:5` 为 `/taskflow/`，README 介绍原仓库及旧站点。V1 发布前须建立独立仓库并核对 `/taskflow-v1/`。当前源码目录没有 `.git`；本次未创建仓库或验证远程站点。 |
| 高 | 缺少 V1 自动验收入口 | 没有 `scripts/verify.mjs`；package.json 没有断言脚本或只读格式检查脚本，lint 默认带 `--fix`。部署流程仅 lint/build，缺少格式检查和关键断言。不能引用旧报告的数据层测试作为 V1 验收。 |
| 中 | 未统一 V1 统计和筛选 | 现有 getters 对全部任务按状态/优先级计数；没有顶层任务口径、项目筛选、总数/完成率及独立子任务进度。扩展数据模型时必须同时调整，避免子任务重复计数。 |
| 中 | 性能优化尚未实施 | `src/router/index.js:2–5` 静态引入全部页面；`src/utils/statsCharts.js:1` 全量引入 ECharts。需要页面动态 import 和图表按需注册，并同环境复测。 |
| 中 | 防抖卸载未取消计时器 | `src/utils/debounce.js` 无 cancel 方法；TaskList 卸载仅设置 isActive。虽阻止回调发请求，仍未满足规范卡要求的计时器清理。 |
| 中 | 字段校验不完整 | Mock 的 validTask 未限制标题 100 字符、描述 2000 字符；TaskDialog 也没有对应长度校验。新增模型时须在表单与 Mock 分别落实限制。 |
| 中 | 旧文档包含不适用的后续任务 | README 与 PROGRESS_REVIEW.md 写着补注册、核验最新工具等；V1 明确不做注册且冻结工具版本。旧报告还引用不在当前源码目录内的验证脚本，不可照旧命令去原 projects 执行。后续应重写 V1 README 和验收记录。 |

## 已符合或保留的基础

- package-lock.json 及实际安装的全部 15 个直接依赖版本均与规范卡第二章一致。package.json 中 5 个工具依赖仍使用 `^` 范围；必须继续使用 npm ci 和现有 lockfile，不据此自动升级。
- Node 24.x、Vue script setup、Pinia actions/getters、统一 Axios 请求层、Mock 返回 code/data/msg、业务及 HTTP 401 分支已存在。
- hash 路由使用 `import.meta.env.BASE_URL`；搜索防抖、分页、请求序号、分页读取全量任务和拖拽失败恢复已有基础。
- 默认 Element Plus 主题、1200px 内容宽度、768px 布局断点，以及图表工具层初始化和卸载清理已有代码。布局和交互仍需实际浏览器验收。

## 本次实际验证

环境：Windows，Node v24.19.0，npm 11.17.0，Vite 5.4.11。仅在 taskflow.v1 操作。

| 检查 | 结果 |
| --- | --- |
| 依赖安装 | 离线安装因 zrender 缓存缺失失败；随后 `npm ci --ignore-scripts --no-audit --no-fund` 成功，安装 203 个包。沿用 lockfile，未升级依赖。 |
| `npm ls --depth=0` | 通过，15 个直接依赖无缺失或不匹配。 |
| `eslint . --ext .vue,.js --max-warnings 0` | 通过，零错误零警告；使用 node_modules/.bin 本地入口，无自动修复。 |
| `prettier --check src index.html` | 通过；使用本地入口，无格式化写入。 |
| `npm run build` | 成功；出现动态/静态混合引入及大 chunk 警告。 |
| V1 Node assert | 未执行，脚本和相应业务模块尚未建立。 |
| 浏览器及线上验收 | 未执行，不声称登录、拖拽、手机布局或 Pages 已验收。 |

本次优化前构建指标（Vite 输出，十进制 kB，非 KiB）：

| 指标 | 原始体积 | gzip |
| --- | ---: | ---: |
| 全部 JS（当前仅一个 JS chunk） | 2,130.21 kB | 711.76 kB |
| 最大 JS chunk `index-BzsFI_r1.js` | 2,130.21 kB | 711.76 kB |
| CSS | 323.95 kB | 44.94 kB |

本轮生成的 node_modules、dist 属本地检查产物，已在 .gitignore 中排除。没有优化后数据，不计算提升比例。尚未核实该副本与基线提交 f052060 的逐文件一致性，因此第 1 阶段也未标记验收通过。

## 后续阶段顺序

1. 完成第 1 阶段：核对 f052060 来源、目录隔离及独立仓库准备；保留本次优化前指标。
2. 第 2 阶段先补 Node assert，再完成 V1 键、快照校验、存储异常及原子回滚，验收后继续。
3. 第 3 阶段实现项目、一级子任务和日期；第 4 阶段统一列表、看板与统计口径。
4. 第 5 阶段懒加载和按需图表，运行全部自动检查并完成浏览器验收。
5. 第 6 阶段更新 V1 文档，独立发布验证成功后再标记 v1.0.0。

本次新增文件仅为根目录 AGENTS.md 和本记录；业务源码、依赖声明、部署配置及两份原始文档未修改。文档中的流程文字作为本项目约束的资料理解，不单独扩展用户本次“检查”的范围。
