# 项目编辑流程检查（2026-10-29）

- 范围：检查项目编辑的页面、组件、Store、API、Mock 五层连接，不代表第三阶段整体验收完成。
- 功能代码由本轮教学逐步接入：`src/views/Projects.vue`、`src/components/ProjectDialog.vue`、`src/stores/project.js`、`src/api/project.js`、`src/mock/index.js`。
- 本次修正：使用现有 Prettier 统一 `src/views/Projects.vue`、`src/components/ProjectDialog.vue`、`src/api/project.js` 的缩进、换行和末尾换行，消除 14 处格式警告；未调整业务逻辑。
- 自动检查：Node 24.19.0 下，`npm run check`（ESLint 零警告、Prettier、现有关键断言）和 `npm run build` 均通过。构建仍有既有的大 chunk 及静态/动态导入混用提示，性能优化尚未完成。
- 专项断言：通过现有 Vite SSR 与 Node assert，在内存存储中验证编辑鉴权、名称 trim、单次写入、Store 更新；ID、创建时间、任务数据不变。重名、空白、超长、非法类型、不可编辑字段和不存在项目均拒绝且不写入；写失败时 Store、repository 内存及存储保持原值，恢复后可重试。
- 浏览器验证：使用构建产物、Edge 独立临时配置及现有 CDP 脚本的内存适配执行。桌面 1280px 验证编辑回填、输入不直接修改有效数据、取消不保存、连续保存只写一次、列表更新和实际刷新保留；编辑后新增表单清空、必填校验和新增正常；重名与写失败保留输入及原数据，恢复后重试成功。
- 移动宽度：375px、768px 分别验证编辑保存及刷新，页面和弹窗无横向溢出；本轮浏览器无未捕获运行异常。
- 数据隔离：专项断言仅使用进程内存；浏览器仅使用本次临时配置，测试后已清理，不连接用户日常浏览器数据。专项脚本在内存中运行，未加入常规 `npm run verify`。
- 未完成：项目删除、项目选择与任务归属、一级子任务、截止日期与逾期筛选及第三阶段整体验收；本次未提交、推送或发布。
