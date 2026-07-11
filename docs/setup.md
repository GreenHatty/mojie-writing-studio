# 配置与本地运行

需要 Node 22 或更高版本。先运行 `npm ci`，然后使用 `npm run typecheck`、`npm test`、`npm run build` 与 `npm run test:worker-entry` 验证。

`.npmrc` 中的 `legacy-peer-deps=true` 只处理 Vinext 预发布版的 npm peer 解析；它不会跳过类型检查、测试、构建、Worker 入口验证或生产 binding 检查。

本地开发使用独立测试 D1/R2 资源或 Workers 本地资源，并设置 `NODE_ENV=development`。生产环境必须在受保护配置中提供 `DB`、`OBJECTS`、`APP_ORIGIN`、`OWNER_INITIALIZATION_KEY` 和 `LOCAL_DRAFT_KEK`；缺少任一项时受保护功能失败关闭。

创建 D1 后执行 `wrangler d1 migrations apply <database>`。R2 bucket 必须保持私有。资源标识和密钥不得写入仓库。
