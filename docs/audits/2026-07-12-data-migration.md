# 数据模型与正文迁移审计

## 正文标准

- `canonical_content`：带 `schemaVersion` 的 Tiptap JSON，是迁移后的唯一可编辑标准。
- `plain_text`：由标准正文派生，仅用于字数、搜索、检查和导出。
- `legacy_html`：只保存旧数据迁移输入和无法转换节点的原始备份，不接受新编辑写入。

## 映射

| 旧数据 | 新数据 | 处理 |
| --- | --- | --- |
| IndexedDB `works` | `works` | 保留旧 ID；冲突时生成映射但不覆盖目标 |
| IndexedDB `volumes` | `volumes` | 按作品和 position 导入 |
| IndexedDB `chapters.content` HTML | `chapters.canonical_content` | 解析为版本化 Tiptap JSON，并派生纯文本 |
| `cloud_documents.payload_json` | `works/volumes/chapters` | 先生成迁移预览，再拆分写入 |
| 本地 snapshots / 云修订 | `chapter_versions` | 保留时间、来源修订和原因 |
| notes | `chapter_notes` | 作为私人备注，不混入批注 |
| comments / suggestions | 对应独立表 | 保留作者、锚点和状态，失败项留在来源备份 |

## 迁移协议

1. 只读扫描并计算来源哈希、作品数、章节数和正文格式。
2. 创建不可变迁移预览，列出可转换、需人工确认和无法转换节点。
3. 用户确认后先创建完整来源备份，再写入 `migration_runs`。
4. `migration_id` 唯一；相同 ID 重试只返回既有结果，不重复导入。
5. 每部作品在独立事务边界处理；失败只回滚该作品。
6. 成功后保留旧数据，标记新格式可用，不立即删除来源。
7. 至少一个版本周期实行双读：优先新格式；新格式不存在时读取旧格式并提示迁移，不在读取时静默写回。
8. 兼容期结束和旧数据清理需要单独审批、备份验证及恢复演练。

## 失败保护

- HTML 节点无法识别时保留完整 `legacy_html` 和原始哈希。
- 目标作品已存在且哈希不同则建立冲突记录，不覆盖。
- 迁移日志只记录 ID、计数、哈希、状态和错误码，不记录正文。
- 正式数据禁止通过数据库重建、删除 IndexedDB 或清空表来“修复”迁移。
