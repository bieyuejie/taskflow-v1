# TaskFlow V1 简历素材草稿

状态：本地验收通过，线上发布待完成；发布验收后再用于正式项目介绍。

- 基于 Vue 3、Pinia 和 Element Plus 开发任务管理应用，支持项目管理、一级子任务、截止日期筛选及看板拖拽。
- 使用版本化 localStorage 快照保存数据，校验字段与关联，处理损坏数据、写入失败和失败回滚。
- 通过 Pinia actions 统一修改数据，getters 计算顶层任务统计，实现列表、看板与图表按项目联动。
- 通过页面懒加载和 ECharts 按需引入，同环境下 JS 总体积减少25.12%，JS gzip 总量减少24.27%。

项目边界：纯前端演示登录，同一浏览器单标签页使用，无后端和真实账号隔离。

功能依据见[第三阶段验收](../stage3/ACCEPTANCE.md)、[第四阶段验收](../stage4/ACCEPTANCE.md)和[第五阶段验收](../stage5/ACCEPTANCE.md)；体积数据见[性能对比](../stage5/PERFORMANCE.md)，不表示已测得加载耗时改善。
