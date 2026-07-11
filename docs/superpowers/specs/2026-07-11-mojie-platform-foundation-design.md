# 墨界·私人网文创作台：生产级基础架构设计

## 目标与阶段边界

本阶段将现有浏览器本地写作原型升级为可私有部署的基础平台：身份认证、服务端权限、关系型持久化、离线草稿、同步去重、版本和冲突恢复。它保留 React 19、TypeScript、Next/Vinext、Tiptap、IndexedDB、Vitest 与 Sites/Cloudflare Worker 兼容部署。

本阶段不部署、不公开发布、不合并 `main`；不实现平台自动发布、平台密码保存、验证码绕过、私有接口模拟、付费正文抓取、模板库、校对、图谱地图、榜单、完整导入导出、实时协作或 AI 写作辅助。任何未完成能力必须显示真实空状态或不可用说明，不能以不可点击的静态按钮伪装成功能。

## 当前基线与已知差距

`origin/feature/mojie-core` 已实现且有现有 Vitest 覆盖的浏览器端能力：长/短篇和随笔创建、首卷首章、Tiptap 三栏编辑器、章节备注、命名版本与恢复、字数统计、主题、响应式抽屉、IndexedDB 草稿和 `baseRevision` 冲突函数。

当前原型不能作为私有生产应用：`ownerId` 由浏览器持有、没有认证或服务端授权、所有数据在 IndexedDB、工作台依赖本地第一本作品、没有同步去重或迁移幂等、自动快照在 `lastSnapshotAt` 缺失时不创建、`dispose()` 清除计时器却可能丢失待提交内容。新实现必须保留原有 IndexedDB 数据作为可迁移输入，而不是删除它。

## 分层与运行时边界

```
features/UI -> application services -> repository interfaces -> runtime adapters
                              -> auth / permissions / audit / sync
IndexedDB (encrypted local draft) -> sync client -> protected API -> server repositories
```

组件不得直接读取数据库、Worker binding、环境变量或其他用户的数据。服务端路由必须依次执行 session、CSRF、输入验证、权限守卫、事务性业务服务和不含正文的审计。建议目录：

```
src/server/auth/          认证、密码哈希、会话、初始化、速率限制
src/server/db/            schema、迁移、生产与内存仓储适配器
src/server/storage/       私有对象存储、文件元数据、类型和大小校验
src/server/permissions/   平台身份、作品访问与统一 require/can 函数
src/server/audit/         只记录元数据的审计服务
src/server/sync/          乐观并发、操作去重、版本和冲突服务
src/features/auth/        初始化、登录、退出和受保护路由
src/features/invitations/ 邀请创建、撤销和接受
src/features/works/       工作台、作品、目录和回收站
src/features/editor/      编辑器、保存状态、版本和冲突界面
src/features/settings/    设置持久化
src/lib/offline/          用户隔离的草稿、队列、加密和旧数据迁移
src/lib/export/           仅定义未来边界，不实现格式转换
migrations/               可重复执行的关系型数据库迁移
```

`DatabaseAdapter` 与 `ObjectStorageAdapter` 是唯一的基础设施入口。生产实现仅从 Worker 运行时 binding 获得资源；测试使用独立内存适配器，绝不访问生产数据库。项目不硬编码项目 ID、数据库 ID、对象存储 ID、密码、令牌或密钥；`.env.example` 只含变量名称和说明。缺失生产 binding 时，受保护服务端路由明确报告配置错误，绝不回退成不安全的公共本地模式。

## 平台身份与作品访问：两个独立维度

平台身份只存在于 `users.platform_role`：

- `OWNER`：可初始化平台、管理用户邀请、查看运行状态和审计元数据；**不会**因平台身份自动获得其他作者私人作品的正文读取权。
- `WRITER`：普通平台账户，可创建和管理自己拥有的作品。

作品访问不存入平台角色，而由 `works.owner_id` 与 `work_members.role` 决定：

- 作品拥有者由 `works.owner_id` 判断，拥有该作品的管理能力。
- `EDITOR`：读写被授权作品、创建版本和备注；不能删除作品或转移所有权。
- `COMMENTER`：可读并创建批注/建议；不能修改正文。
- `VIEWER`：只读。

统一权限 API 为 `requireSession()`、`requireOwner()`、`getNovelAccess(userId, novelId)`、`requireNovelRole(userId, novelId, allowedRoles)`、`canReadNovel()`、`canEditNovel()`、`canCommentNovel()`、`canManageMembers()` 与 `canDeleteNovel()`。作品列表只返回当前用户可读作品的元数据；Owner 的普通列表不自动包含其他用户的私人作品。

## 数据模型、内容标准与唯一约束

所有记录保留创建/更新时间和必要的创建者/修改者。首批关系表如下：

