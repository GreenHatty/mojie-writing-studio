# 墨界·私人网文创作台

当前开发分支正在建设私有认证、D1/R2 持久化和加密离线同步，尚未部署。

当前已具备服务端作品与卷章目录、三栏编辑器、加密离线草稿、幂等同步、历史版本、冲突恢复、私人备注、协作建议和回收站。高级模板、导入导出、榜单和平台发布仍按功能矩阵保留为后续阶段。

本地验证：

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run test:worker-entry
```

2026-07-12 最近一次完整验证：48 个测试文件、91 项测试通过，类型检查、生产构建和 Worker 入口检查通过。使用本地模拟 API 的 Microsoft Edge 验收覆盖桌面、1080px 平板和 390px 手机视口，修复 IndexedDB 操作 ID 竞态后控制台无错误。浏览器产物位于被 Git 忽略的 `output/playwright/` 与 `.playwright-cli/`。

生产环境必须配置 D1 `DB`、R2 `OBJECTS`、`OWNER_INITIALIZATION_KEY`、`LOCAL_DRAFT_KEK`、`MOJIE_ADMIN_TOKEN` 和 `MOJIE_BACKUP_MASTER_KEY`。外部备份还需要 WebDAV 或 S3 账号。实际值只保存在受保护 Secret 中，不得提交仓库。

当前生产条件状态见 [docs/production-readiness.md](docs/production-readiness.md)。
