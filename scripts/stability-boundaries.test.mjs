import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(path, 'utf8');

describe('stability boundaries', () => {
  it('does not use a global MutationObserver to rewrite the React DOM', () => {
    expect(read('src/components/authenticated-app.tsx')).not.toContain('MutationObserver');
    expect(read('src/components/authenticated-app.tsx')).not.toContain('document.body');
  });

  it('does not mount rankings on dashboard startup', () => {
    const dashboard = read('src/components/workspace-dashboard.tsx');
    expect(dashboard).toContain("lazy(() => import('./ranking-automation-panel')");
    expect(dashboard).toContain('rankingOpen ?');
  });

  it('returns 202 tasks instead of awaiting ranking collection', () => {
    const api = read('scripts/mojie-api.mjs');
    expect(api).toContain("'/api/rankings/tasks'");
    expect(api).toContain("status: 'queued' }, 202");
    expect(api).toContain('ctx.waitUntil(promise)');
  });

  it('ships the ranking task migration and independent adapters', () => {
    const migration = read('migrations/0003_ranking_tasks.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ranking_tasks');
    expect(read('scripts/ranking-adapters.mjs')).toContain('class QidianRankingAdapterV1');
    expect(read('scripts/ranking-adapters.mjs')).toContain('class FanqieRankingAdapterV1');
  });
});
