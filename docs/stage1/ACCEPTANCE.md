# 第一阶段验收记录

日期：2026-10-26（Asia/Shanghai）。结论：第一阶段通过。完成基线来源核验、独立源码与本地仓库、可复现依赖安装、检查入口、原始构建指标及目录隔离核验。后续业务功能仍按阶段实现，本记录不代表 V1 完整交付。

## 做了什么及原因

1. 从只读原仓库读取指定基线 `f0520603aecb13de401b144eee38632b8e4a3c13`，逐一核对 V1 副本的 32 个受控文件。26 个文件字节相同，6 个仅 CRLF/LF 差异；因此直接保留副本，没有覆盖现有源码。证据见 [baseline.json](baseline.json)。
2. 在 `D:/Frontend/project.v1/taskflow.v1` 新建独立 Git 仓库，使用 master 分支。初始提交 `638b4be47700a56701f1a52f333daea9f6b151a3` 的 Git 树与原基线完全相同：`21a55ef2844d6d26598a57c74dacaa3f3ec41aa8`。没有复制旧 .git，没有继承远程。
3. 按原 lockfile 执行 npm ci，15 个直接依赖全部符合规范锁定版本。没有新增或升级依赖，package-lock.json 未改动；检查产物 node_modules、dist、缓存、日志和临时文件不纳入版本控制。
4. 将 lint 改为只读零警告检查，增加 format:check、verify、check 和 measure:build，保留显式 lint:fix 与 format。新增 Node assert 基线回归脚本，不引入测试库。
5. 在业务及 Vite 配置调整前构建并保存优化前指标；随后将 Vite base 改为独立规划路径 `/taskflow-v1/`，另存配置调整后的构建指标。没有进行性能优化，没有计算改善比例。
6. 部署工作流改为暂仅手动触发，且只允许 `bieyuejie/taskflow-v1` 仓库的 master 分支；检查步骤使用 npm run check。当前不创建远程仓库、不推送、不上线，独立发布验收留到第六阶段。
7. 重写 V1 README，标注旧检查报告为历史资料，同步上级 AGENTS.md 的进度指向，避免把旧版注册、版本升级或原站点部署要求继续作为 V1 任务。

## 验证结果

环境：Windows x64，Node v24.19.0，npm 11.17.0，Vite 5.4.11；两次构建均在相同目录、相同依赖及相同 Mock 种子条件下完成。

| 检查 | 实际结果 |
| --- | --- |
| npm ci --no-audit --no-fund | 成功，安装 203 个包；未升级依赖。 |
| npm ls --depth=0 | 通过，15 个直接依赖无缺失或版本不匹配。 |
| npm run lint | 通过，零错误、零警告，不自动修改代码。 |
| npm run format:check | 通过，源码、脚本、入口及相关配置格式一致。 |
| npm run verify | 通过，使用 Node assert 和现有 Vite，见下方范围。 |
| npm run check | 通过，串行运行 lint、格式检查和断言。 |
| npm run build | 原始基线及 V1 base 配置各构建成功。仍有混合动态/静态引入和大包提示，按第五阶段处理。 |
| 本地 HTTP 预览 | `/taskflow-v1/` HTML 和其引用的 3 个资源均返回 200；JS/CSS Content-Type 正确。核验后关闭服务。 |
| 业务代码及锁文件 | src、public、index.html 和 package-lock.json 哈希保持初始值。 |
| 原项目隔离 | 原项目 33 个受控/未跟踪文件和 161 个 Git 元数据文件的前后哈希、HEAD、Git 状态均一致。 |

基线断言实际覆盖：未授权、空白登录、演示登录、非法任务枚举与分页、未知接口格式、CRUD、搜索与状态筛选、105 条跨页全量读取、分页列表隔离、唯一 ID、状态/优先级统计、看板状态同步、旧响应防覆盖、清空后旧请求保护。测试只使用当前 Node 进程内的模拟存储和数据，不访问用户浏览器。

本地 HTTP 资源验证不等于实际浏览器交互验收。本阶段没有验证真实浏览器拖拽、图表显示、375px/768px 布局或线上 Pages。

## 优化前构建指标

以下为实际 UTF-8 文件字节，kB = 1000 bytes。gzip 逐文件压缩后求和；当前仅一个 JS chunk，因此 JS 总量等于最大 chunk。

| 构建条件 | JS 总字节 | 最大 JS chunk 字节 | JS gzip 字节 |
| --- | ---: | ---: | ---: |
| 原始 f052060 业务与配置，base=/taskflow/ | 2,131,692 | 2,131,692 | 711,759 |
| 阶段一独立配置，base=/taskflow-v1/ | 2,131,698 | 2,131,698 | 711,768 |

原始指标见 [baseline-build.json](baseline-build.json)，独立配置后指标见 [stage1-build.json](stage1-build.json)。记录包含环境、15 个依赖版本、全部业务输入和配置的 SHA-256、资产明细及 gzip 数据，便于第五阶段同环境复测。

Vite 日志原始基线显示 JS 2,130.21 kB，实际 UTF-8 文件为 2,131.692 kB；含中文时其字符串长度显示与实际文件字节存在差异。本项目后续性能比较统一使用 JSON 的实际 bytes，不混用两种口径。base 变化带来的几字节差异不算性能优化。

## 原项目保护证据

[isolation.json](isolation.json) 记录操作后的隔离核验结论，并与 baseline.json 中操作前快照比对。原项目 HEAD 保持指定基线，Git 状态始终为 `?? vercel.json`；该未跟踪文件已存在，内容哈希保持一致，未复制到 V1。

原项目未发生安装、格式化、构建、修改、提交或推送。V1 的 Git 目录路径独立、远程列表为空，node_modules 和 dist 是 V1 新安装/构建的产物，属于被忽略文件，并非从原项目拷贝的成果。

## 受影响文件

- 配置：package.json、vite.config.js、.gitignore、.github/workflows/deploy.yml。
- 新增脚本：scripts/verify.mjs、scripts/measureBuild.mjs。
- 说明和证据：README.md、docs/stage1/ 下的计划、来源哈希、两份构建指标、隔离核验及本记录。
- 历史标记：PROGRESS_REVIEW.md、V1_REVIEW.md。
- 工作区规则：上级 AGENTS.md，仅更新当前记录指向；该文件位于源码 Git 仓库之外。
- 新建独立 .git，不纳入源码文件；没有改动业务 src/public、原始 DOCX 或依赖锁文件。

## 后续阶段

第一阶段已完成，可以开始第二阶段：先补损坏 JSON、未知 schemaVersion、存储拒绝/写失败、回滚和重试断言，再实现 V1 存储键、快照校验、repository 及持久化。继承的旧登录键和内存 Mock 将在该阶段统一替换，当前不认定为 V1 功能通过。

项目、子任务和日期为第三阶段，列表/看板/统计联动为第四阶段，按需加载、性能比较和浏览器验收为第五阶段，远程仓库、Pages 发布和 v1.0.0 为第六阶段。均未提前宣称完成。
