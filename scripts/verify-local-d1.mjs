import { spawnSync } from 'node:child_process';

const command = process.execPath;
const common = ['node_modules/wrangler/bin/wrangler.js'];
const config = 'test/wrangler.d1.local.jsonc';
const database = 'mojie-writing-studio-local-d1-acceptance';

function run(args) {
  const result = spawnSync(command, [...common, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    // Invoke Wrangler's JavaScript entry point directly. This avoids Windows
    // cmd quoting changing the SQL passed via --command.
    shell: false
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`Local D1 command failed: ${args.join(' ')}${result.error ? ` (${result.error.message})` : ''}`);
  }
  return result.stdout;
}

function runExpectFailure(args) {
  const result = spawnSync(command, [...common, ...args], { cwd: process.cwd(), encoding: 'utf8', shell: false });
  if (result.status === 0) throw new Error(`Expected local D1 command to fail: ${args.join(' ')}`);
}

run(['d1', 'migrations', 'apply', database, '--local', '--config', config]);
const output = run(['d1', 'execute', database, '--local', '--config', config, '--command', "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", '--json']);
const parsed = JSON.parse(output);
const tables = new Set((parsed[0]?.results ?? []).map((row) => row.name));
const required = [
  'platform_accounts',
  'platform_sessions',
  'user_local_draft_keys',
  'works',
  'work_access',
  'chapters',
  'chapter_versions',
  'chapter_notes',
  'chapter_comments_v2',
  'change_suggestions',
  'sync_operations',
  'migration_runs',
  'migration_work_items'
];
const missing = required.filter((table) => !tables.has(table));
if (missing.length) throw new Error(`Local D1 migration omitted tables: ${missing.join(', ')}`);

// These commands operate only on the config-scoped, local Miniflare D1 state.
// They prove the DDL-level idempotency and token-storage boundaries that the
// production repositories rely on; no remote database is contacted.
run(['d1', 'execute', database, '--local', '--config', config, '--command', "DELETE FROM sync_operations; DELETE FROM chapters; DELETE FROM volumes; DELETE FROM works; DELETE FROM platform_accounts;", '--json']);
run(['d1', 'execute', database, '--local', '--config', config, '--command', "INSERT INTO platform_accounts (id, account_identifier, platform_role, password_algorithm, password_iterations, password_salt, password_digest, owner_slot, owner_initialized_at, created_at, updated_at) VALUES ('accept-owner', 'acceptance-owner@example.test', 'OWNER', 'PBKDF2-SHA-256', 600000, X'00', X'00', 1, '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z');", '--json']);
runExpectFailure(['d1', 'execute', database, '--local', '--config', config, '--command', "INSERT INTO platform_accounts (id, account_identifier, platform_role, password_algorithm, password_iterations, password_salt, password_digest, owner_slot, owner_initialized_at, created_at, updated_at) VALUES ('accept-owner-2', 'acceptance-owner-2@example.test', 'OWNER', 'PBKDF2-SHA-256', 600000, X'00', X'00', 1, '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z');", '--json']);
run(['d1', 'execute', database, '--local', '--config', config, '--command', "INSERT INTO works (id, owner_id, title, kind, status, version, created_at, updated_at) VALUES ('accept-work', 'accept-owner', '验收作品', 'long', 'DRAFT', 0, '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z'); INSERT INTO volumes (id, work_id, title, position, created_at, updated_at) VALUES ('accept-volume', 'accept-work', '正文', 0, '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z'); INSERT INTO chapters (id, work_id, volume_id, title, canonical_content, plain_text, status, position, revision, created_at, updated_at) VALUES ('accept-chapter', 'accept-work', 'accept-volume', '第一章', '{\"type\":\"doc\",\"schemaVersion\":1}', '', 'DRAFT', 0, 0, '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z'); INSERT INTO sync_operations (client_operation_id, user_id, chapter_id, request_digest, result_json, created_at) VALUES ('accept-op', 'accept-owner', 'accept-chapter', 'digest', '{\"kind\":\"saved\",\"revision\":1}', '2026-07-13T00:00:00.000Z');", '--json']);
runExpectFailure(['d1', 'execute', database, '--local', '--config', config, '--command', "INSERT INTO sync_operations (client_operation_id, user_id, chapter_id, request_digest, result_json, created_at) VALUES ('accept-op', 'accept-owner', 'accept-chapter', 'digest', '{\"kind\":\"saved\",\"revision\":1}', '2026-07-13T00:00:00.000Z');", '--json']);
const sessionColumns = JSON.parse(run(['d1', 'execute', database, '--local', '--config', config, '--command', "SELECT name FROM pragma_table_info('platform_sessions')", '--json']))[0]?.results ?? [];
if (sessionColumns.some((column) => ['token', 'session_token', 'raw_token'].includes(column.name))) {
  throw new Error('platform_sessions unexpectedly stores a raw session token column');
}

process.stdout.write(`Local D1 migration acceptance passed (${required.length} foundation tables, singleton Owner, sync idempotency, and digest-only sessions verified).\n`);
