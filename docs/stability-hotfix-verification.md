# PR 0 稳定性热修验证报告

日期：2026-07-12

分支：`codex/mojie-stability-hotfix`

基线：`origin/main`

## 修复范围

- 删除监听并修改整个 `document.body` 的 `MutationObserver`，站点名称通过 React Context 和 Props 更新。
- 浏览器请求统一支持调用方取消；读取默认 12 秒，创建和保存默认 15 秒。
- 启动和 IndexedDB 打开增加显式失败、blocked、versionchange、升级失败及连接关闭状态，不再只有无限加载界面。
- 排行榜退出工作台首屏，用户主动打开后才动态加载；首次只读取来源及各来源最新成功快照。
- 榜单抓取改为 `202 + taskId` 后台任务，支持 queued、fetching、parsing、validating、completed、partial、failed、cancelled。
- 起点和番茄使用独立 V1 适配器；限制 HTTPS、授权域名、重定向、响应体、超时和有限重试。
- 图谱、DOCX、模板、课堂、检查及排行榜等辅助模块使用动态加载或局部错误边界，不再控制正文编辑器生命周期。

## 自动验证

- Vitest：24 个测试文件、83 项测试通过。
- TypeScript：严格类型检查通过。
- Vinext：生产构建通过。
- Worker：入口、后台任务、独立排行榜适配器与 Cron 打包验证通过。
- 排行榜脱敏 fixture：正常页面、结构变化、空结果、403、429、验证码、越权重定向、重复作品、不足十项、超大响应和非法地址通过。
- 本地 Wrangler D1：依次应用 `0001`、`0002`、`0003_ranking_tasks.sql`，确认任务表和状态字段存在。

## 浏览器验证

- Playwright 覆盖 1440×900、1024×768 和 390×844。
- 三个视口均完成首次建书、进入正文、输入、离线追加、本地保存及返回工作台。
- 三个视口均无页面水平溢出。
- 桌面端确认工作台启动时没有榜单请求，点击“打开平台榜单”后才发起一次来源请求。
- 交互阶段记录浏览器 Long Task，门槛为不得出现超过 100ms 的任务。

## 外部验收状态

- GitHub PR 的 Cloudflare D1 Preview Acceptance 会创建隔离临时 D1、应用三份迁移、部署临时 Worker并验证 `202` 榜单任务；结束后删除临时资源。
- 未提供授权排行榜 URL 时只验证白名单、任务状态和 fixture，不声称真实平台抓取成功。
- 未提供 WebDAV/S3 账号时只保留“已实现但需外部配置”状态。
- R2 未启用、未创建、未绑定，也不是本 PR 的前置条件。
