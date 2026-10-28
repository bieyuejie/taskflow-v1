# 数据校验修正记录

> 本文保留2026-10-27的校验工具修正记录。后续持久化接入及8项问题修复见同目录 REPAIR_2026-10-28.md。

日期：2026-10-27。范围：根据代码检查结果修正 validateData.js 的校验缺项，消除未使用常量警告，并加入 Node assert 回归验证。

实施约定：

- 保持 validateSnapshot(snapshot) 的调用方式和 `{ ok, reason }` 错误返回，不新增模型字段、依赖或存储副作用。
- 补齐 Project.desc 类型与 500 字符限制；合法项目下允许空 tasks，projects 不允许为空。
- 项目/任务 ID 为规范的非负十进制时间戳字符串；createTime 为可表示有效日期的整数毫秒时间戳，拒绝 NaN、Infinity 和超出日期范围的值。
- 顶层 dueDate 为 null 或真实 YYYY-MM-DD 日历日期，使用年月日和闰年规则核对，避免 UTC 转换、时区偏移及 Date 对 0–99 年的特殊处理。
- 存在未完成子任务的父任务不能为 done；校验只拒绝非法快照，不修改状态。
- 在现有 verify 入口增加针对以上边界及既有关联规则的断言，不改用户正在编写的 storage.js，不实施 repository 或完整持久化。

## 实际修正

受影响文件：

- src/utils/validateData.js：补齐上述六类校验，拒绝用数组代替记录对象；MAX_PROJECT_DESC 已用于项目描述长度检查，未使用常量警告消除。
- scripts/verifyData.mjs：新增 83 组快照断言，覆盖长度边界、正常及非法日期、闰年与世纪年、低年份、时间戳、ID、非法引用、自引用/循环、重复 ID/名称、一级子任务限制及完成状态一致性。每组同时检查校验没有修改输入。
- scripts/verify.mjs：导入上述断言，使其随现有 npm run verify/check 执行。

id.js 本轮未再次改动；其上一轮拼写修正后的实现已验证 1000 次同毫秒生成无重复且递增，并在当前进程时钟回拨时继续递增。此验证不代表持久化加载后的 ID 高水位恢复已实现。

## 验证结果

| 命令/检查 | 结果 |
| --- | --- |
| npm run lint | 通过，零错误、零警告。 |
| npm run format:check | 通过。 |
| npm run verify | 新增83组快照断言、ID生成断言及原有Mock/CRUD/105条跨页读取/请求乱序断言全部通过。 |
| npm run check | 通过。 |
| npm run build | 成功，保留原有动态/静态混合引入及大包提示。 |

本次没有新增依赖，没有操作原 projects、用户浏览器数据或 DOCX，没有修改 storage.js，没有提交或推送。

## 未完成项

本次不是第二阶段完整验收。validateSnapshot 尚未接入 Mock repository/存储读写流程；损坏 JSON、未知版本保留、读写失败及原子回滚等持久化能力仍需第二阶段后续实现。不能仅凭工具断言和构建成功声称持久化或浏览器验收通过。
