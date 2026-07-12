# 墨界服务端与第三方能力接入说明

当前仓库默认运行在**离线优先、本机持久化模式**。正文、目录、版本、设定和偏好保存在浏览器 IndexedDB 中。该模式可以完成个人写作，但不能把“同一浏览器中的 ownerId 过滤”描述成真正的多用户安全隔离。

## 1. 邀请制身份验证

正式面向受邀用户开放前，必须提供服务端会话，并在每一次读写时验证会话身份。建议的数据对象：

- `users(id, email, display_name, status, created_at)`
- `invitations(id, token_hash, inviter_id, role, scope_type, scope_id, expires_at, max_uses, used_count, revoked_at)`
- `novel_members(novel_id, user_id, role, created_at, revoked_at)`
- `audit_logs(id, actor_id, action, target_type, target_id, metadata, created_at)`

邀请令牌只保存哈希；接受邀请后立即轮换会话。角色至少包括 `owner`、`writer`、`editor`、`commenter`、`viewer`。所有服务端写操作必须根据作品成员关系重新判断权限，不能信任前端传来的角色。

## 2. 云端数据库

本地 IndexedDB 继续承担即时草稿和离线队列。云端数据库保存已同步的作品与设定。章节写入请求必须包含：

```ts
type SaveChapterCommand = {
  chapterId: string;
  baseRevision: number;
  content: string;
  plainText: string;
  clientMutationId: string;
};
```

服务端只在 `baseRevision` 等于当前版本时更新；不相等时返回当前版本并创建冲突副本，禁止后上传内容静默覆盖先前内容。每次导入、批量替换、恢复和智能修改前创建快照。

## 3. 对象存储

对象存储用于封面、人物头像、地图底图、DOCX 原件、项目备份包和大型附件。上传接口必须检查 MIME、扩展名、文件头和大小，并使用不可猜测对象键。下载采用短期签名地址，不把存储桶设为公开。

## 4. DOCX

导入 DOCX 时：

1. 原始文件原样存入对象存储；
2. 解析基础段落、标题、加粗、斜体、缩进、行距、字体和分页；
3. 对文本框、域、复杂分节、页眉页脚和批注显示不完全支持警告；
4. 编辑后导出只承诺支持范围内的样式往返；
5. 用户始终可以下载未修改的原始文件。

禁止把 HTML 文件改扩展名伪装成 DOCX。

## 5. 排行榜

排行榜首版采用管理员上传 CSV/JSON 或点击受保护的更新接口。自动同步必须具备合法公开数据源或正式授权：

- 不请求登录后个人数据；
- 不绕过验证码或反爬机制；
- 不高频抓取；
- 不保存付费正文；
- 卖点拆解只处理公开书名、标签和简介；
- 保存来源、更新时间、成功状态和最近一次有效快照。

## 6. 平台发布

默认只提供标题/正文检查、干净副本、复制和人工发布记录。只有平台正式提供并授权作者写入接口后，才启用 `officialPublishingApi`：

- 使用 OAuth 或可撤销令牌；
- 令牌仅保存在服务端加密存储；
- 不保存起点或番茄密码；
- 不处理验证码；
- 正式发布前仍要求作者确认；
- 保存平台响应、章节号、审核状态和失败原因。

## 7. 智能辅助

只有站点所有者配置合规服务后才启用。默认只发送用户选中的文字；读取全书必须单独获得授权。输出进入建议面板，显示差异，由作者逐条接受。调用前创建版本，不能直接覆盖正文。

## 8. 环境变量

前端只使用公开能力标志和公开作者后台地址：

```text
NEXT_PUBLIC_MOJIE_AUTH_ENABLED
NEXT_PUBLIC_MOJIE_CLOUD_DATABASE_ENABLED
NEXT_PUBLIC_MOJIE_OBJECT_STORAGE_ENABLED
NEXT_PUBLIC_MOJIE_RANKING_SYNC_ENABLED
NEXT_PUBLIC_MOJIE_OFFICIAL_PUBLISHING_ENABLED
NEXT_PUBLIC_MOJIE_AI_ENABLED
NEXT_PUBLIC_QIDIAN_AUTHOR_URL
NEXT_PUBLIC_FANQIE_AUTHOR_URL
```

数据库密钥、对象存储密钥、平台令牌和模型密钥不得使用 `NEXT_PUBLIC_` 前缀，也不得写入仓库、前端 bundle、提示词或日志。

## 9. 上线前安全门槛

- 未登录请求不能读取任何作品数据；
- 撤销成员权限后服务端立即拒绝后续请求；
- 分享链接有过期时间、作用域、密码尝试限制和撤销能力；
- 内容输出进行 HTML 转义与脚本清理；
- 永久删除二次确认并记录审计日志；
- 管理后台不能在普通列表中展示用户正文；
- 备份恢复经过所有权和架构版本校验；
- 所有密钥仅存放于托管环境变量或密钥管理服务。
