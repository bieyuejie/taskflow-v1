# TaskFlow V1 前端完善版

V1 在独立目录完善原 TaskFlow。第一、第二阶段已完成；项目管理、一级子任务界面、截止日期及逾期筛选仍按后续阶段实现。第二阶段完成记录见 [COMPLETED.md](docs/stage2/COMPLETED.md)。

## 工作区与来源

- 源码目录：`D:/Frontend/project.v1/taskflow.v1`。
- 只读来源：`D:/Frontend/projects/taskflow`，基线提交 `f0520603aecb13de401b144eee38632b8e4a3c13`。
- 基线共 32 个受控文件，复制内容已核验一致，允许 CRLF/LF 差异；原 `.git`、依赖目录、构建产物、缓存、日志及未跟踪的 `vercel.json` 未导入。
- V1 使用独立 Git 仓库和 `master` 分支，没有沿用原远程。第二阶段版本保存在私有仓库 [bieyuejie/taskflow-v1](https://github.com/bieyuejie/taskflow-v1)，标签为 `stage2-complete`；网站尚未发布。
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
```

`lint`、`format:check` 和 `check` 都是只读检查。显式修复使用 `npm run lint:fix`，格式化使用 `npm run format`。所有命令仅在当前 V1 源码目录运行。

`verify` 使用 Node 内置 assert、现有 Vite 和进程内模拟存储，覆盖83组字段/关联校验、CRUD、105条跨页读取、请求乱序，以及损坏数据保留、读取失败、真实写入失败回滚、序列化、确认重置、Token、守卫和重载ID高水位；不访问用户浏览器的数据。

先构建后可手动运行 `node scripts/verifyBrowser.mjs`。该脚本仅用 Node/Vite 和浏览器原生调试协议，在全新临时配置的无头 Edge/Chrome 中检查登录、实际刷新、确认重置、写失败重试和恢复提示，不安装第三方测试库。浏览器路径可通过 `TASKFLOW_BROWSER_PATH` 指定；结束后关闭浏览器并清理本次临时配置。常规 CI 的 `npm run check` 不依赖本机浏览器。

## 当前功能和阶段边界

保留基线演示登录、任务增删改查、搜索防抖、状态筛选、分页、三列看板拖拽及统计图。任务已补齐 V1 项目、父任务和截止日期字段以满足快照结构，当前界面仍创建默认项目下的顶层任务，项目选择及子任务界面在第三阶段接入。

登录统一使用 `taskflow_v1_token`，业务数据使用 `taskflow_v1_data`，快照为 `{ schemaVersion: 1, projects, tasks }`，不保存 Token 或密码。写入成功后才更新有效内存；损坏数据、未知版本或读取失败会暂停业务页面并保留原值，可重试读取。损坏数据重置需要明确确认，重置写失败继续保留原值；退出登录保留项目及任务数据。

V1 不实现真实注册、后端、数据库、AI、同步或真实账号安全系统。本地数据仅限同一浏览器单标签页使用，不保证多标签并发、跨设备同步或按账号隔离。更换浏览器、清理站点存储或改变站点 origin 后不能继续访问原浏览器中的数据。

## 检查与性能记录

- [第一阶段验收记录](docs/stage1/ACCEPTANCE.md)：实施内容、验证、原项目隔离与剩余工作。
- [第二阶段8项问题修复验证](docs/stage2/REPAIR_2026-10-28.md)：原值保护、故障回滚、确认恢复、登录与浏览器操作的实际结果。
- [基线来源与逐文件哈希](docs/stage1/baseline.json)：32 个文件来源和操作前原项目状态。
- [原始构建指标](docs/stage1/baseline-build.json)：配置修改前的基线，包含环境、依赖、输入哈希、JS/chunk/gzip 数据。
- [V1 配置构建指标](docs/stage1/stage1-build.json)：独立 base 配置后的结果，作为后续同环境比较入口；不是性能优化结果。

为新构建保存记录（名称不能与已有记录重复）：

```sh
npm run build
npm run measure:build -- my-measurement
```

体积按 UTF-8 实际文件字节计数，gzip 为逐文件压缩后求和；kB = 1000 bytes。Vite 日志可能按字符串长度展示 JS 原始体积，存在中文时与实际文件字节略有差异；比较以 JSON 中的 bytes 为准。

原 `PROGRESS_REVIEW.md` 和 `V1_REVIEW.md` 是历史记录，不代表当前 V1 已完成或已上线。实际浏览器验收、性能优化和线上验收仍待后续阶段。

## 独立部署规划

独立源码仓库为 `bieyuejie/taskflow-v1`，Vite base 为 `/taskflow-v1/`。预期Pages地址是 `https://bieyuejie.github.io/taskflow-v1/`，目前未发布、未验证，不作为可用演示链接。

GitHub Actions 暂仅允许手动触发，并限制目标为上述仓库的 `master` 分支。流程为 `npm ci → npm run check → 构建 → Pages 发布`。第六阶段核对实际仓库、Pages 设置和完整验收后再开启自动发布，不覆盖原 `taskflow` 仓库和站点。

路由使用 hash 模式及 `import.meta.env.BASE_URL`。origin 指向独立的 `taskflow-v1` 仓库，当前归档标签为 `stage2-complete`，尚未标记最终 `v1.0.0`。
