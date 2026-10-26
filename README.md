# TaskFlow V1 前端完善版

V1 在独立目录完善原 TaskFlow。当前完成第一阶段的基线核验、独立本地仓库、检查入口和优化前构建记录；持久化、项目、一级子任务、截止日期及逾期筛选仍按后续阶段实现。

## 工作区与来源

- 源码目录：`D:/Frontend/project.v1/taskflow.v1`。
- 只读来源：`D:/Frontend/projects/taskflow`，基线提交 `f0520603aecb13de401b144eee38632b8e4a3c13`。
- 基线共 32 个受控文件，复制内容已核验一致，允许 CRLF/LF 差异；原 `.git`、依赖目录、构建产物、缓存、日志及未跟踪的 `vercel.json` 未导入。
- V1 使用新建本地 Git 仓库和 `master` 分支，没有沿用原远程。GitHub 仓库与网站尚未创建或发布。
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

`verify` 使用 Node 内置 assert、现有 Vite 和进程内模拟存储，覆盖基线 Mock 鉴权与参数校验、CRUD、搜索与筛选、105 条跨页读取和统计、ID 唯一、请求乱序及清空保护；不访问浏览器中的数据。第二阶段会先补 V1 存储异常断言，第三、四阶段再扩展关联和日期断言。

## 当前功能和阶段边界

保留基线演示登录、任务增删改查、搜索防抖、状态筛选、分页、三列看板拖拽及统计图。业务源码在第一阶段未改动，仍只有旧版六字段任务和内存 Mock，刷新会重置任务。

旧登录键 `taskflow_token` 和旧演示 Token 是继承的待替换代码，不是 V1 验收通过项。第二阶段统一切换 `taskflow_v1_token`、`taskflow_v1_data` 及 `{ schemaVersion: 1, projects, tasks }` 快照，并实现损坏数据保留、存储失败反馈和原子回滚。

V1 不实现真实注册、后端、数据库、AI、同步或真实账号安全系统。最终本地数据仅限同一浏览器单标签页使用，不保证多标签并发、跨设备同步或按账号隔离。当前项目尚未实现本地业务数据保存，不能把该规划当作已完成能力。

## 检查与性能记录

- [第一阶段验收记录](docs/stage1/ACCEPTANCE.md)：实施内容、验证、原项目隔离与剩余工作。
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

规划仓库为 `bieyuejie/taskflow-v1`，Vite base 为 `/taskflow-v1/`。预期地址是 `https://bieyuejie.github.io/taskflow-v1/`，目前未发布、未验证，不作为可用演示链接。

GitHub Actions 暂仅允许手动触发，并限制目标为上述仓库的 `master` 分支。流程为 `npm ci → npm run check → 构建 → Pages 发布`。第六阶段核对实际仓库、Pages 设置和完整验收后再开启自动发布，不覆盖原 `taskflow` 仓库和站点。

路由使用 hash 模式及 `import.meta.env.BASE_URL`。当前阶段没有配置 origin，没有推送或标记 `v1.0.0`。
