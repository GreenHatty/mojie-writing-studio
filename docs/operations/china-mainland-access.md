# 中国大陆访问部署准备

## 当前边界

`workers.dev` 是 Worker 的默认开发与全球访问域名，不能作为中国大陆稳定直连的保证。应用代码无法通过重试、代理或前端改写消除这条网络边界。

本项目已支持把生产 Worker 绑定到一个已加入同一 Cloudflare 账户的自定义域名，并用该域名完成上线冒烟检查。要获得中国大陆境内的正式加速与稳定服务，仍需完成域名、备案和 Cloudflare China Network 的外部开通流程。

## 正式路径

1. 准备自有域名，并把域名加入当前 Cloudflare 账户。
2. 按网站主体所在地要求完成 ICP 备案；备案号应显示在网站底部并链接至工信部备案系统。
3. 若需要中国大陆境内节点，开通 Cloudflare Enterprise 与 China Network，并完成京东云内容审核和相关补充协议。
4. 在 GitHub 仓库变量中配置 `MOJIE_ICP_NUMBER`，值为完整备案号，例如 `京ICP备XXXXXXXX号-X`。
5. 手动运行 `Cloudflare Production Provision` 工作流：
   - `confirmation` 填写 `DEPLOY_MOJIE`。
   - `custom_domain` 填写裸域名，例如 `write.example.cn`，不要包含协议、端口、路径或通配符。
6. 工作流会把域名作为 Worker Custom Domain 写入部署配置，并对该 HTTPS 域名执行首页、会话、草稿密钥和静态资产校验。

## 验收

- 域名根路径返回 200。
- 未登录会话与草稿密钥接口返回 401，并带有 `Cache-Control: no-store, private`。
- 页面底部展示正确备案号。
- 分别从中国大陆三网进行真实访问、登录、创建作品、编辑和同步测试。
- `workers.dev` 只保留为运维回退地址，不对外作为中国大陆主入口。

## 禁止做法

- 不使用未备案域名宣称中国大陆稳定可访问。
- 不通过未授权反向代理、中转或域前置绕过网络要求。
- 不把 Cloudflare 全球自定义域名误报为已经启用 China Network。
- 未完成真实三网验收时，只能标记为“自定义域名部署能力已就绪”。
