# 发布工作流与环境核对

日期：2026-11-04（Asia/Shanghai）。本轮只读核对；未触发发布。

## 固定 Action 提交

逐项从官方仓库读取固定提交及该提交下的 `action.yml`，以下全部存在且可读取：

| Action                        | 工作流固定 SHA                             | 运行方式  |
| ----------------------------- | ------------------------------------------ | --------- |
| actions/checkout              | `3d3c42e5aac5ba805825da76410c181273ba90b1` | node24    |
| actions/setup-node            | `820762786026740c76f36085b0efc47a31fe5020` | node24    |
| actions/configure-pages       | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` | node24    |
| actions/upload-pages-artifact | `fc324d3547104276b827a68afc52ff2a11cc49c9` | composite |
| actions/deploy-pages          | `368f82528645a54fb793d4d04e342629a3f51346` | node24    |

上传 Pages 产物的 composite Action 内引用 `actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`，该固定提交及清单也可读取，运行方式为 node24。

所有顶层 Action 注释所列主版本标签均可查询。setup-node 的 v7 标签两次读取出现不同结果：首次独立标签查询返回 `949feb2413d6458794dcd2491c4babbbce0c15c1`，随后 matching-refs 查询中的 v7、v7.0.0、v7.1.0 返回工作流固定提交 `820762786026740c76f36085b0efc47a31fe5020`。本记录不据此宣称固定提交等于“当前最新版本”；固定提交和清单始终可解析，保留现有 SHA，不进行版本升级。

## 实际仓库与环境

- 唯一目标：`bieyuejie/taskflow-v1`，仓库 ID `1436595644`；查询时远程 master 为 `745567ed1d703b2a452312f79ae5e6f47a8cc6ae`。
- Actions：`enabled=true`、`allowed_actions=all`。
- 工作流：ID `399006604`，路径 `.github/workflows/deploy.yml`，状态 `active`；本地保持仅 `workflow_dispatch` 手动触发，并限定目标仓库及 master 分支。
- 默认 workflow token 权限为 read；现有 YAML 显式声明 `contents: read`、`pages: write`、`id-token: write`。本轮未修改默认权限或放宽其他设置。
- `github-pages` 环境已存在，唯一保护规则类型为 `branch_policy`；`protected_branches=false`、`custom_branch_policies=true`，允许的分支规则为 `master`，类型 `branch`，与目标分支一致。
- 重新按规则类型核对：required_reviewers 规则0条、wait_timer 规则0条，不需要审批或等待计时。早先展示辅助字段时 PowerShell 的 `@($null).Count` 为1，不能解释为存在1名审批人；结论使用实际规则类型及重查结果。
- Pages：`build_type=workflow`，地址为预期 V1 地址，站点状态仍为空；工作流运行记录0次。

## 结论与后续

当前核对范围内没有发现固定 Action 引用、Actions 开关或环境分支规则阻止发布的配置问题；无需修改源码、依赖、工作流或环境设置。配置检查不能替代实际远程运行。

本轮更新相关阶段记录并以现有 Prettier、空白检查验证，随后作为文档提交保存。下一步手动触发 `deploy.yml`，核对实际运行结果，部署成功后再验收线上业务、刷新及资源加载，通过后才标记 `v1.0.0`。

接口依据：[Actions 权限](https://docs.github.com/en/rest/actions/permissions#get-github-actions-permissions-for-a-repository)、[部署环境](https://docs.github.com/en/rest/deployments/environments#get-an-environment)。本轮不读取任何仓库或环境 secrets。
