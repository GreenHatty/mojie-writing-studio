# 墨界·私人网文创作台：生产级基础架构设计

## 目标与范围

本阶段将现有的浏览器本地写作原型演进为私有、多用户可授权、可部署到 Sites/Cloudflare Worker 的写作平台基础层。它必须保留中文三栏编辑体验和 IndexedDB 离线草稿能力，同时将身份、权限、作品、章节、版本和审计记录迁移到服务端持久化接口。

本阶段完成后，未登录用户无法读取受保护内容；Owner 可通过一次性初始化密钥创建首个账户；已登录用户只能看到其有权限的作品；章节写入以 revision 控制并在冲突时保留双方内容。该阶段不部署、不公开发布，也不实现平台自动发布、验证码绕过或付费正文抓取。

## 当前基线

当前分支以 `origin/feature/mojie-core` 为源码基线，已存在下列经过测试的浏览器端能力：

- React 19、TypeScript、Next/Vinext、Tiptap、IndexedDB 与 Vitest。
- 长篇、短篇、随笔创建；首次创建时生成第一卷和第一章。
- 三栏编辑器、章节备注、命名版本、版本恢复、字数统计、主题与响应式抽屉。
- IndexedDB 中的作品、分卷、章节、草稿、快照、设置和审计记录。
- 基于 `baseRevision` 的本地乐观并发函数；冲突时创建章节副本。

当前原型尚不能作为私有生产应用使用：`ownerId` 是浏览器传入的固定值，没有登录或服务端鉴权；所有持久化都在 IndexedDB；自动快照首次保存不会触发；Autosaver 在组件卸载时只清除计时器，可能遗失待提交内容；工作台直接打开本地第一本作品；没有受控 API、会话、邀请、对象存储、迁移或服务端审计。

## 设计决策

### 1. 分层与依赖方向

```
UI features -> application services -> repository interfaces -> runtime adapters
                                   -> auth/permissions/audit
offline IndexedDB -> sync client -> protected HTTP API -> server repositories
```

组件只能调用 feature service 或 client repository，不直接读取数据库、环境变量或 Worker binding。服务端路由必须先获得 session，再调用统一权限函数，最后调用仓储实现并记录不含正文的审计事件。

建议目录：

```
src/server/auth/          会话、密码哈希、Owner 初始化、登录和退出
src/server/db/            schema、迁移、数据库仓储和测试内存适配器
src/server/storage/       对象存储接口、文件元数据和文件校验
src/server/permissions/   角色矩阵与 require* 守卫
src/server/audit/         不含正文的审计写入
src/server/sync/          章节 revision、冲突与快照服务
src/features/auth/        登录、初始化、会话客户端
src/features/invitations/ 邀请管理与接受流程
src/features/works/       工作台、作品/目录/回收站客户端
src/features/editor/      编辑器、版本、保存状态与冲突界面
src/features/settings/    用户外观与偏好
src/lib/offline/          IndexedDB 草稿、同步队列与旧数据迁移
src/lib/export/           仅定义未来导入导出边界，不实现格式转换
migrations/               可重复执行的关系型数据库迁移
```

### 2. 持久化与运行时配置

关系型数据使用 `DatabaseAdapter` 抽象；生产适配器只从 Worker 的运行时 binding 获得数据库。对象文件使用 `ObjectStorageAdapter`，保存封面、原始导入文件、导出文件、备份包和附件的元数据与私有对象键。测试使用独立内存适配器，永不连接生产绑定。

仓储首批表为：`users`、`invitations`、`sessions`、`works`、`work_members`、`volumes`、`chapters`、`chapter_versions`、`chapter_notes`、`audit_logs`、`profile_settings` 与 `file_metadata`。所有资源保留拥有者、创建/更新时间、角色或权限关联；正文存为结构化 Tiptap JSON 与其派生的纯文本边界。

项目不硬编码 Sites 项目 ID、数据库 ID、对象存储 ID、密码或密钥。`.env.example` 只列变量名和安全说明。缺少生产 binding 时，受保护服务端路由返回明确的配置错误；它绝不悄悄将私人数据写入公共浏览器模式。

### 3. 身份、会话与邀请

角色为 `OWNER`、`WRITER`、`EDITOR`、`COMMENTER`、`VIEWER`。首个 Owner 仅能使用服务端环境变量中的一次性初始化密钥创建；仓库不含默认明文密码。密码使用兼容 Worker Web Crypto 的慢哈希方案和随机盐。

