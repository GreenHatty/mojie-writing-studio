# Cloudflare D1 自动配置、预览验收与正式部署

墨界采用 **D1 必选、R2 不启用** 的部署模式：

- 登录、邀请、作品权限、正文修订、批注、建议、榜单配置和审计日志保存在 D1；
- DOCX 原件与编辑件保存在当前浏览器 IndexedDB，并支持手动下载；
- 自动备份可由用户自行配置 WebDAV 或 S3 兼容对象存储；
- Cloudflare R2 不创建、不绑定、不访问，因此无需开通 R2 订阅。

真实 Cloudflare 账户的首次授权不能写入代码仓库，也不能由未连接 Cloudflare 账户的会话代替完成。

## 自动化工作流

### `.github/workflows/cloudflare-preview.yml`

在同仓库 PR 更新或手动运行时执行。配置 Cloudflare 授权后，该工作流会：

1. 创建本次运行专用的临时 Worker；
2. 创建临时 D1；
3. 应用 `0001_cloud.sql` 和 `0002_collaboration_admin.sql`；
4. 随机生成临时 `MOJIE_ADMIN_TOKEN` 与 `MOJIE_BACKUP_MASTER_KEY`；
5. 构建并部署预览 Worker；
6. 验收未登录隔离、作品邀请、editor/viewer 权限、修订冲突、撤权清会话、批注、修改建议、排行榜白名单和管理统计；
7. 验证未绑定 R2 时 DOCX 云上传明确返回 503，不伪装为云端保存；
8. 验证 WebDAV/S3 备份策略接口可用；
9. 上传 JSON 验收报告；
10. 删除临时 Worker 和 D1。

预览密钥不会写入仓库，也不会成为长期生产密钥。如果没有 Cloudflare 授权，工作流只记录“未执行”，不会伪装成已部署。

最近一次真实 D1 隔离预览已完成资源创建、两份迁移、Worker 部署、14项跨账号检查、报告上传和资源清理，全部返回 `success`。

### `.github/workflows/cloudflare-production.yml`

只允许手动运行，并使用 GitHub `production` Environment。输入确认词 `DEPLOY_MOJIE` 后会：

1. 创建或复用稳定名称的 D1；
2. 应用全部未执行迁移；
3. 运行独立认证模块、隐私边界测试、单元测试、TypeScript、生产构建和 Worker 入口验证；
4. 部署 Worker；
5. 将 `MOJIE_ADMIN_TOKEN` 与 `MOJIE_BACKUP_MASTER_KEY` 写成 Cloudflare Worker Secret；
6. 检查 D1 绑定状态；
7. 验证未登录读取私人作品返回 401。

正式部署不会自动创建 R2，也不会在 PR 上自动发生。

## 一次性授权绑定

在 GitHub 仓库中打开：

`Settings → Secrets and variables → Actions`

为预览验收添加两个 Repository Secret：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Cloudflare API Token 只需要当前账户的：

- Workers Scripts：Write；
- D1：Write。

`Workers R2 Storage` 权限不再需要。现有 Token 即使包含该权限也不会自动产生费用，但可按最小权限原则重新创建 Token 并移除该权限。

不要把 Token 发到聊天、Issue、PR、代码、Actions 输入或普通变量中。

可选 Repository Variable：

- `MOJIE_AUTHORIZED_RANKING_URL`：已获授权的起点或番茄公开榜单 URL；
- `MOJIE_RANKING_AUTHORIZATION`：授权依据的非敏感说明。

未配置授权榜单 URL 时，预览只验证白名单和授权记录，不执行实时抓取。

## 正式环境密钥

在 GitHub `production` Environment 内添加：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `MOJIE_ADMIN_TOKEN`
- `MOJIE_BACKUP_MASTER_KEY`

建议为 production Environment 开启人工审批。可选 Environment Variable：

- `MOJIE_WORKER_NAME`
- `MOJIE_D1_DATABASE_NAME`

不填写时使用项目默认名称。

## 状态判断

只有满足以下条件，才能写入验证报告“D1 云端预览验收通过”：

1. 临时 D1 创建步骤实际执行，而不是 skipped；
2. Worker 成功部署；
3. `cloudflare-preview-acceptance-<run id>` 报告产物存在；
4. 报告内所有检查均为 passed；
5. 临时 Worker 与 D1 清理步骤执行；
6. `Quality` 工作流同时成功。

当前分支已经满足上述预览条件。正式生产环境仍需单独配置长期应用密钥并人工批准部署。
