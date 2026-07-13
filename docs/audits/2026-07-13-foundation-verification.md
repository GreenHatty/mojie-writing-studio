# PR A 本地基础架构验证记录

日期：2026-07-13
分支：`codex/mojie-platform-foundation-a`
堆叠基线：`codex/mojie-stability-hotfix`

## 已验证

- TypeScript：`npm run typecheck`。
- 单元测试：54 个测试文件、136 项测试。
- Worker 构建与入口检查：`npm run build`、`npm run test:worker-entry`。
- 临时本地 D1：`npm run test:d1-local`，实际执行全部 0001–0004 迁移，检查平台基础表、唯一 Owner 槽位、`sync_operations.client_operation_id` 幂等和会话只保存摘要。
- 临时本地 Worker + D1：`npm run test:core-worker-local`，检查 Owner 初始化、登录、无缓存草稿密钥、建书、标准 Tiptap JSON 保存、重复操作、冲突副本和注销后会话立即失效。
- 浏览器回归：`npm run test:e2e`，桌面、平板和 390px 手机的 PR 0 创建、离线编辑、切换和榜单按需加载通过。

## 已确认的边界

- 本地 D1 仅位于 `test/.wrangler`，不连接或修改任何远程 D1。
- 测试使用的 Owner 初始化值和 KEK 是固定的非生产测试材料；真实 `.env*`、密钥、Cookie、正文和本地 D1 状态均被忽略规则排除。
- 没有创建 Cloudflare 资源、没有执行部署、没有推送 `sites` 远程。
- R2 保持关闭；没有创建 Bucket。

## 未宣称通过

- 未执行远程 Cloudflare D1 或 Worker 验收，因为本阶段不部署。
- 未执行真实授权榜单、WebDAV/S3、DOCX 或平台发布的外部验收。
- 旧界面在直接 `vinext dev` 下仍依赖旧 `/api/site/public` 与 `/api/auth/*` 兼容接口；真实浏览器已确认其会显示启动失败。这不是基础 API 的失败，而是 PR B 必须完成的客户端迁移工作。PR B 完成前，不应把旧界面列为已接入新安全架构。