登录失败返回统一错误。会话是随机、不可预测的服务端记录，浏览器只保存 `HttpOnly`、生产环境 `Secure`、`SameSite=Lax`、带明确过期时间的 cookie。注销撤销会话。邀请只持久化令牌摘要，支持有效期、一次性/可重复、指定角色、指定作品与撤销；接受后可创建或绑定账户，所有邀请操作写入审计。

权限服务提供 `requireSession`、`requireOwner`、`getNovelAccess`、`requireNovelRole`、`canReadNovel`、`canEditNovel`、`canCommentNovel`、`canManageMembers` 与 `canDeleteNovel`。服务端写操作再次校验权限，前端隐藏按钮不能代替校验。Owner 可管理系统和邀请，但常规作品列表不会自动暴露其他人的私人正文。

### 4. 作品与编辑器数据流

登录后的工作台按当前 session 查询可访问作品元数据，不预取所有章节正文。卡片展示真实标题、类型、更新时间、总字数和当前用户角色；统计从写作会话和作品聚合得出。页面必须有加载、空和错误状态，批注未完成时显示真实零值与“尚无批注”。

创建作品会原子创建作品、首卷与首章。服务端模型包含计划列出的作品字段，以及分卷排序/折叠、章节状态/目标/锁定/隐藏/revision/回收站状态。锁定章节拒绝普通编辑；删除进入回收站，永久删除须显式确认。初版排序可先提供键盘可访问的上移/下移动作。

编辑器保留 Tiptap、工具栏、专注/全屏、主题与响应式布局。右栏只展示真实备注、版本和章节目标；人物提示在人物模块完成前明确为空状态。设置服务器端持久化，并缓存到 IndexedDB 以支持离线启动。

### 5. 三层保存、冲突与版本

1. 正文输入防抖后先写 IndexedDB：当前草稿、界面偏好、待同步操作与冲突草稿；断网、刷新与异常关闭后可恢复。
2. 约一秒空闲后通过受保护 API 发送 `baseRevision`、结构化正文、纯文本与客户端操作 ID；切换章节、失焦和卸载前必须 `flush`。
3. 服务端创建不可变版本：手动命名、首次符合阈值的自动保存、每五分钟、恢复前，以及为未来导入/批量替换/导出预留的原因枚举。手动或收藏版本不得被自动清理。

若 `baseRevision` 过期，服务端不覆盖当前章节，而是持久化本地内容为冲突副本并返回双方版本。客户端显示差异，允许保留本地、保留云端或另存副本；处理前再创建快照。`dispose` 必须等待或交由生命周期调用方等待 flush，不能只清除定时器。

### 6. 旧 IndexedDB 数据迁移

登录后客户端检测旧数据库，并只显示作品/章节计数，直到用户点击确认。迁移前生成本地 JSON 备份；每个批次携带不可重复的 migration ID。服务端以事务创建作品、分卷、章节和初始版本并记录审计；成功后保留旧数据库，失败可安全重试。

### 7. 安全与错误处理

服务端验证所有输入并清理正文 HTML/Tiptap 允许节点，拒绝脚本、事件属性和危险 URL。写操作使用 CSRF 防护或同站请求验证。错误对用户使用稳定错误码和通用信息；日志不记录正文、密码、cookie、令牌或数据库异常细节。文件上传接口仅预留并验证大小/类型，API 密钥和绑定仅可在服务端使用。Worker 响应配置适配编辑器的 CSP 与基础安全头。

## 阶段边界

本阶段实现：私有认证、邀请与角色权限、服务端作品/章节/版本/审计、工作台、离线—云端同步、冲突恢复、旧数据迁移、三栏基础增强和测试。

后续阶段实现：模板库、校对/敏感词、完整大纲人物世界观、地图/关系图、榜单、导入导出格式、平台发布、实时协作、AI 辅助和高级全文检索。

明确不实现：未经授权自动发布、平台密码保存、验证码绕过、私有接口模拟、付费正文抓取、静态不可点击按钮伪装成功能、自动静默覆盖正文。

## 验收与可追溯状态

文档中的每个功能须标为以下之一：

- **已完成并测试**：有对应测试并通过。
- **已实现但需外部配置**：代码和测试完成，需绑定数据库、对象存储或环境变量。
- **尚未实现**：不能在 UI 或文档中表述为可用。

完成时必须通过 `npm run typecheck`、`npm test`、`npm run build` 和 `npm run test:worker-entry`；若增加 lint，再运行 `npm run lint`。提交前扫描 `.env`、密钥、数据库文件、缓存和临时产物；只推送 `origin/codex/mojie-platform-foundation`，绝不推送 `sites` 或合并/部署。
