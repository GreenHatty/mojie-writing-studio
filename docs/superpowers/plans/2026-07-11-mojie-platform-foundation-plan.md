# 墨界·私人网文创作台：生产级基础架构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有仅 IndexedDB 的写作原型升级为具备私有认证、服务端权限、D1/R2 持久化、离线同步、版本冲突恢复和可迁移旧数据的生产级基础平台。

**Architecture:** 浏览器功能只能调用受保护的 HTTP API；API 使用会话、CSRF、输入验证、作品权限和仓储服务。D1 通过 `DatabaseAdapter` 保存关系数据，R2 通过 `ObjectStorageAdapter` 保存私有二进制对象，IndexedDB 仅保存按用户隔离且 AES-GCM 加密的草稿、队列和界面偏好。

**Tech Stack:** React 19, TypeScript 5.8, Next/Vinext, Tiptap 3, Cloudflare Worker/D1/R2, Web Crypto, IndexedDB/idb, Vitest, Testing Library.

## Global Constraints

- 仅在 `codex/mojie-platform-foundation` 工作；不合并 `main`，不推送 `sites`，不部署。
- 正文唯一标准为 Tiptap JSON `canonical_content`；`plain_text` 只能由其派生；旧 HTML 仅能作为迁移输入并在失败时保留受保护备份。
- 平台身份只有 `OWNER` 与 `WRITER`；作品访问由 `works.owner_id` 和 `work_members` 的 `EDITOR`、`COMMENTER`、`VIEWER` 决定。平台 Owner 不自动读取他人正文。
- 所有权限接口统一使用 `workId`；服务端每个读写操作都重新校验 session、CSRF（变更请求）和权限。
- 不保存明文密码、会话令牌、邀请令牌、DEK、API 密钥或真实 `.env`；认证和受保护响应均为 `Cache-Control: no-store, private`。
- 缺少 `DB`、`OBJECTS`、`APP_ORIGIN`、`OWNER_INITIALIZATION_KEY` 或 `LOCAL_DRAFT_KEK` 时受保护能力失败关闭，绝不降级到公共本地模式。
- 新测试只使用内存仓储或 fake IndexedDB；不得访问生产资源。不得删除已有测试或削弱断言。
- 所有未完成模块显示真实空状态；不添加伪功能按钮。不得实现未授权发布、验证码绕过或付费正文抓取。

---

## 文件与职责总览

| 文件/目录 | 职责 |
| --- | --- |
| `.npmrc`, `package.json`, `package-lock.json` | 可重复的 npm 安装与 Worker 类型依赖。 |
| `migrations/0001_foundation.sql` | D1 的初始 schema、唯一约束与索引。 |
| `src/server/contracts.ts` | 跨层 ID、角色、内容、错误和 API DTO。 |
| `src/server/runtime.ts` | Worker binding 解析与失败关闭。 |
| `src/server/db/*` | D1 与内存数据库、迁移和仓储接口。 |
| `src/server/auth/*` | PBKDF2、cookie、session、CSRF、速率限制、Owner 初始化。 |
| `src/server/permissions/*` | 平台身份和作品访问矩阵。 |
| `src/server/works/*`, `src/server/sync/*` | 作品、回收站、版本、冲突和幂等保存服务。 |
| `src/server/storage/*` | R2 元数据与受限文件接口。 |
| `src/lib/offline/*` | 用户命名空间、DEK 加密、队列与旧 IndexedDB 迁移。 |
| `app/api/**/route.ts` | 受保护 HTTP 路由。 |
| `src/features/**` 与 `src/components/**` | 登录、工作台、编辑器、备注/批注/建议和设置 UI。 |
| `docs/architecture.md`, `docs/setup.md`, `docs/security.md`, `docs/feature-matrix.md` | 运行架构、人工绑定步骤、安全边界和完成功能矩阵。 |

## 人工资源配置（代码完成后、部署前）

