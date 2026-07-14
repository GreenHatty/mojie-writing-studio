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
2. 按顺序应用 `0001` 至 `0006` 的全部迁移；
3. 随机生成临时 `OWNER_INITIALIZATION_KEY`、32字节 `LOCAL_DRAFT_KEK`、`MOJIE_BACKUP_MASTER_KEY` 和兼容验收密钥；
4. 检查独立认证模块、隐私守卫、单元测试与 TypeScript；
5. 构建并部署预览 Worker；
6. 同时验收兼容 API 与规范核心 API，包括平台 Owner 初始化、生产 Cookie、草稿密钥、Tiptap 正文、保存幂等、迁移回滚、权限与会话撤销；
7. 验证未绑定 R2 时 DOCX 云上传明确返回 503；
8. 验证 WebDAV/S3 备份策略接口可用；
9. 上传 JSON 验收报告；
10. 删除临时 Worker 和 D1。

预览密钥不会写入仓库，也不会成为长期生产密钥。

每次正式部署前都必须重新运行隔离预览；旧预览记录不能替代当前提交的规范核心验收。

### 正式环境

`.github/workflows/cloudflare-production.yml` 只允许手动运行，并使用 GitHub `production` Environment。输入确认词 `DEPLOY_MOJIE` 后会：

1. 创建或复用正式 D1；
2. 应用全部未执行迁移；
3. 运行独立认证模块、隐私边界、单元测试、TypeScript、生产构建和 Worker 入口验证；
4. 部署 Worker；
5. 写入 `OWNER_INITIALIZATION_KEY`、`LOCAL_DRAFT_KEK` 与 `MOJIE_BACKUP_MASTER_KEY`；
6. 检查精确 HTTPS `APP_ORIGIN`、D1 绑定、未登录 401、`no-store` 与草稿密钥失败关闭。

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

- `OWNER_INITIALIZATION_KEY`（未配置时生产工作流可兼容读取现有 `MOJIE_ADMIN_TOKEN`）
- `LOCAL_DRAFT_KEK`（32个随机字节的 base64url 编码）
- `MOJIE_BACKUP_MASTER_KEY`

可选 Repository Variable：

- `MOJIE_APP_ORIGIN`：自定义域名的精确 HTTPS origin；未配置时工作流使用当前 Worker 的 `workers.dev` 地址。

建议为 production Environment 开启人工审批。

## 验收成立条件

只有同时满足以下条件，才能宣称 D1 云端预览通过：

1. 临时 D1 实际创建；
2. Worker 成功部署；
3. 验收报告存在且全部检查为 passed；
4. 临时 Worker 与 D1 清理成功；
5. `Quality` 工作流成功。

只有当前 `main` 提交对应的预览工作流成功后，才允许触发正式生产工作流。长期草稿 KEK 不得在已有用户草稿后自动轮换。
