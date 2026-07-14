# PR F 最终安全、迁移、性能与浏览器验收

## 最终修订

- 迁移生成的卷章 ID 加入旧作品 ID，避免多部旧作品复用 `v1`、`c1` 等编号时冲突。
- 旧兼容 Worker 和核心运营 Worker 的未知异常日志改为固定结构化错误码，不再传入原始 `Error` 对象。
- 运营抽屉新增明确的可访问名称、自动焦点和 Escape 关闭。
- 增加提交内容秘密扫描、缓存策略、Cookie、日志、R2-off、迁移与全局 DOM 监听回归审计。
- 将 Next 与 Vite 的 PostCSS 统一覆盖为 `8.5.16`，消除旧版 CSS stringify XSS 公告；生产与完整依赖审计均为 0 漏洞。

## 安全验收

- 平台角色与作品权限继续分离；平台 Owner 的普通作品列表不暴露其他作者作品。
- 未授权账号不能读取作品正文、设定、发布记录或备份对象。
- Viewer 不能修改设定或记录发布；Editor 只能在已授权作品中修改。
- 会话与邀请只保存摘要，过期、撤销和注销后立即失效。
- 所有核心与运营响应使用 `Cache-Control: no-store, private`。
- Service Worker 只缓存版本化公开静态资源，不缓存导航、API、正文或私人 HTML。
- 每用户 IndexedDB、32 字节 DEK、内存解封、注销清除与错误密钥失败关闭已有单元测试。
- WebDAV/S3 凭据只以 AES-GCM 密文、IV 和版本保存；缺少主密钥时失败关闭。
- 日志不记录正文、密码、Cookie、会话令牌、邀请令牌或外部存储凭据。

## 迁移与回滚验收

- 本地真实 Worker + 临时 D1 执行迁移预览。
- 相同 `migration_id` 重复预览返回幂等结果。
- 相同 `migration_id` 重复执行不创建第二份作品。
- Tiptap JSON 作为规范正文，`plain_text` 为派生字段，旧 HTML 和来源哈希继续保留。
- 逐作品回滚使用可恢复软删除，不删除旧来源数据。
- 另一账号使用相同 `migration_id` 得到 404，不可推断迁移记录存在。

## 性能与浏览器验收

- 桌面、平板和 390px 手机覆盖启动、建书、打开、编辑、离线、重连、返回工作台和响应式抽屉。
- 连续输入和切换流程监控浏览器 Long Task，辅助模块不得产生超过 100ms 的正文交互阻塞。
- 大纲/关系图、DOCX、榜单和外部备份按需加载并单独记录长任务预算。
- 所有可见按钮、链接、输入框、选择器、文本框和正文编辑区必须具有可访问名称。
- 运营抽屉打开后焦点落在关闭按钮，Escape 可关闭；各端无水平溢出。

## 最终命令

- 单元测试结果：64 个测试文件、172 项测试全部通过。
- 浏览器结果：桌面、平板和 390px 手机共 18 个场景，12 个通过，6 个按设备能力条件跳过，0 个失败。
- `npm run typecheck`
- `npm test`
- `npm run test:security-final`
- `npm audit --omit=dev --audit-level=moderate`
- `npm audit --audit-level=moderate`
- `npm run build`
- `npm run test:worker-entry`
- `npm run test:d1-local`
- `npm run test:core-worker-local`
- `npm run test:e2e`

## 外部验收状态

- 真实起点/番茄授权公开来源：已实现但需外部配置。
- 真实 WebDAV：已实现但需外部配置。
- 真实 S3 兼容存储：已实现但需外部配置。
- 生产 D1 数据迁移预演：必须由人工审核后在隔离副本执行。

本分支未合并 `main`、未创建生产资源、未部署、未推送 `sites`。
