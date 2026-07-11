# 墨界·私人网文创作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有单页本地写作原型扩展为稳定、可测试、可持续迭代的私人网文创作台，并按《墨界·私人网文创作台开发计划》分阶段覆盖创作、设定、检查、模板、导入导出、权限与平台发布准备能力。

**Architecture:** 保留 React 19 + TypeScript + Vinext + Tiptap + IndexedDB 的离线优先架构，把领域逻辑拆分为纯函数模块，把用户内容持久化到版本化 IndexedDB 仓库。首轮交付不伪造安全认证或第三方平台接口；需要服务端身份验证、云端数据库、对象存储和平台正式授权的功能通过清晰接口与运行时能力检测接入。

**Tech Stack:** React 19、TypeScript 5.8、Vinext/Vite、Tiptap 3、IndexedDB/idb、Vitest、Testing Library、Cloudflare Worker/Sites。

## Global Constraints

- 所有作品默认私人；未实现服务端鉴权前不得宣称浏览器本地隔离等同于安全权限控制。
- 正文写入必须自动保存，任何检查、导入、批量替换和智能建议不得静默覆盖原文。
- 所有批量修改、恢复、导入和导出前创建版本或可恢复副本。
- 中文输入和长文本输入优先，文本检查必须在纯函数或 Worker 中运行，不能阻塞编辑器。
- 不保存起点或番茄账号密码，不绕过验证码，不调用未经授权的私有发布接口。
- 模板、榜单和平台规则必须记录来源类型、审核日期与数据状态；不复制平台课程或作品正文。
- DOCX 导入必须保留原始文件；编辑后导出只承诺基础样式往返。

---

### Task 1: Repository quality gate and CI

**Files:**
- Create: `.github/workflows/quality.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: existing `npm test`, `npm run typecheck`, `npm run build` scripts.
- Produces: pull-request quality gate and documented local commands.

- [ ] Add a workflow that runs Node 22, `npm ci`, unit tests, typecheck, worker-entry verification, and production build.
- [ ] Document architecture, supported capabilities, deployment constraints, and development commands.
- [ ] Verify the workflow fails on an intentionally missing new feature test before implementation.

### Task 2: Writing-domain utilities

**Files:**
- Create: `src/lib/text-tools.test.ts`
- Create: `src/lib/text-tools.ts`
- Create: `src/lib/name-generator.test.ts`
- Create: `src/lib/name-generator.ts`

**Interfaces:**
- Produces: `inspectText(text, options)`, `findRepeatedPhrases(text)`, `normalizeChinesePunctuation(text)`, `generateNames(options)`.

- [ ] Write failing tests for punctuation, paired symbols, sensitive words, repeated phrases, style signals, custom whitelist, and deterministic name generation.
- [ ] Implement pure functions with severity levels `error | warning | suggestion | review`.
- [ ] Keep suggestions non-destructive and return ranges for editor highlighting.

### Task 3: Templates and teaching content

**Files:**
- Create: `src/lib/templates.test.ts`
- Create: `src/lib/templates.ts`
- Create: `src/lib/lessons.ts`

**Interfaces:**
- Produces: normalized template records, five-layer filtering, template-to-planning-card conversion, and course records.

- [ ] Write failing tests for platform/audience/length/genre/element filtering and planning-card generation.
- [ ] Add representative first-party templates for major male/female/short-story categories with update metadata and anti-copying guidance.
- [ ] Add concise original lessons with error example, revision example, checklist, exercise, genre and difficulty.

### Task 4: Project data model and IndexedDB migration

**Files:**
- Create: `src/lib/project-model.test.ts`
- Create: `src/lib/project-model.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/repository.test.ts`

**Interfaces:**
- Produces repository methods for volumes, outlines, characters, locations, timeline events, relationships, materials, dictionaries, goals, trash, backups, import/export and publication records.

- [ ] Define versioned records and validation helpers.
- [ ] Add IndexedDB stores using a forward-only migration that preserves existing works and chapters.
- [ ] Add CRUD methods with owner checks and audit entries.
- [ ] Add soft-delete and restore, project JSON export/import, and pre-operation snapshots.

### Task 5: Workspace and writing tools UI

**Files:**
- Create: `src/components/workspace-dashboard.tsx`
- Create: `src/components/tools-panel.tsx`
- Create: `src/components/template-library.tsx`
- Create: `src/components/project-panel.tsx`
- Modify: `src/components/writing-studio.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes repository methods and pure domain utilities.
- Produces dashboard, multi-work switching, outline/character/location/material editors, template browser, lint panel, name generator, search/replace preview, focus sprint and export actions.

- [ ] Add tests for navigation and non-destructive lint suggestions.
- [ ] Replace the empty-work screen with a dashboard listing all works and quick-create actions.
- [ ] Expand the three-column editor right rail into tabs for notes, versions, outline, characters, locations and checks.
- [ ] Add responsive tool drawers and accessible keyboard navigation.

### Task 6: Import, export, backups and publication preparation

**Files:**
- Create: `src/lib/import-export.test.ts`
- Create: `src/lib/import-export.ts`
- Create: `src/components/import-export-panel.tsx`
- Create: `src/components/publication-panel.tsx`

**Interfaces:**
- Produces TXT, Markdown, HTML and native JSON import/export, browser download helpers, platform-format checks and publication records.

- [ ] Write failing tests for chapter splitting, safe HTML escaping, round-trip JSON and note exclusion.
- [ ] Implement import preview and explicit confirmation.
- [ ] Add Qidian/Fanqie preparation presets: title/body copy, length/risk/format checks, author-console links and manual publication tracking.

### Task 7: Visual setting tools

**Files:**
- Create: `src/lib/graph-model.test.ts`
- Create: `src/lib/graph-model.ts`
- Create: `src/components/timeline-view.tsx`
- Create: `src/components/relationship-view.tsx`
- Create: `src/components/map-canvas.tsx`

**Interfaces:**
- Produces node/edge models, timeline conflict checks, relationship graph and lightweight map node/route editor.

- [ ] Implement pure conflict detection tests first.
- [ ] Add editable timeline and relation nodes linked to characters, locations and chapters.
- [ ] Add a lightweight SVG map with background image, nodes, labels, routes, pan/zoom and SVG export.

### Task 8: Server capability boundary

**Files:**
- Create: `src/lib/capabilities.ts`
- Create: `docs/server-integration.md`

**Interfaces:**
- Produces runtime feature flags for `auth`, `cloudDatabase`, `objectStorage`, `scheduledRankingSync`, `officialPublishingApi`, and `aiAssistant`.

- [ ] Hide unavailable controls instead of presenting mock security or fake publishing.
- [ ] Document the required Sites/Cloudflare bindings, schema and secure API contracts for invite-only multi-user deployment.
- [ ] Keep local-only mode fully functional without external secrets.

### Task 9: Verification and release

**Files:**
- Modify: `README.md`
- Create: `docs/verification-report.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces reproducible verification evidence and a draft PR.

- [ ] Run unit tests, typecheck, worker-entry verification and production build.
- [ ] Confirm offline draft recovery, conflict copies, version restore, import/export round-trip, responsive layout and no destructive text tool behavior.
- [ ] Record supported and intentionally unavailable features without overclaiming.
- [ ] Open a draft pull request for review; do not merge automatically.