| 表 | 核心字段与约束 |
| --- | --- |
| `users` | `id`、`platform_role`、账号标识、密码哈希元数据；只有 `OWNER` 或 `WRITER`。 |
| `sessions` | `token_hash` 唯一、`user_id`、CSRF 状态、`expires_at`、`absolute_expires_at`、`revoked_at`；绝不保存会话令牌明文。 |
| `invitations` | `token_hash` 唯一、角色、作品范围、有效期、一次性/可重复、撤销信息；绝不保存邀请令牌明文。 |
| `works` | 计划列出的书籍字段、`owner_id`、`version`、`deleted_at`、`deleted_by`、`delete_reason`。 |
| `work_members` | `work_id` + `user_id` 唯一，角色只允许 `EDITOR`/`COMMENTER`/`VIEWER`。 |
| `volumes` | `work_id`、标题、位置、折叠状态、回收站字段。 |
| `chapters` | `canonical_content`、`plain_text`、字数、状态、位置、目标、锁定/隐藏、`revision`、回收站字段。 |
| `chapter_versions` | 不可变快照、`reason` 枚举、标签、创建者、字数、收藏标记；冲突副本以 `reason=CONFLICT_COPY` 明确识别。 |
| `chapter_conflicts` | 当前版本、提交版本、冲突版本、解析状态和解决者；不能仅通过章节标题识别冲突。 |
| `chapter_notes` | 章节备注/批注元数据。 |
| `writing_sessions` | 用户、日期、增加字数、更新时间，供今日字数与连续写作统计。 |
| `writing_goals` | 用户或作品的周目标、周期与完成进度，供工作台周目标。 |
| `sync_operations` | `client_operation_id` 唯一、用户、章节、请求摘要、结果和时间；网络重试返回原结果，不重复保存。 |
| `migration_runs` | `migration_id` 唯一、用户、来源数据库、摘要、状态、错误码和时间；重复迁移不重复导入。 |
| `profile_settings` | 用户外观和编辑偏好。 |
| `audit_logs` | 行为、资源元数据、actor、时间；禁止存正文、密码、cookie、令牌或原始数据库异常。 |
| `file_metadata` | 私有对象键、归属、内容类型、大小、校验信息；对象存储保存封面、原始导入、导出、备份和附件。 |

`canonical_content` 固定为 Tiptap JSON，是正文唯一标准；`plain_text` 必须由 canonical JSON 派生。旧 HTML 只作为 `legacy_html` 迁移输入，永不成为后续标准字段。迁移时先清理并转换允许节点；无法识别的节点不丢弃，原 HTML 放入受保护的迁移备份对象，并记录 `MIGRATION_CONTENT_REVIEW_REQUIRED`，等待用户检查。

## 固定认证、安全与缓存决策

密码哈希固定为 Web Crypto `PBKDF2-HMAC-SHA-256`：每个密码使用 16 字节随机盐、600,000 次迭代、32 字节派生输出，持久化算法/迭代次数/盐/摘要。成功登录后若存储参数低于当前值，立即以当前参数重新哈希。首个 Owner 仅能凭环境变量 `OWNER_INITIALIZATION_KEY` 初始化；成功后将不可逆的 `owner_initialized_at` 写入数据库，初始化入口永久关闭。

会话令牌为 32 字节随机值，浏览器只接收 `__Host-mojie-session`（`HttpOnly`、生产环境 `Secure`、`SameSite=Lax`、`Path=/`）cookie，数据库只保存 SHA-256 摘要。会话闲置有效期为 12 小时、绝对有效期为 7 天；剩余小于 2 小时时，正常已认证请求可续期至 12 小时，但绝不超过绝对有效期。注销、过期和撤销都立即拒绝后续请求。所有认证、会话、初始化和受保护响应为 `Cache-Control: no-store, private`。

变更请求使用固定的双重提交 CSRF 方案：登录后设置非 HttpOnly 的 `__Host-mojie-csrf` 随机 cookie；每个变更请求必须携带相同值的 `X-CSRF-Token`，并且 `Origin` 必须精确匹配受配置保护的站点 Origin。服务端以常量时间比较 cookie/header，拒绝缺失或不匹配请求。登录、Owner 初始化和邀请接受使用同源 Origin 校验、速率限制与通用失败消息。

认证速率限制使用数据库或 Worker 绑定的原子计数器：登录以规范化账号+IP 限制为每 15 分钟 5 次失败，Owner 初始化和邀请接受以 IP 限制为每 15 分钟 3 次失败；超过限制只返回通用稍后重试错误。所有 API 错误使用稳定错误码，不返回账户存在性、数据库细节或令牌信息。正文 JSON/HTML 使用严格允许列表清理，拒绝脚本、事件属性、危险 URL 和未允许节点。Worker 响应使用兼容编辑器的 CSP 与基础安全头。

受保护 HTML、JSON、正文和文件下载均设置 `Cache-Control: no-store, private`；Service Worker 与普通 HTTP 缓存禁止缓存私人正文。文件上传仅预留受控接口，必须校验类型、大小、归属和私有对象键。

## 浏览器本地隔离、保存与冲突

