# 墨界云端部署与初始化

本说明用于启用真正的受邀登录、作品级权限隔离、批注与修改建议、D1 云同步、排行榜自动任务和第三方定时备份。未完成这些步骤时，首页会显示“服务端数据库尚未绑定”，不会降级成虚假的多用户系统。

本项目当前采用 **D1 必选、R2 不启用** 的部署模式：DOCX 保存在浏览器 IndexedDB，并由用户手动下载；自动备份使用用户自己的 WebDAV 或 S3 兼容存储。

## 1. 创建 Cloudflare D1

```bash
npx wrangler@latest d1 create mojie-writing-studio
```

记录 D1 返回的 `database_id`。生产构建时配置：

```text
CLOUDFLARE_D1_DATABASE_ID=<D1 database_id>
CLOUDFLARE_D1_DATABASE_NAME=mojie-writing-studio
MOJIE_CRON_SCHEDULE=*/15 * * * *
```

不要配置 `CLOUDFLARE_DOCX_BUCKET_NAME` 或 `CLOUDFLARE_BACKUP_BUCKET_NAME`。生成的 Worker 将不会包含任何 R2 绑定。

`MOJIE_CRON_SCHEDULE` 是 Worker 的检查频率。具体作品是否到期备份，由每条第三方备份策略的 `interval_minutes` 决定；临时备份何时删除，由 `retention_hours` 决定。

## 2. 应用数据库迁移

```bash
npx wrangler@latest d1 migrations apply mojie-writing-studio --remote
```

必须应用全部迁移：

- `migrations/0001_cloud.sql`：用户、邀请、会话、作品成员、云端修订、DOCX元数据、榜单、备份和审计；
- `migrations/0002_collaboration_admin.sql`：站点设置、段落批注、修改建议和发布记录。

DOCX 云存储表仍保留，便于未来自愿启用对象存储，但当前未绑定 R2 时相关云上传接口会明确返回 503。

## 3. 配置 Worker 密钥

必须使用托管密钥，不要写入仓库或 `NEXT_PUBLIC_*`：

```bash
npx wrangler@latest secret put MOJIE_ADMIN_TOKEN
npx wrangler@latest secret put MOJIE_BACKUP_MASTER_KEY
```

- `MOJIE_ADMIN_TOKEN`：仅用于首次创建站点所有者，建议至少32个随机字符；
- `MOJIE_BACKUP_MASTER_KEY`：用于 AES-GCM 加密 WebDAV/S3 访问凭据。

## 4. 构建和部署

```bash
npm ci --legacy-peer-deps
node scripts/test-privacy-guard.mjs
npm test
npm run typecheck
npm run build
npm run test:worker-entry
```

部署 `dist`。生成的 `dist/wrangler.json` 只包含：

- `DB`：D1 数据库绑定；
- Cron：默认每15分钟执行榜单采集、到期第三方备份和过期对象清理。

Worker 服务端目录还必须包含：

- `mojie-api.mjs`：认证、云端正文、DOCX可选接口、榜单和备份；
- `mojie-extended-api.mjs`：站点设置、管理后台、成员、批注和建议；
- `mojie-privacy-guard.mjs`：在所有私人内容路由之前强制检查明确的作品成员关系。

## 5. 首次创建站点所有者

打开网站，选择“首次初始化”，输入：

- 所有者邮箱；
- 显示名称；
- 至少10位密码；
- `MOJIE_ADMIN_TOKEN`。

初始化接口只允许在用户表为空时执行。创建成功后获得 HttpOnly、Secure、SameSite=Strict 会话 Cookie。

## 6. 邀请、作品权限与撤回

账户面板可创建账户级邀请；进入作品后，在“设定 → 作品权限、批注与修改建议”中创建作品级邀请。

角色：

