# 架构差异审计

审计对象：`origin/main`、`codex/mojie-stability-hotfix`、`codex/mojie-platform-foundation`。

## 结论

`codex/mojie-platform-foundation` 只能作为候选新架构，不能直接覆盖 `main`。整合必须以已通过 PR 0 的稳定性边界为前置，并通过选择性移植完成。

## 主要差异

| 边界 | main / PR 0 | platform-foundation | 决策 |
| --- | --- | --- | --- |
| Worker API | 打包多个 `scripts/mojie-*.mjs` 模块 | Next/Vinext Route Handler 与 `src/server` 服务 | 最终统一到类型化服务端仓储；旧脚本只作为行为来源，不整体合并 |
| 正文持久化 | IndexedDB 项目模型及 D1 `cloud_documents.payload_json` 总包 | D1 `works/volumes/chapters` 关系模型 | 禁止继续扩展总包；新写入使用关系模型，旧总包进入双读兼容 |
| 权限 | `global_role` 同时包含平台与作品语义 | 平台角色与作品访问分离 | 采用双维度模型，Owner 不自动读取他人作品 |
| 离线草稿 | 按账号命名 IndexedDB，正文可能为 HTML | 每用户独立库、加密草稿、幂等同步队列 | 采用加密模型，保留 PR 0 的 blocked/versionchange 恢复状态机 |
| 排行榜 | PR 0 已实现按需加载、202 后台任务和独立适配器 | 尚未实现 | 保留 PR 0 实现，通过统一服务边界接入，不回退同步抓取 |
| DOCX/备份 | 浏览器 DOCX + WebDAV/S3，可选 R2 代码 | `ObjectStorageAdapter` 要求 OBJECTS | 生产默认零 R2；OBJECTS 改为可选适配器，不得成为启动前置条件 |
| 产品功能 | 模板、工具、图谱、DOCX、榜单等较完整 | 安全写作核心 | 只移植已测试纯函数和 UI，所有数据访问重接统一仓储 |

## 禁止直接合并的实现

- `scripts/mojie-auth-api.mjs`、`scripts/mojie-api.mjs` 中与新服务端平行的认证和权限判断。
- `global_role` 中混入 `editor/commenter/viewer` 的旧角色语义。
- `cloud_documents.payload_json` 作为整部作品唯一数据库记录的架构。
- 未经过统一权限服务的直接 D1 查询。
- 同步排行榜抓取、通用跨平台正则解析和工作台启动时加载榜单。
- 缺少 AbortController、超时或恢复终态的网络和 IndexedDB 路径。

## 堆叠关系

PR A 必须以 `codex/mojie-stability-hotfix` 为比较基线。PR 0 的请求超时、可恢复状态机、模块隔离、排行榜任务和浏览器性能门槛均为不可回归约束。审计批准前不得执行架构代码整合。