IndexedDB 按认证的 `userId` 命名空间隔离，包含草稿、同步队列、设置和冲突草稿。草稿正文以用户专属本地存储密钥 AES-GCM 加密；密钥仅在成功登录后获取并保留在内存，不持久化到浏览器。注销时关闭当前用户数据库、清空内存状态和密钥，但不自动删除密文草稿；只有同一用户重新成功登录后才可解锁。用户 B 的应用流程不能打开用户 A 的草稿、设置或队列。

离线写作只保证当前已登录会话中已经打开且获授权的作品；离线状态绝不能跳过登录打开其他用户本地数据。旧未加密 IndexedDB 只通过显式迁移流程访问，并先生成本地 JSON 备份。

保存分为三层：

1. 输入后短暂防抖，先写入用户隔离的加密 IndexedDB 草稿和队列。
2. 约一秒空闲后调用受保护 API，发送 `baseRevision`、canonical JSON、派生纯文本和唯一 `client_operation_id`。切换章节必须等待本地写入和服务端 `flush()` 成功后才切换；组件正常卸载由调用方等待 `flush()`。
3. 服务端以事务检查访问、锁定与 revision，并记录不可变版本：手动命名、首次达到快照阈值、每五分钟、恢复前、冲突前；为未来导入/批量替换/导出保留版本原因。手动或收藏版本不会被自动清理。

`pagehide` 或浏览器关闭前不能承诺等待异步云端写入：必须保证 IndexedDB 草稿已写入，云端请求只进行 `keepalive` 最佳努力尝试。页面重新打开后队列自动重试。若 revision 过期，服务端不覆盖当前内容，而是创建 `chapter_versions.reason=CONFLICT_COPY` 和 `chapter_conflicts` 记录，并返回可比较的本地/云端内容；用户可保留本地、保留云端或另存副本，解析前先快照。

## 作品、目录、工作台和回收站

创建作品时事务性生成作品、首卷、首章。作品包含标题、备用书名、笔名、卖点、简介、受众、目标平台、分类/标签、预计字数、更新计划、状态、版权备注、AI 全文许可、类型、拥有者、版本和时间。章节含正文、字数、状态、排序、目标字数、剧情目标、锁定和隐藏。锁定章节会拒绝普通编辑。删除设置回收站字段；恢复清除该字段；永久删除必须显式二次确认且权限服务检查所有关联资源。

登录后工作台只加载当前用户可访问作品的元数据，不一次加载全文。它展示真实的最近作品、今日字数、连续写作、周目标、最近版本和真实批注计数；批注模块未完成时显示零与“尚无批注”。每张作品卡显示标题、类型、更新时间、总字数和当前用户的作品访问角色，并具有搜索、加载、空和错误状态。

编辑器保留真实可用的 Tiptap 工具栏、章节标题、查找替换、撤销重做、当前行高亮、专注/全屏、状态栏、备注、版本、主题、持久化字号/行距/宽度与移动端抽屉。人物提示在人物模块完成前只显示明确空状态。

## 旧数据迁移

登录后检测旧数据库并展示发现的作品/章节数量；必须由用户确认。迁移前生成本地 JSON 备份，迁移请求携带唯一 `migration_id`。服务端借助 `migration_runs.migration_id` 唯一约束在单个事务内创建作品、分卷、章节和初始版本，记录审计；相同 ID 重试返回已有结果而不重复导入。成功后保留旧数据，失败可重试，转换风险保留原 HTML 备份而不丢弃内容。

## 必须通过的测试与验收状态

新增测试必须使用内存适配器或 fake IndexedDB，绝不访问真实生产资源，并至少覆盖：

- 平台身份与作品访问矩阵：A 不能读 B 的作品；Viewer/Commenter 不能编辑；Editor 不能删除；Writer 可管理自己作品；Owner 可管理邀请但普通列表不暴露他人作品；撤销成员后立即失效。
- 首位 Owner 初始化、通用登录失败、退出、过期/撤销会话立即失效、会话续期和速率限制。
- 会话令牌与邀请令牌仅持久化摘要；认证/受保护响应有 `no-store`；审计和错误日志不含正文、密码、cookie 或令牌。
- `sync_operations.client_operation_id` 重试不会二次保存；revision 冲突保留双方内容和独立冲突记录；首次自动快照与恢复前快照；`dispose`、切换章节和 `pagehide` 的本地草稿保障。
- 同设备不同用户的 IndexedDB 隔离、注销锁定与同用户重新登录解锁；离线状态不能读取其他用户本地数据。
- `migration_runs.migration_id` 重试不重复导入；旧 HTML 转换失败保留原备份。
- canonical JSON 的派生纯文本、HTML 清理、工作台真实统计、目录/回收站和三栏桌面/平板/手机交互。

功能只可标为：**已完成并测试**、**已实现但需外部配置**、或 **尚未实现**。完成前必须通过 `npm run typecheck`、`npm test`、`npm run build`、`npm run test:worker-entry`，并在新增 lint 后运行 `npm run lint`。推送前扫描 `.env`、密钥、数据库文件、缓存和临时产物；只推送 `origin/codex/mojie-platform-foundation`，绝不推送 `sites`、合并或部署。
