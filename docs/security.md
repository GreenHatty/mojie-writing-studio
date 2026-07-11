# 安全边界

平台身份仅有 OWNER 和 WRITER；作品所有者由 `works.owner_id` 判断，协作角色为 EDITOR、COMMENTER 和 VIEWER。平台 OWNER 不会自动获得其他作者作品的正文权限。

认证使用 PBKDF2-HMAC-SHA-256、16 字节随机盐、600000 次迭代和 32 字节输出。会话与邀请令牌在数据库中只保存摘要。生产 HTTPS 只使用 `__Host-mojie-*` Secure cookie；开发 HTTP 只使用 `mojie-dev-*` cookie，生产不得降级。

所有认证与受保护响应使用 `Cache-Control: no-store, private`。变更请求必须通过同源 Origin 与双重提交 CSRF 校验。日志不记录正文、密码、cookie、令牌或原始数据库错误。

每位用户的本地草稿用 32 字节 DEK 加密。DEK 只以 `LOCAL_DRAFT_KEK` 封装后保存，浏览器登录后仅在内存中使用；缺少 KEK 或无法解封时拒绝读写草稿。
