# 第五阶段构建体积对比

日期：2026-11-04（Asia/Shanghai）。仅比较实际构建文件字节和 gzip，不将包体积下降解释为已测得的加载耗时或帧率提升。

## 同环境与输入

三次记录使用相同 Windows x64、Node v24.19.0、npm 11.17.0 及锁定依赖；对 JSON 的 environment、dependencies 做深度比较均一致。构建不读取浏览器业务快照，Mock 种子未改动。

最终构建相对优化前只有三个构建输入哈希变化：`src/router/index.js`（页面动态 import）、`src/utils/statsCharts.js`（ECharts 按需注册）、`package.json`（浏览器验证入口增加）；依赖和 lockfile 不变。测量脚本及所有旧记录保留。

| 阶段 | JS 总量 kB | JS gzip 总量 kB | 最大 JS chunk kB | JS chunk 数 |
| --- | ---: | ---: | ---: | ---: |
| 优化前 | 2166.382 | 722.921 | 2161.732 | 2 |
| 仅完成页面懒加载 | 2161.911 | 724.235 | 1035.326 | 7 |
| 懒加载 + 图表按需 | 1622.270 | 547.485 | 998.102 | 7 |

最终相对优化前：

- JS 总量减少 544,112 bytes，25.12%。
- JS gzip 总量减少 175,436 bytes，24.27%。
- 最大 JS chunk 减少 1,163,630 bytes，53.83%。各阶段最大文件可能不同，统计的是该阶段的最大值。

## 两项改动的实际作用

页面懒加载将 Login、TaskList、Kanban、Stats、Projects 分别通过路由动态 import。浏览器资源记录验证按访问时机请求、同文档重访复用模块、业务路由冷刷新不预加载其他页面。仅做分包时 gzip 总量实际增加 1,314 bytes，分包本身没有带来总 gzip 改善。

ECharts 使用 core、PieChart、BarChart、标题/提示/图例/网格组件及 CanvasRenderer。路由懒加载后 Stats 文件原为 1,035,326 bytes、gzip 343,685 bytes；按需注册后为 495,685 bytes、gzip 166,934 bytes。其余图表选项、默认外观、统计口径和尺寸/卸载流程沿用既有实现。

当前最大文件仍是应用入口 `assets/index-CdSqMEmh.js`，998,102 bytes，gzip 334,177 bytes。构建保留超过 500 kB 及静态/动态导入混用提示；未隐藏警告，也未额外改造 Element Plus 的既有全局注册方式。

## 计量口径与原始证据

1 kB = 1000 bytes。JS 总量为 dist 中所有 `.js` 文件的真实 UTF-8 文件字节；gzip 总量为逐 JS 文件压缩后求和，不含 CSS/HTML，也不等同于某次浏览器访问的实际传输量。Vite 日志可能按字符串长度展示未压缩值，比较以本脚本 JSON 的 bytes 为准。

- [优化前](stage5-before-2026-11-04-build.json)
- [仅页面懒加载](stage5-routes-lazy-2026-11-04-build.json)
- [最终构建](stage5-after-2026-11-04-build.json)
- [环境核对及差值计算](PERFORMANCE_COMPARISON_2026-11-04.json)
- [最终构建日志](BUILD_2026-11-04.txt)

复现需先执行 `npm run build`，再用新名称执行 `npm run measure:build -- new-label stage5`。脚本拒绝覆盖已存在的指标记录。
