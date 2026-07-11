# 墨界·私人网文创作台

当前开发分支正在建设私有认证、D1/R2 持久化和加密离线同步，尚未部署。

本地验证：

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run test:worker-entry
```

生产环境必须配置 D1 `DB`、R2 `OBJECTS`、`OWNER_INITIALIZATION_KEY`、`LOCAL_DRAFT_KEK`、`MOJIE_ADMIN_TOKEN` 和 `MOJIE_BACKUP_MASTER_KEY`。外部备份还需要 WebDAV 或 S3 账号。实际值只保存在受保护 Secret 中，不得提交仓库。

当前生产条件状态见 [docs/production-readiness.md](docs/production-readiness.md)。
