# TaskFlow V1 最终交付验收

日期：2026-11-04（Asia/Shanghai）。结论：六阶段验收通过，V1 以 `v1.0.0` 完成交付。

## 交付入口

- 网站：[TaskFlow V1](https://bieyuejie.github.io/taskflow-v1/)。
- 独立公开仓库：[bieyuejie/taskflow-v1](https://github.com/bieyuejie/taskflow-v1)，默认分支 master。
- 固定版本：[v1.0.0](https://github.com/bieyuejie/taskflow-v1/tree/v1.0.0)，使用附注 Git 标签，包含最终文档。标签的实际提交与对象 SHA 可由 `git rev-parse 'v1.0.0^{commit}'`、`git rev-parse refs/tags/v1.0.0` 和远程引用核对，避免在提交内嵌入自身哈希。
- 简历素材：[RESUME.md](RESUME.md)；阶段清单：[DELIVERY.md](DELIVERY.md)。

## 六阶段依据

| 阶段 | 已完成内容                                                                  | 实际依据                                                                               |
| ---- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | 独立源码、基线隔离、锁定工具链、只读检查脚本和初始指标                      | [第一阶段验收](../stage1/ACCEPTANCE.md)                                                |
| 2    | V1 快照持久化、数据校验、损坏/版本/读写异常保护、回滚、重试和演示登录       | [第二阶段完成记录](../stage2/COMPLETED.md)、[修复验证](../stage2/REPAIR_2026-10-28.md) |
| 3    | 项目 CRUD、任务归属、一级子任务、关联级联、日期及逾期筛选                   | [第三阶段验收](../stage3/ACCEPTANCE.md)                                                |
| 4    | 列表/看板/统计项目联动、顶层统计口径、跨页查询、拖拽和异常恢复              | [第四阶段验收](../stage4/ACCEPTANCE.md)                                                |
| 5    | 页面懒加载、ECharts 按需、实例与监听释放、性能和三宽度回归                  | [第五阶段验收](../stage5/ACCEPTANCE.md)、[同环境性能对比](../stage5/PERFORMANCE.md)    |
| 6    | README 与简历素材、独立 GitHub 保存、Pages 部署、完整线上验收和最终版本标签 | [部署记录](DEPLOYMENT.md)、[线上验收](ONLINE_ACCEPTANCE.md)、本记录与 v1.0.0 远程引用  |

旧 `PROGRESS_REVIEW.md` 与 `V1_REVIEW.md` 不作为当前完成证据，各阶段历史记录保留，不以规划内容替代实际验收。

## 实际检查与部署

- 最终完整 `npm run check`：ESLint 零警告、Prettier、全部 Node assert 通过，见 [ONLINE_FINAL_CHECK_2026-11-04.txt](ONLINE_FINAL_CHECK_2026-11-04.txt)。
- 生产构建通过，见 [ONLINE_TOOLS_BUILD_2026-11-04.txt](ONLINE_TOOLS_BUILD_2026-11-04.txt)。保留既有大 chunk 和混合导入提示，不称构建零警告。
- 线上1280px、375px、768px覆盖登录、项目、任务、子任务、日期、搜索/分页/筛选、拖拽、统计、刷新、异常恢复、直接访问和资源释放，均通过；主回归与最终修改入口组合结果见 [ONLINE_BROWSER_2026-11-04.txt](ONLINE_BROWSER_2026-11-04.txt)、[ONLINE_FINAL_ENTRY_2026-11-04.txt](ONLINE_FINAL_ENTRY_2026-11-04.txt)。
- 首发成功运行：[41826205389](https://github.com/bieyuejie/taskflow-v1/actions/runs/41826205389)，发布提交 `25d83ebff2699e1b99ac8612ae48073be924a118`。全部17个静态文件 HTTP 200，SHA256 与该运行实际产物一致，见 [产物及 HTTP 证据](DEPLOYMENT_ARTIFACT_HTTP_2026-11-04.json)。
- 验收工具归档提交为 `f831a0b`，最终版本在其上仅补充交付文档。最终标签提交与首发提交的哈希不同，产品 src、index.html、Vite 配置、lockfile 和工作流一致；package.json 仅多一个线上验收脚本。未将未部署的新产品改动冒充线上版本，也未为文档和标签重复部署。
- 同环境 JS 总体积减少25.12%、JS gzip 总量减少24.27%、最大 chunk 减少53.83%；依据为第五阶段原始测量，不将不同系统产物文件名或包体积变化当作已测得的加载时间/帧率改善。

## 版本归档核对

- 创建前确认本地及远程没有 `v1.0.0`，目标仓库 ID、master、部署成功记录及站点状态正确。
- 创建最终文档提交后，附注标签指向该提交；保存到独立仓库并读取远程 master、标签对象、标签目标提交，确认与本地一致，不强推、不覆盖已有标签。
- 文档格式、相对证据链接及暂存范围已检查。Git 引用是版本目标提交及标签对象的事实依据；实施过程及校验方法见 [RELEASE_PLAN.md](RELEASE_PLAN.md)。
- 所有 V1 约定工作已完成，没有遗留的 V1 必做开发或验收项。之后开发应建立新的明确范围，不能自动修改 V2/V3 或基线。

## 使用限制

V1 是纯前端 Mock 演示，使用独立 `taskflow_v1_data` 和 `taskflow_v1_token`，只支持同一浏览器单标签页使用。退出保留业务数据；不提供真实注册、后端、数据库、多账号隔离、跨设备同步、多标签并发或 AI。375px/768px 为桌面浏览器视口模拟，不声称真实手机触摸硬件已验证。