1. 在 Sites/Cloudflare 项目中创建一个私有 D1 数据库并将其绑定为 `DB`，创建一个私有 R2 bucket 并绑定为 `OBJECTS`。D1 和 R2 都通过 Worker binding 暴露，而不是 API 密钥；Cloudflare 的配置文档要求 D1 绑定含 `binding`、`database_name`、`database_id`，R2 绑定含 `binding` 与 `bucket_name`。[Cloudflare Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
2. 在项目的受保护环境变量中设置 `APP_ORIGIN`、`OWNER_INITIALIZATION_KEY` 和 32 字节随机 `LOCAL_DRAFT_KEK` 的 base64url 值；不得把值写入仓库、测试、截图或浏览器。
3. 本地开发只用独立 D1/R2 资源或 Workers 本地资源，设置 `NODE_ENV=development`，使用 `mojie-dev-*` cookie 名称；生产 HTTPS 必须使用 `__Host-mojie-*` 和 `Secure`。
4. 运行 `wrangler d1 migrations apply <database>` 后才允许配置生产绑定；每个绑定缺失时应用返回配置错误并保持数据不可访问。

### Task 1: 修复可重复基线并建立基础文档

**Files:**
- Create: `.npmrc`, `docs/architecture.md`, `docs/setup.md`, `docs/security.md`, `docs/feature-matrix.md`
- Modify: `package.json`, `package-lock.json`, `wrangler.jsonc`, `.env.example`
- Test: `package.json` scripts and the existing `src/**/*.test.ts?(x)` suite

**Interfaces:**
- Produces: 可由后续任务使用的 `npm ci` 基线、`DB`/`OBJECTS`/secret 的命名契约，以及所有功能的状态分类。

- [ ] **Step 1: 记录当前安装失败测试**

Run: `npm ci`

Expected: 当前基线以 `ERESOLVE` 失败，错误指出 beta `vinext` 不满足 `@vinext/cloudflare` 的 peer 解析；不要删除 lockfile 或使用一次性的命令行忽略参数。

- [ ] **Step 2: 添加受版本控制的 npm peer 解析配置**

Create `.npmrc` with exactly:

```ini
legacy-peer-deps=true
```

Add this note to `docs/setup.md`: the flag is limited to npm's prerelease peer resolver; it does not suppress type checking, tests, builds, Worker-entry verification, or production binding checks.

- [ ] **Step 3: 安装并验证干净基线**

Run:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:worker-entry
```

Expected: all commands exit `0`; record actual test count and build result in the task commit message body or implementation log. If any command fails after the peer fix, stop and add its regression test before changing production code.

- [ ] **Step 4: 固定运行时与文档配置**

Add `@cloudflare/workers-types@5.20260711.1` as a dev dependency and generate its lockfile entry. Extend `wrangler.jsonc` only with binding names and comments that contain no resource IDs. Create `.env.example` containing names only:

```dotenv
APP_ORIGIN=https://your-private-site.example
OWNER_INITIALIZATION_KEY=
LOCAL_DRAFT_KEK=
```

Document in `docs/architecture.md` the UI → API → services → adapters flow; in `docs/security.md` the no-store, no-plaintext-token, no-auto-publish and Owner-is-not-reader rules; in `docs/feature-matrix.md` list every planned feature as `尚未实现` before its code lands.

- [ ] **Step 5: Commit**

```bash
git add .npmrc package.json package-lock.json wrangler.jsonc .env.example docs
git commit -m "docs: add foundation architecture and implementation plan"
```

### Task 2: 建立领域合同、D1 schema 和可测试适配器

**Files:**
- Create: `src/server/contracts.ts`, `src/server/errors.ts`, `src/server/runtime.ts`, `src/server/db/database.ts`, `src/server/db/d1-database.ts`, `src/server/db/memory-database.ts`, `migrations/0001_foundation.sql`
- Test: `src/server/db/database.test.ts`, `src/server/runtime.test.ts`

**Interfaces:**
- Produces: `PlatformRole`, `WorkRole`, `CanonicalContent`, `AppError`, `DatabaseAdapter`, `RuntimeBindings`, `requireRuntimeBindings()`.

- [ ] **Step 1: Write failing adapter and runtime tests**

```ts
it('fails closed when required production bindings are absent', () => {
  expect(() => requireRuntimeBindings({ APP_ORIGIN: 'https://a.test' })).toThrow('CONFIGURATION_REQUIRED');
});

it('enforces unique values in the memory adapter', async () => {
  const db = createMemoryDatabase();
  await db.insertSyncOperation({ clientOperationId: 'op-1', userId: 'u', chapterId: 'c' });
  await expect(db.insertSyncOperation({ clientOperationId: 'op-1', userId: 'u', chapterId: 'c' })).rejects.toMatchObject({ code: 'CONFLICT' });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/server/db/database.test.ts src/server/runtime.test.ts`

Expected: FAIL because the contracts and adapter functions do not exist.

- [ ] **Step 3: Implement the minimal cross-layer contracts**

Create these exact foundational types:

```ts
export type PlatformRole = 'OWNER' | 'WRITER';
export type WorkRole = 'EDITOR' | 'COMMENTER' | 'VIEWER';
export type CanonicalContent = { type: 'doc'; content?: Array<Record<string, unknown>> };
export type RuntimeBindings = {
  DB?: D1Database;
  OBJECTS?: R2Bucket;
  APP_ORIGIN?: string;
  OWNER_INITIALIZATION_KEY?: string;
  LOCAL_DRAFT_KEK?: string;
  NODE_ENV?: string;
};
export class AppError extends Error { constructor(public code: string, public status: number) { super(code); } }
```

`requireRuntimeBindings()` must require `DB`, `OBJECTS`, `APP_ORIGIN`, `OWNER_INITIALIZATION_KEY`, and `LOCAL_DRAFT_KEK`; it returns typed non-optional bindings or throws `new AppError('CONFIGURATION_REQUIRED', 503)`.

- [ ] **Step 4: Add the full initial migration**

Write `migrations/0001_foundation.sql` with `CREATE TABLE IF NOT EXISTS` statements for `users`, `user_local_draft_keys`, `sessions`, `invitations`, `works`, `work_members`, `volumes`, `chapters`, `chapter_versions`, `chapter_conflicts`, `chapter_notes`, `chapter_comments`, `change_suggestions`, `writing_sessions`, `writing_goals`, `sync_operations`, `migration_runs`, `profile_settings`, `audit_logs`, and `file_metadata`.

The migration must include these exact constraints: `UNIQUE(sessions.token_hash)`, `UNIQUE(invitations.token_hash)`, `UNIQUE(work_members.work_id, work_members.user_id)`, `UNIQUE(sync_operations.client_operation_id)`, `UNIQUE(migration_runs.migration_id)`, `UNIQUE(user_local_draft_keys.user_id)`. Add indexes for `works(owner_id, deleted_at)`, `chapters(work_id, volume_id, position)`, `chapter_versions(chapter_id, created_at DESC)`, and `writing_sessions(user_id, date)`.

- [ ] **Step 5: Implement D1 and memory adapters**

Expose only parameterized methods, never SQL string interpolation:

```ts
export interface DatabaseAdapter {
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;
  execute(sql: string, values?: unknown[]): Promise<void>;
  first<T>(sql: string, values?: unknown[]): Promise<T | null>;
  all<T>(sql: string, values?: unknown[]): Promise<T[]>;
}
```

`D1DatabaseAdapter` must call `env.DB.prepare(sql).bind(...values)`; the memory adapter implements the repository operations needed by tests without exposing raw production data.

- [ ] **Step 6: Run GREEN checks and commit**

Run: `npm test -- src/server/db/database.test.ts src/server/runtime.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add migrations src/server/contracts.ts src/server/errors.ts src/server/runtime.ts src/server/db package.json package-lock.json
git commit -m "feat: add server database schema and adapters"
```

### Task 3: 私有认证、会话、Cookie 与速率限制

**Files:**
- Create: `src/server/auth/passwords.ts`, `src/server/auth/sessions.ts`, `src/server/auth/cookies.ts`, `src/server/auth/csrf.ts`, `src/server/auth/rate-limit.ts`, `src/server/auth/service.ts`, `app/api/auth/initialize/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/session/route.ts`
- Test: `src/server/auth/passwords.test.ts`, `src/server/auth/sessions.test.ts`, `src/server/auth/cookies.test.ts`, `src/server/auth/service.test.ts`

**Interfaces:**
- Consumes: `DatabaseAdapter`, `RuntimeBindings`, `AppError`.
- Produces: `AuthService.initializeOwner`, `login`, `logout`, `requireSession`, `assertCsrf` and `applySecurityHeaders`.

- [ ] **Step 1: Write failing authentication tests**

```ts
it('stores PBKDF2 metadata and never the password', async () => {
  const hash = await hashPassword('not-stored');
  expect(hash.algorithm).toBe('PBKDF2-HMAC-SHA-256');
  expect(hash.salt).toHaveLength(16);
  expect(JSON.stringify(hash)).not.toContain('not-stored');
});

it('uses host cookies only in production HTTPS', () => {
  expect(cookieNames({ NODE_ENV: 'production' })).toEqual({ session: '__Host-mojie-session', csrf: '__Host-mojie-csrf' });
  expect(cookieNames({ NODE_ENV: 'development' })).toEqual({ session: 'mojie-dev-session', csrf: 'mojie-dev-csrf' });
});

it('rejects a revoked session and protected response is not cached', async () => {
  const response = await protectedHandler(revokedSessionRequest);
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('no-store, private');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/auth`

Expected: FAIL because auth modules are absent.

- [ ] **Step 3: Implement fixed cryptographic and session rules**

Use `crypto.subtle.deriveBits` with PBKDF2/HMAC-SHA-256, a 16-byte salt, 600,000 iterations and 32-byte result. Store `{algorithm, iterations, salt, digest}` and rehash on successful login if stored iterations are lower. Generate 32-byte random session and invitation values; store only SHA-256 base64url digests. Set idle expiry to 12 hours and absolute expiry to 7 days; renew only with less than two hours idle time remaining and never beyond absolute expiry.

`initializeOwner` must atomically require matching `OWNER_INITIALIZATION_KEY`, require no `owner_initialized_at`, create an `OWNER`, then set `owner_initialized_at`. A second attempt always returns the generic failure response.

- [ ] **Step 4: Implement cookie, CSRF and route behavior**

Production cookie options must be `{ httpOnly: true, secure: true, sameSite: 'lax', path: '/' }` for `__Host-mojie-session`; use the non-HttpOnly CSRF companion cookie name. Production setup throws if origin is not HTTPS. Development uses only `mojie-dev-session` and `mojie-dev-csrf` without `Secure`.

For every mutating route, require `Origin === APP_ORIGIN` and constant-time equality of `X-CSRF-Token` with the CSRF cookie. Apply `Cache-Control: no-store, private`, CSP, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: same-origin` to authentication and protected responses. Rate-limit failed login by normalized account+IP to five per 15 minutes and initialization/invite acceptance by IP to three per 15 minutes.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- src/server/auth && npm run typecheck`

Expected: PASS; tests must inspect persisted rows and prove token/password plaintext is absent.

```bash
git add src/server/auth app/api/auth
git commit -m "feat: add private authentication and sessions"
```

### Task 4: 邀请与作品权限矩阵

**Files:**
- Create: `src/server/permissions/access.ts`, `src/server/invitations/service.ts`, `app/api/invitations/route.ts`, `app/api/invitations/[token]/accept/route.ts`
- Test: `src/server/permissions/access.test.ts`, `src/server/invitations/service.test.ts`

**Interfaces:**
- Consumes: `requireSession`, `DatabaseAdapter`.
- Produces: `getWorkAccess(userId, workId)`, `requireWorkRole`, `canReadWork`, `canEditWork`, `canCommentWork`, `canManageWorkMembers`, `canDeleteWork`.

- [ ] **Step 1: Write the permission matrix tests first**

```ts
it.each([
  ['viewer cannot edit', 'VIEWER', false],
  ['commenter cannot edit', 'COMMENTER', false],
  ['editor can edit', 'EDITOR', true]
])('%s', async (_name, role, expected) => {
  await grantMember(workId, 'member', role as WorkRole);
  await expect(canEditWork('member', workId)).resolves.toBe(expected);
});

it('does not grant platform Owner read access to another writers work', async () => {
  await expect(canReadWork('platform-owner', foreignWorkId)).resolves.toBe(false);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/permissions src/server/invitations`

Expected: FAIL because these functions do not exist.

- [ ] **Step 3: Implement access and invitations**

The work owner can read/edit/manage members/delete; an `EDITOR` can read/edit but not delete; `COMMENTER` can read/comment but not edit; `VIEWER` only reads. `requireOwner()` is restricted to system invitation administration and must not bypass `getWorkAccess`.

Generate invitation token bytes with `crypto.getRandomValues`, persist only their SHA-256 digest, enforce expiry, revocation, scope (`work_id` nullable for platform invitation), use count and requested `WorkRole`. Acceptance creates or attaches a `WRITER` account and membership in one transaction, then audits the action. Revoked or expired tokens return the same generic invalid-invitation error.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/server/permissions src/server/invitations && npm run typecheck`

Expected: PASS, including immediate access loss after member revocation.

```bash
git add src/server/permissions src/server/invitations app/api/invitations
git commit -m "feat: add invitations and role permissions"
```

### Task 5: 服务端作品、目录、回收站与工作台查询

**Files:**
- Create: `src/server/works/repository.ts`, `src/server/works/service.ts`, `src/server/works/dashboard.ts`, `app/api/works/route.ts`, `app/api/works/[workId]/route.ts`, `app/api/works/[workId]/volumes/route.ts`, `app/api/works/[workId]/chapters/route.ts`, `app/api/works/[workId]/trash/route.ts`
- Modify: `src/lib/repository.ts`
- Test: `src/server/works/repository.test.ts`, `src/server/works/service.test.ts`, `src/server/works/dashboard.test.ts`

**Interfaces:**
- Produces: `WorkService.createWork`, `listVisibleWorks`, `createVolume`, `createChapter`, `moveChapter`, `softDelete`, `restore`, `permanentlyDelete`, `getDashboard`.

- [ ] **Step 1: Write failing work tests**

```ts
it('creates a work, first volume and first chapter atomically', async () => {
  const created = await service.createWork(ownerId, { title: '新书', kind: 'long' });
  expect(created.volumes).toHaveLength(1);
  expect(created.volumes[0].chapters).toHaveLength(1);
});

it('returns metadata only from the dashboard list', async () => {
  const result = await service.listVisibleWorks(memberId);
  expect(JSON.stringify(result)).not.toContain('canonical_content');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/works`

Expected: FAIL because the work service does not exist.

- [ ] **Step 3: Implement work service and HTTP DTOs**

Define `CreateWorkInput` with every approved field: `title`, `alternativeTitle`, `penName`, `logline`, `synopsis`, `audience`, `targetPlatform`, `primaryGenre`, `secondaryGenre`, `tags`, `expectedWordCount`, `updatePlan`, `status`, `copyrightNote`, `aiFullTextAllowed`, `kind`.

`createWork` inserts work, first volume and first chapter within one transaction. Chapter mutations require `canEditWork`; locked chapters reject normal writes. Ordering uses a transaction and distinct integer positions. Soft deletion sets `deleted_at`, `deleted_by`, `delete_reason`; restore clears them; permanent delete requires explicit `confirmed: true` and `canDeleteWork`.

`getDashboard` calculates today count from `writing_sessions`, current streak from consecutive dates, weekly goal from `writing_goals`, latest versions, pending comments, and the caller's role. It returns real zeroes when there are no comments and never loads all chapter contents.

- [ ] **Step 4: Retain legacy repository only as migration source**

Move old IndexedDB work/volume/chapter access behind `src/lib/offline/legacy-repository.ts`; keep its tests until Task 8 migrates them. Remove its use from authenticated UI, but do not delete the existing database schema before migration tests pass.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- src/server/works src/lib/repository.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/server/works app/api/works src/lib/repository.ts src/lib/offline/legacy-repository.ts
git commit -m "feat: persist works and chapters on the server"
```

### Task 6: 加密 IndexedDB、DEK 生命周期与用户隔离

**Files:**
- Create: `src/server/auth/local-draft-keys.ts`, `app/api/auth/local-draft-key/route.ts`, `src/lib/offline/crypto.ts`, `src/lib/offline/database.ts`, `src/lib/offline/draft-store.ts`
- Test: `src/server/auth/local-draft-keys.test.ts`, `src/lib/offline/crypto.test.ts`, `src/lib/offline/draft-store.test.ts`

**Interfaces:**
- Produces: `getOrCreateWrappedDek(userId)`, `unwrapDekForSession(userId)`, `openUserOfflineDatabase(userId, dek)`, `saveDraft`, `enqueueOperation`, `closeOfflineDatabase`.

- [ ] **Step 1: Write failing encryption and isolation tests**

```ts
it('persists only a wrapped 32-byte DEK, IV and key version', async () => {
  const row = await getOrCreateWrappedDek('u1');
  expect(row.wrappedDek).not.toHaveLength(32);
  expect(row.wrapIv).toHaveLength(12);
  expect(row.kekVersion).toBe(1);
});

it('cannot open another users draft namespace after logout', async () => {
  const a = await openUserOfflineDatabase('a', dekA);
  await a.saveDraft(draft);
  await closeOfflineDatabase(a);
  await expect(openUserOfflineDatabase('b', dekB).then((db) => db.getDraft(draft.chapterId))).resolves.toBeNull();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/auth/local-draft-keys.test.ts src/lib/offline`

Expected: FAIL because encrypted stores are absent.

- [ ] **Step 3: Implement DEK envelope and protected delivery**

Decode `LOCAL_DRAFT_KEK` as exactly 32 bytes. Generate each per-user DEK as 32 random bytes; wrap it using AES-GCM with a random 12-byte IV; persist only `wrapped_dek`, `wrap_iv`, `kek_version=1`. The protected key route requires the current session user, returns no-store, and supplies the unwrapped DEK only over same-origin TLS for the matching `userId`. Missing KEK, row, invalid length or unknown version throws `CONFIGURATION_REQUIRED` or `LOCAL_DRAFT_KEY_UNAVAILABLE` and never writes plaintext.

- [ ] **Step 4: Implement encrypted local stores**

Use database names `mojie-writing-studio:<userId>`. Encrypt draft/queue/conflict payloads with AES-GCM under the in-memory DEK and a unique IV per record. Store settings without content in the same user namespace. `closeOfflineDatabase` closes IDB and zeros in-memory key references; logout does not delete ciphertext. No service worker cache entry may include private bodies.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- src/server/auth/local-draft-keys.test.ts src/lib/offline && npm run typecheck`

Expected: PASS, including the missing-key failure-closed case and proof that serialized IDB records lack plaintext.

```bash
git add src/server/auth/local-draft-keys.ts app/api/auth/local-draft-key src/lib/offline
git commit -m "feat: add encrypted user-scoped offline drafts"
```

### Task 7: 幂等云端同步、版本与冲突恢复

**Files:**
- Create: `src/server/sync/service.ts`, `src/server/sync/diff.ts`, `app/api/chapters/[chapterId]/save/route.ts`, `app/api/chapters/[chapterId]/versions/route.ts`, `app/api/chapters/[chapterId]/conflicts/route.ts`, `src/lib/offline/sync-queue.ts`
- Modify: `src/lib/autosave.ts`, `src/lib/writing.ts`
- Test: `src/server/sync/service.test.ts`, `src/lib/offline/sync-queue.test.ts`, `src/lib/autosave.test.ts`, `src/lib/writing.test.ts`

**Interfaces:**
- Produces: `saveChapter(command)`, `resolveConflict`, `createSnapshot`, `flushQueue`, and an autosaver whose `flush()` reports local persistence separately from cloud result.

- [ ] **Step 1: Write failing save, snapshot and disposal tests**

```ts
it('returns the original result for a repeated client operation id', async () => {
  const first = await saveChapter(command('op-1'));
  const retry = await saveChapter(command('op-1'));
  expect(retry).toEqual(first);
  expect(await chapterRevision(chapterId)).toBe(1);
});

it('queues a failed cloud save after local persistence and permits chapter switching', async () => {
  await autosaver.queue(content);
  cloud.failNext();
  await expect(autosaver.prepareToSwitch()).resolves.toEqual({ localPersisted: true, cloudQueued: true });
});

it('creates the first automatic snapshot once the threshold is reached', async () => {
  await saveAfterThresholdWithoutLastSnapshot();
  expect(await listVersions(chapterId)).toContainEqual(expect.objectContaining({ reason: 'AUTO' }));
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/sync src/lib/offline/sync-queue.test.ts src/lib/autosave.test.ts src/lib/writing.test.ts`

Expected: FAIL; the existing autosaver disposes queued data and the first automatic snapshot condition is wrong.

- [ ] **Step 3: Implement transactional save contract**

Accept `{chapterId, baseRevision, canonicalContent, clientOperationId}`. Derive `plainText` and word count server-side. In one transaction, check session/user work access, chapter lock and revision; look up `sync_operations.client_operation_id`; return stored result if present. On revision match, increment revision, update chapter, insert version according to reason/threshold, update sessions, insert operation result and audit metadata.

On revision mismatch, insert a `chapter_versions` row with `reason='CONFLICT_COPY'`, insert `chapter_conflicts`, insert the idempotent result and return both versions. `resolveConflict` snapshots the current chapter before applying the user-chosen content, and never silently overwrites it.

- [ ] **Step 4: Fix local autosave lifecycle**

`queue()` first awaits encrypted draft and operation persistence. `prepareToSwitch()` awaits that local write, invokes cloud flush, and returns queued success if cloud is offline/times out/fails. `dispose()` must preserve pending content by awaiting local persistence through its caller; `pagehide` writes locally then uses only best-effort `keepalive` cloud send. `flushQueue()` uses each persisted operation's immutable `clientOperationId` until server acknowledgement, then removes draft/queue item.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- src/server/sync src/lib/offline/sync-queue.test.ts src/lib/autosave.test.ts src/lib/writing.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add src/server/sync app/api/chapters src/lib/offline/sync-queue.ts src/lib/autosave.ts src/lib/writing.ts
git commit -m "feat: add offline cloud synchronization"
git commit -m "feat: add chapter versions and conflict recovery"
```

### Task 8: 旧 IndexedDB 的显式幂等迁移

**Files:**
- Create: `src/lib/offline/legacy-migration.ts`, `src/server/migrations/service.ts`, `app/api/migrations/legacy/route.ts`, `src/features/migration/legacy-migration-dialog.tsx`
- Test: `src/lib/offline/legacy-migration.test.ts`, `src/server/migrations/service.test.ts`, `src/features/migration/legacy-migration-dialog.test.tsx`

**Interfaces:**
- Produces: `inspectLegacyDatabase`, `createLegacyBackup`, `migrateLegacyRun`, `LegacyMigrationDialog`.

- [ ] **Step 1: Write failing migration tests**

```ts
it('requires explicit confirmation and makes a JSON backup before import', async () => {
  await expect(migrateLegacyRun({ confirmed: false })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  await migrateLegacyRun({ confirmed: true, migrationId: 'm1' });
  expect(await backupExists('m1')).toBe(true);
});

it('does not import twice for the same migration id', async () => {
  await migrateLegacyRun({ confirmed: true, migrationId: 'm1' });
  const retry = await migrateLegacyRun({ confirmed: true, migrationId: 'm1' });
  expect(retry.imported).toBe(0);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/lib/offline/legacy-migration.test.ts src/server/migrations src/features/migration`

Expected: FAIL because migration services are absent.

- [ ] **Step 3: Implement inspection, backup and transaction import**

Inspect only counts until confirmation. Export legacy work/volume/chapter/snapshot data to encrypted user-local JSON backup. The server verifies `migration_id` uniqueness, transforms legacy HTML to canonical JSON, preserves unconvertible HTML in an `OBJECTS` private backup, creates work hierarchy and initial versions in one transaction, audits the run, and preserves the original legacy database after success. A retry returns prior run status.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/lib/offline/legacy-migration.test.ts src/server/migrations src/features/migration && npm run typecheck`

Expected: PASS.

```bash
git add src/lib/offline/legacy-migration.ts src/server/migrations app/api/migrations src/features/migration
git commit -m "feat: migrate legacy local writing data"
```

### Task 9: 登录、工作台与受保护路由 UI

**Files:**
- Create: `src/features/auth/login-page.tsx`, `src/features/auth/owner-initialize-page.tsx`, `src/features/works/dashboard.tsx`, `src/features/works/work-card.tsx`, `app/login/page.tsx`, `app/initialize/page.tsx`, `app/dashboard/page.tsx`
- Modify: `app/page.tsx`, `src/components/create-work-form.tsx`, `src/components/create-work-form.test.tsx`
- Test: `src/features/auth/login-page.test.tsx`, `src/features/works/dashboard.test.tsx`, `src/components/create-work-form.test.tsx`

**Interfaces:**
- Consumes: `/api/auth/session`, `/api/auth/login`, `/api/works`.
- Produces: protected routing, real dashboard loading/empty/error states, server-created work flow.

- [ ] **Step 1: Write failing UI tests**

```tsx
it('redirects an anonymous visitor from dashboard to login', async () => {
  render(<DashboardPage session={null} />);
  expect(await screen.findByRole('heading', { name: '登录' })).toBeVisible();
});

it('shows real empty dashboard state without demo works', async () => {
  render(<Dashboard works={[]} stats={{ today: 0, streak: 0, pendingComments: 0 }} />);
  expect(screen.getByText('还没有作品')).toBeVisible();
  expect(screen.queryByText('示例小说')).toBeNull();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/auth src/features/works src/components/create-work-form.test.tsx`

Expected: FAIL because authenticated UI modules are absent.

- [ ] **Step 3: Implement screens and API client**

Create login and Owner initialization screens with generic credential errors only. `/dashboard` fetches visible work metadata and statistics; it exposes quick creation for long novel, short novel and essay, search, recent work cards, loading/error/empty states and real zero comment count. Create-work submits to server then navigates to `/works/<workId>/chapters/<chapterId>`; it no longer creates browser-only source-of-truth works.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/features/auth src/features/works src/components/create-work-form.test.tsx && npm run typecheck`

Expected: PASS.

```bash
git add app src/features/auth src/features/works src/components/create-work-form.tsx src/components/create-work-form.test.tsx
git commit -m "feat: add authenticated work dashboard"
```

### Task 10: 三栏编辑器、备注/批注/建议与回收站 UI

**Files:**
- Create: `src/features/editor/editor-page.tsx`, `src/features/editor/version-panel.tsx`, `src/features/editor/conflict-panel.tsx`, `src/features/editor/collaboration-panel.tsx`, `src/features/works/trash-panel.tsx`, `app/works/[workId]/chapters/[chapterId]/page.tsx`
- Modify: `src/components/writing-studio.tsx`, `src/components/rich-text-editor.tsx`, `app/globals.css`
- Test: `src/features/editor/editor-page.test.tsx`, `src/features/editor/collaboration-panel.test.tsx`, `src/features/works/trash-panel.test.tsx`, `src/components/responsive-layout.test.ts`

**Interfaces:**
- Consumes: work/chapter APIs, offline `prepareToSwitch`, version and conflict APIs.
- Produces: responsive editor that never silently overwrites content, real collaboration panels and accessible directory actions.

- [ ] **Step 1: Write failing editor interaction tests**

```tsx
it('allows switching after encrypted local persistence when cloud save is queued', async () => {
  render(<EditorPage syncState="queued" />);
  await userEvent.click(screen.getByRole('button', { name: '第二章' }));
  expect(screen.getByDisplayValue('第二章')).toBeVisible();
});

it('keeps private notes out of collaborator panels', () => {
  render(<CollaborationPanel privateNotes={[note]} comments={[]} suggestions={[]} role="EDITOR" />);
  expect(screen.queryByText(note.body)).toBeNull();
});

it('does not apply a suggestion until an editor confirms a revision save', async () => {
  render(<CollaborationPanel suggestions={[suggestion]} role="EDITOR" />);
  await userEvent.click(screen.getByRole('button', { name: '应用建议' }));
  expect(saveChapterWithRevision).toHaveBeenCalledWith(expect.objectContaining({ baseRevision: suggestion.baseRevision }));
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/editor src/features/works/trash-panel.test.tsx src/components/responsive-layout.test.ts`

Expected: FAIL because server-backed editor features are absent.

- [ ] **Step 3: Implement editor integration**

Refactor `WritingStudio` into server-backed `EditorPage`; retain Tiptap toolbar, chapter title, find/replace, undo/redo, current-line highlight, focus/fullscreen, word/paragraph/reading-time/status metrics, theme preferences and desktop/tablet/mobile layout. Directory uses accessible create, rename, collapse and move-up/move-down actions. Right panel has distinct tabs for private notes, versions, chapter goal, comments and suggestions; absent people data displays an explicit empty state.

The page blocks chapter switch only until encrypted local write succeeds. A queued cloud operation displays `离线` or `等待同步`; conflict displays a diff and three explicit actions. Trash restore and permanent delete require the server permissions and confirmation dialog.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/features/editor src/features/works/trash-panel.test.tsx src/components/responsive-layout.test.ts && npm run typecheck`

Expected: PASS on jsdom tests; manually inspect desktop, 1080px tablet drawer and 720px mobile drawer with no demo text.

```bash
git add app/works src/features/editor src/features/works/trash-panel.tsx src/components/writing-studio.tsx src/components/rich-text-editor.tsx app/globals.css
git commit -m "feat: add server-backed writing editor"
```

### Task 11: 对象存储边界、审计、安全回归与文档矩阵

**Files:**
- Create: `src/server/storage/repository.ts`, `src/server/storage/service.ts`, `src/server/audit/service.ts`, `src/server/http/response.ts`
- Modify: `docs/architecture.md`, `docs/setup.md`, `docs/security.md`, `docs/feature-matrix.md`, `scripts/verify-worker-entry.mjs`
- Test: `src/server/storage/service.test.ts`, `src/server/audit/service.test.ts`, `src/server/http/response.test.ts`

**Interfaces:**
- Produces: private object metadata service, sanitized audit service and common protected response helper.

- [ ] **Step 1: Write failing security tests**

```ts
it('rejects an executable upload and never exposes an object key to another user', async () => {
  await expect(upload({ name: 'x.js', type: 'application/javascript', size: 1 })).rejects.toMatchObject({ code: 'FILE_TYPE_REJECTED' });
  await expect(readPrivateObject(otherUserId, key)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('redacts content, credentials and tokens from audit payloads', async () => {
  await audit.write({ action: 'chapter.saved', content: '正文', password: 'p', cookie: 'c', token: 't' });
  expect(await audit.last()).toEqual({ action: 'chapter.saved' });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/storage src/server/audit src/server/http`

Expected: FAIL because these services are absent.

- [ ] **Step 3: Implement storage and audit boundaries**

`ObjectStorageAdapter` accepts only server-generated keys `users/<userId>/<uuid>`; metadata stores owner, media type, size and hash. It accepts approved cover/import/export/backup/attachment media types and configured maximum size, rejects other input, and requires work/file permission before reads. It does not implement user-facing import/export formats in this phase.

Audit accepts an allowlisted `{actorId, action, targetType, targetId, metadata}` payload; it drops `canonicalContent`, `plainText`, password, cookie, token, stack and database error fields. `protectedResponse()` applies no-store and security headers to every route.

- [ ] **Step 4: Complete operation documents**

Update `docs/setup.md` with D1/R2 binding commands and migration order, `docs/security.md` with PBKDF2, cookies, CSRF, no-store, DEK envelope and logging policy, `docs/architecture.md` with request/data flow, and `docs/feature-matrix.md` using only the three approved statuses. Mark imports/exports, maps, templates, rankings, platform release and AI as `尚未实现`.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- src/server/storage src/server/audit src/server/http && npm run typecheck`

Expected: PASS.

```bash
git add src/server/storage src/server/audit src/server/http docs scripts/verify-worker-entry.mjs
git commit -m "test: cover foundation security and persistence"
git commit -m "docs: document setup and remaining feature matrix"
```

### Task 12: 全量回归、人工流程与交付检查

**Files:**
- Modify: `README.md`, `docs/feature-matrix.md`
- Test: all existing and newly created test files

**Interfaces:**
- Consumes: every preceding module.
- Produces: verified non-deployed review branch and an accurate feature status report.

- [ ] **Step 1: Run the complete automated suite**

Run exactly:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:worker-entry
```

If a `lint` script exists after implementation, additionally run `npm run lint`. Expected: every command exits `0`; record the actual Vitest test count and build artefact paths.

- [ ] **Step 2: Perform browser-level acceptance against the local test runtime**

Verify each of these flows using a test database only: Owner initialization; failed login generic message; Writer creates work; unauthorized user receives no work data; Viewer and Commenter cannot edit; Editor cannot delete; owner has no implicit foreign-work access; encrypted offline edit then chapter switch with cloud failure; reconnection sync; conflict comparison and recovery; version restore; logout locks local drafts; same user re-login unlocks them; legacy migration confirmation and repeated migration ID; desktop/tablet/mobile layouts.

- [ ] **Step 3: Scan delivery contents**

Run:

```bash
git status --short
git diff --check origin/feature/mojie-core...HEAD
git ls-files | findstr /R /I "^\.env$ ^\.env\.local$ node_modules \.wrangler \.next dist output .*\.sqlite$ .*\.pem$ .*\.key$"
git log --oneline --decorate origin/feature/mojie-core..HEAD
git diff --stat origin/feature/mojie-core...HEAD
```

Expected: no tracked credential, database, cache or build files; no uncommitted source changes; the commit list contains each reviewed task. Do not push to `sites`, merge, deploy or open a public release.

- [ ] **Step 4: Final documentation and commit**

Update `README.md` with local commands, required external bindings and the fact that the branch is not deployed. Reconcile every entry in `docs/feature-matrix.md` with executed tests and binding requirements.

```bash
git add README.md docs/feature-matrix.md
git commit -m "docs: finalize foundation verification status"
```

- [ ] **Step 5: Push only after the scan passes**

```bash
git push -u origin codex/mojie-platform-foundation
git ls-remote --heads origin codex/mojie-platform-foundation
```

Expected: the returned SHA equals `git rev-parse HEAD`.

## Plan Self-Review

- Spec coverage: Tasks 2–4 cover data, identities, sessions, invitations and permissions; Tasks 5, 9 and 10 cover work management and UI; Tasks 6–8 cover encrypted offline data, idempotent sync, versions, conflicts and migration; Task 11 covers R2, auditing, security headers and formal documents; Task 12 verifies every required delivery command.
- Safety coverage: no plaintext secrets, no-store, production/dev cookie split, CSRF, fixed password parameters, DEK envelope, unique operation/migration IDs, no Owner bypass and no silent content overwrite are explicit in tasks and tests.
- Scope coverage: prohibited publishing, scraping and incomplete advanced modules remain excluded and are recorded as not implemented in the feature matrix.
- Type consistency: all cross-layer work identifiers are `workId`; the only platform role values are `OWNER` and `WRITER`; the only membership role values are `EDITOR`, `COMMENTER` and `VIEWER`.
