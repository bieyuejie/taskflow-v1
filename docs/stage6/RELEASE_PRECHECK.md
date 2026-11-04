# 第六阶段发布前核对

核对日期：2026-11-04（Asia/Shanghai）。本次为只读预检查，尚未发布。

后续状态：用户已明确选择公开仓库，现已执行并通过未登录访问验证，详见[可见性变更记录](VISIBILITY_CHANGE.md)。下文私有仓库及计划查询结果保留为变更前预检查证据，不代表当前可见性。

归档状态更新：第三至第五阶段成果现已通过提交 `c8bd241` 推送至独立仓库，详见[版本保存记录](GITHUB_SAVE.md)。下文第二阶段远程 SHA 为当时预检查结果，保留为历史证据。

Pages 状态更新：现已配置发布源为 GitHub Actions，完成首次部署、基础资源检查及[完整线上验收](ONLINE_ACCEPTANCE.md)，详见[配置记录](PAGES_SETUP.md)与[部署记录](DEPLOYMENT.md)。下文未启用状态为配置前的历史证据；最终 `v1.0.0` 归档见[最终交付验收](ACCEPTANCE.md)。

## 本轮补充核实

通过 Git 已保存的登录，以只读 REST 请求补充查询；凭据仅在进程内使用，没有输出或写入文件。

- `GET /repos/bieyuejie/taskflow-v1`：仓库 ID `1436595644`，`private=true`、`has_pages=false`、默认分支 `master`，当前登录有仓库 admin 权限。因此确认 Pages 尚未启用，未创建或修改站点。
- `GET /repos/bieyuejie/taskflow-v1/pages`：返回 HTTP 404；结合仓库 `has_pages=false` 判断当前没有已启用的 Pages 站点，不将 404 单独当作账号计划不足的证据。
- `GET /repos/bieyuejie/taskflow-v1/git/ref/heads/master`：实际远程 SHA 为 `e294141c2effa744bd8f6c5ac3718ebc5db5294d`，与本地 HEAD 一致，仍为第二阶段提交。第三至第五阶段成果尚未保存到远程 master。
- `GET /user`：确认登录为 `bieyuejie`，但响应未提供可用的计划名称；不能将空值解释为 Free。需要用户提供仓库 Settings → Pages 的顶部提示，以确认是否支持在现有私有仓库上启用 Pages。

## 已核实

| 项目           | 实际结果                                                                                      | 依据                                        |
| -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 独立仓库       | `bieyuejie/taskflow-v1`，仓库 ID `1436595644`，当前为私有且未归档                             | GitHub 连接器实时仓库元数据                 |
| 默认分支       | `master`，GitHub 分支查询确认存在                                                             | GitHub 仓库元数据与分支查询                 |
| 本地远程       | origin 拉取和推送地址均为 `https://github.com/bieyuejie/taskflow-v1.git`                      | 本地 `git remote -v`                        |
| 本地分支和版本 | `master`，HEAD 为 `e294141c2effa744bd8f6c5ac3718ebc5db5294d`；本地已有 `stage2-complete` 标签 | 本地 Git 记录；不代表本次已读取远程最新提交 |
| 资源路径       | Vite base 为 `/taskflow-v1/`，与实际仓库名一致                                                | `vite.config.js`                            |
| 路由           | hash 路由使用 `import.meta.env.BASE_URL`                                                      | `src/router/index.js`                       |
| 发布触发       | 仅 `workflow_dispatch` 手动触发；job 限定目标仓库及 `refs/heads/master`                       | `.github/workflows/deploy.yml` 静态检查     |
| 发布步骤       | Node 24，`npm ci` → `npm run check` → `npm run build` → 配置 Pages → 上传 dist → 部署         | 同上；尚未实际运行远程工作流                |

结论：仓库身份、本地远程地址、base、路由及工作流目标一致。此次没有修改工作流、仓库设置或可见性，没有操作旧仓库和旧站点。

## 发布前仍需核实

- Pages 发布源、环境分支规则及实际首次发布运行已验证；工作流成功，17个静态文件基础检查及完整线上浏览器业务验收均通过。
- Pages 使用条件已通过用户选择公开仓库解决，无需继续读取账号计划。GitHub 官方说明 Free 支持公开仓库 Pages；选择公开不代表站点已经启用或部署。依据：[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。
- 远程版本标签已在后续最终归档步骤核实，见[最终交付验收](ACCEPTANCE.md)。先前 Git 网络错误保留为历史记录；本地 tracking ref 不单独作为远程最新版本证据，使用实际远程引用核对。
- 各固定 GitHub Action 提交及清单的远程可解析性已在后续核对通过，复合上传依赖也可读取，首次工作流运行结果为 success。
- 第三至第五阶段成果、Pages 首次部署、线上完整验收及后续 `v1.0.0` 最终归档均已完成，见[最终交付验收](ACCEPTANCE.md)。

本阶段预检查仅整理核对文档、交付清单和变更记录。使用现有 Prettier 检查本次修改的 Markdown 文件；业务代码未改动，不重复业务测试。
