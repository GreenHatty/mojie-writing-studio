# 生产环境准备状态

当前分支未部署，且没有写入任何真实账号或密钥。以下条件必须由项目所有者在受保护环境中配置后才能进行生产验收。

| 条件 | 当前状态 | 验证方式 |
| --- | --- | --- |
| Cloudflare D1，binding `DB` | 未配置 | `wrangler d1 list` 与迁移检查；当前 Wrangler 未认证。 |
| DOCX/备份 R2，binding `OBJECTS` | 未配置 | `wrangler r2 bucket list` 和私有读写探针；当前 Wrangler 未认证。 |
| `MOJIE_ADMIN_TOKEN` | 未配置 | 仅检查 Secret 存在与摘要验证，不输出值。 |
| `MOJIE_BACKUP_MASTER_KEY` | 未配置 | 必须为受保护随机密钥，仅用于备份封装，不输出值。 |
| WebDAV 或 S3 账号 | 未配置 | 使用独立测试对象执行上传、读取、删除探针。 |
| 获授权的榜单网址 | 未提供 | 保存平台、榜单名、公开网址、授权依据和抓取频率；未授权前禁用采集。 |
| 生产部署权限 | 未配置 | `wrangler whoami` 应显示目标账户且令牌仅具必要权限；当前返回未认证。 |

不得使用临时 Cloudflare 账户代替正式资源，不得把 Secret 写入 `.env.example`、仓库、日志或前端。完成配置前，生产运行时应返回 `CONFIGURATION_REQUIRED`。
