# 平台角色与作品访问迁移审计

## 目标模型

- 平台角色：`OWNER | WRITER`。
- 作品拥有者：由 `works.owner_id` 判断。
- 作品成员角色：`EDITOR | COMMENTER | VIEWER`。
- 平台 Owner 只拥有平台管理能力；没有作品成员关系时不能读取其他作者正文。

## 旧角色迁移

| 旧值 | 平台角色 | 作品访问迁移 |
| --- | --- | --- |
| owner | OWNER | 仅对其 `owner_id` 作品拥有全部权限 |
| admin | WRITER | 保留平台管理授权需人工确认；不得自动获得作品访问 |
| writer | WRITER | 其拥有作品由 `owner_id` 判断 |
| editor | WRITER | 仅根据现有 `work_members` 建立 EDITOR |
| commenter | WRITER | 仅根据现有 `work_members` 建立 COMMENTER |
| viewer | WRITER | 仅根据现有 `work_members` 建立 VIEWER |

不从全局角色推断作品成员。缺少明确 `work_id + user_id` 关系时不创建访问权限。

## 权限入口

统一使用 `requireSession()`、`requireOwner()`、`getWorkAccess(userId, workId)` 和 `requireWorkRole(userId, workId, roles)`。所有领域参数使用 `workId`，不得混用 `novelId`。

## 验收

- Owner 普通作品列表不包含其他作者作品。
- Viewer 只读；Commenter 可批注和建议但不能改正文；Editor 可编辑但不能删除或转移作品。
- 撤销成员后既有会话立即失去该作品访问。
- 角色迁移重复执行不新增重复成员。
- 邀请、授权、撤权和角色迁移写入不含正文的审计日志。
