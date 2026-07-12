# Cloudflare 自动配置、预览验收与正式部署

本项目已经把 D1、R2、数据库迁移、Worker 密钥、预览验收和正式部署编排为 GitHub Actions。真实 Cloudflare 账户的首次授权不能写入代码仓库，也不能由未连接 Cloudflare 账户的会话代替完成。

## 自动化工作流

### `.github/workflows/cloudflare-preview.yml`

在同仓库 PR 更新或手动运行时执行。

如果仓库已配置 Cloudflare 授权，该工作流会：

1. 创建本次运行专用的临时 Worker；
2. 创建临时 D1；
3. 创建 DOCX 与备份两个临时 R2 Bucket；
4. 应用 `0001_cloud.sql` 和 `0002_collaboration_admin.sql`；
5. 随机生成临时 `MOJIE_ADMIN_TOKEN` 与 `MOJIE_BACKUP_MASTER_KEY`；
6. 构建并部署预览 Worker；
7. 自动验收未登录隔离、作品邀请、editor/viewer 权限、撤权清会话、批注、修改建议、DOCX 哈希、排行榜白名单、R2 备份创建与到期删除、管理统计；
8. 上传 JSON 验收报告；
9. 删除临时 Worker、D1、R2 对象与 Bucket。

预览密钥不会写入仓库，也不会成为长期生产密钥。

如果没有 Cloudflare 授权，工作流只记录“未执行”，不会伪装成已部署或故意失败。

### `.github/workflows/cloudflare-production.yml`

只允许手动运行，并使用 GitHub `production` Environment。输入确认词 `DEPLOY_MOJIE` 后会：

1. 创建或复用稳定名称的 D1；
2. 创建或复用 `mojie-docx` 与 `mojie-backups`；
3. 应用全部未执行迁移；
4. 运行单元测试、TypeScript、构建和 Worker 入口验证；
5. 部署 Worker；
6. 将 `MOJIE_ADMIN_TOKEN` 与 `MOJIE_BACKUP_MASTER_KEY` 写成 Cloudflare Worker Secret；
7. 检查 D1 绑定状态；
8. 验证未登录读取私人作品返回 401。

正式部署不会在 PR 上自动发生。

## 一次性授权绑定

在 GitHub 仓库中打开：

`Settings → Secrets and variables → Actions`

为预览验收添加两个 Repository Secret：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Cloudflare API Token 应限制到墨界所在账户，并只授予完成以下操作所需的编辑权限：

- Workers Scripts；
- D1；
- Workers R2 Storage。

不要把 Token 发到聊天、Issue、PR、代码、Actions 输入或普通变量中。

可选 Repository Variable：

- `MOJIE_AUTHORIZED_RANKING_URL`：已获授权的起点或番茄公开榜单 URL；
- `MOJIE_RANKING_AUTHORIZATION`：授权依据的非敏感说明。

未配置授权榜单 URL 时，预览只验证白名单、授权记录和停用数据源，不会擅自执行实时抓取。

## 正式环境密钥

在 GitHub `production` Environment 内添加：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `MOJIE_ADMIN_TOKEN`
- `MOJIE_BACKUP_MASTER_KEY`

建议为 production Environment 开启人工审批，避免误操作直接部署。

可选 Environment Variable：

- `MOJIE_WORKER_NAME`
- `MOJIE_D1_DATABASE_NAME`
- `MOJIE_DOCX_BUCKET_NAME`
- `MOJIE_BACKUP_BUCKET_NAME`

不填写时使用项目默认名称。

## 当前状态判断

只有满足以下条件，才能写入验证报告“云端预览验收通过”：

1. `Cloudflare Preview Acceptance` 中资源创建步骤实际执行，而不是 skipped；
2. `cloudflare-preview-acceptance-<run id>` 报告产物存在；
3. 报告内所有检查均为 passed；
4. 临时资源清理步骤执行；
5. `Quality` 工作流同时成功。

仅工作流显示绿色，但资源步骤因未配置授权而 skipped，不代表 Cloudflare 已配置。
