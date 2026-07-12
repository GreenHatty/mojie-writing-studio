# Cloudflare D1 自动配置、预览验收与正式部署

墨界采用 **D1 必选、R2 不启用** 的部署模式：

- 登录、邀请、作品权限、正文修订、批注、建议、榜单配置和审计日志保存在 D1；
- DOCX 原件与编辑件保存在当前浏览器 IndexedDB，并支持手动下载；
- 自动备份可由用户自行配置 WebDAV 或 S3 兼容对象存储；
- Cloudflare R2 不创建、不绑定、不访问，因此无需开通 R2 订阅。

## 自动化工作流

### 隔离预览

`.github/workflows/cloudflare-preview.yml` 会自动：

1. 创建本次运行专用的临时 Worker 与 D1；
2. 应用 `0001_cloud.sql` 和 `0002_collaboration_admin.sql`；
3. 随机生成临时 `MOJIE_ADMIN_TOKEN` 与 `MOJIE_BACKUP_MASTER_KEY`；
4. 检查独立认证模块、隐私守卫、单元测试与 TypeScript；
5. 构建并部署预览 Worker；
6. 验收登录、邀请、editor/viewer 权限、修订冲突、撤权、批注、建议、排行榜白名单和管理统计；
7. 验证未绑定 R2 时 DOCX 云上传明确返回 503；
8. 验证 WebDAV/S3 备份策略接口可用；
9. 上传 JSON 验收报告；
10. 删除临时 Worker 和 D1。

预览密钥不会写入仓库，也不会成为长期生产密钥。

真实 D1 隔离预览 run `29178727652` 已完成资源创建、迁移、Worker 部署、14项检查、报告上传和资源清理，全部为 `success`。

### 正式环境

`.github/workflows/cloudflare-production.yml` 只允许手动运行，并使用 GitHub `production` Environment。输入确认词 `DEPLOY_MOJIE` 后会：

1. 创建或复用正式 D1；
2. 应用全部未执行迁移；
3. 运行独立认证模块、隐私边界、单元测试、TypeScript、生产构建和 Worker 入口验证；
4. 部署 Worker；
5. 写入 `MOJIE_ADMIN_TOKEN` 与 `MOJIE_BACKUP_MASTER_KEY`；
6. 检查 D1 绑定与未登录 401。

正式部署不会自动创建 R2，也不会在 PR 上自动发生。

## GitHub Secrets

Repository Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Cloudflare Token 只需要：

- Workers Scripts：Write；
- D1：Write。

`Workers R2 Storage` 权限不再需要。现有 Token 即使包含该权限也不会自动产生费用，但可按最小权限原则重新创建并移除该权限。

可选 Repository Variables：

- `MOJIE_AUTHORIZED_RANKING_URL`
- `MOJIE_RANKING_AUTHORIZATION`

正式 `production` Environment 另需：

- `MOJIE_ADMIN_TOKEN`
- `MOJIE_BACKUP_MASTER_KEY`

建议为 production Environment 开启人工审批。

## 验收成立条件

只有同时满足以下条件，才能宣称 D1 云端预览通过：

1. 临时 D1 实际创建；
2. Worker 成功部署；
3. 验收报告存在且全部检查为 passed；
4. 临时 Worker 与 D1 清理成功；
5. `Quality` 工作流成功。

当前分支已经满足上述预览条件。正式生产环境仍需单独配置长期应用密钥并人工批准部署。
