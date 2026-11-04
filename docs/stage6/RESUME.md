# TaskFlow V1 简历素材

状态：本地验收、独立 Pages 部署及线上业务验收已通过，最终 `v1.0.0` 标签待创建。以下表述已有实际依据。

演示：[TaskFlow V1](https://bieyuejie.github.io/taskflow-v1/)；源码：[bieyuejie/taskflow-v1](https://github.com/bieyuejie/taskflow-v1)。

- 基于 Vue 3、Pinia 和 Element Plus 开发任务管理应用，支持项目管理、一级子任务、截止日期筛选及看板拖拽。
- 使用版本化 localStorage 快照保存数据，校验字段与关联，处理损坏数据、写入失败和失败回滚。
- 通过 Pinia actions 统一修改数据，getters 计算顶层任务统计，实现列表、看板与图表按项目联动。
- 通过页面懒加载和 ECharts 按需引入，同环境下 JS 总体积减少25.12%，JS gzip 总量减少24.27%。
- 使用 GitHub Actions 执行检查、构建及独立 Pages 发布，通过1280px、375px、768px实际浏览器视口下的业务与异常流程验收。

项目边界：纯前端演示登录，同一浏览器单标签页使用，无后端和真实账号隔离。

功能依据见[第三阶段验收](../stage3/ACCEPTANCE.md)、[第四阶段验收](../stage4/ACCEPTANCE.md)、[第五阶段验收](../stage5/ACCEPTANCE.md)及[线上验收](ONLINE_ACCEPTANCE.md)；发布依据见[部署记录](DEPLOYMENT.md)。体积数据见[性能对比](../stage5/PERFORMANCE.md)，不表示已测得加载耗时改善；视口模拟不代表真实手机触摸设备测试。