- `owner`：作品全部权限；
- `admin`：站点管理能力，但不自动获得用户作品正文访问权；
- `writer`：读写正文；
- `editor`：读写、编辑、批注与建议；
- `commenter`：只读、批注和建议；
- `viewer`：只读。

隐私规则：

1. 前端显示的角色不作为授权依据；
2. 每次私人内容请求先查询有效会话，再查询 `work_members`；
3. 即使是全局 Owner/Admin，没有该作品的明确成员记录也不能打开正文；
4. 撤销成员后清除该用户现有会话；
5. 写入要求 `baseRevision` 与云端一致，不一致时返回409；
6. 邀请、授权、撤权和建议处理写入审计日志。

## 7. 批注与修改建议

- 批注只保存引用文字、位置和说明，不修改正文；
- 修改建议保存原文、替换文本和理由；
- 接受时浏览器再次读取当前文字；
- 当前文字与建议原文不一致时拒绝自动应用；
- 接受成功后仍进入普通自动保存和版本冲突流程。

## 8. 管理后台与站点名称

Owner/Admin 可查看运行统计、用户状态、邀请记录和审计日志。只有 Owner 可以修改全局用户角色、停用账号、修改站点名称以及设置默认邀请和回收站期限。

管理后台不提供任意浏览作者正文的页面。

## 9. PWA 与离线缓存

- 只缓存同源脚本、样式、字体、图片和 Worker 等静态资源；
- 不缓存 `/api/`；
- 不缓存页面导航请求；
- 不缓存认证后的私人 HTML；
- 正文离线恢复依靠每位用户独立的 IndexedDB 草稿。

## 10. DOCX 本地文件库

1. 浏览器解析 DOCX 的 ZIP/OOXML 包；
2. 未修改时导出原始字节，SHA-256 与导入文件一致；
3. 原格式编辑要求段落数量不变，只替换 `word/document.xml` 的正文文本节点；
4. 图片、样式、编号、关系、页眉页脚、脚注等未编辑包部件原样保留；
5. 原件与编辑件可按当前账号和作品保存在浏览器 IndexedDB；
6. 用户可随时下载原件和编辑件到电脑；
7. 不上传到 Cloudflare R2，因此不会产生 R2 费用。

清除浏览器站点数据会删除本机文件库，必须定期手动下载或使用其他备份方式。

## 11. 排行榜自动采集

所有者或管理员配置平台、榜单、分类、已授权官方榜单网址和授权记录。Worker 只允许访问对应平台域名白名单，最多保留前十名公开元数据并生成热点元素统计。不读取付费章节，不绕过登录、验证码或反爬限制。

## 12. 自动临时备份

每条策略可独立设置：

- 目标：WebDAV 或 S3 兼容对象存储；
- 自动备份间隔：5分钟到30天；
- 自动删除期限：1小时到365天；
- 指定作品或账号全部云端作品。

WebDAV/S3 凭据在写入 D1 前使用 `MOJIE_BACKUP_MASTER_KEY` 做 AES-GCM 加密。Cron 创建 JSON 快照，并在到期后调用对应存储的删除接口。

## 13. 上线验收

至少完成：

1. 未登录访问云端数据返回401；
2. 没有成员记录的全局管理员访问正文返回403；
3. viewer写入返回403；
4. commenter不能直接写正文，但可以创建批注和建议；
5. writer不能使用站点级管理接口；
6. 旧修订写入返回409；
7. 邀请过期、撤销或使用后不能再次注册；
8. 成员撤权后旧会话不能继续读取作品；
9. 正文变化后旧建议不能自动套用；
10. DOCX 本机保存、重新载入和下载可用；
11. 未绑定 R2 时 DOCX 云上传返回503；
12. 排行榜来源不能跳转到非白名单域名；
13. WebDAV或S3测试备份能创建并在到期后删除；
14. Service Worker 不缓存 `/api/`、导航和私人 HTML；
15. 审计日志记录邀请、登录、作品写入、成员、批注、建议、榜单和备份操作。
