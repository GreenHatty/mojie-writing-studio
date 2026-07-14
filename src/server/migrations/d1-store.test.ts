import { describe, expect, it } from 'vitest';
import { createD1MigrationExecutor } from './d1-store';

describe('D1 migration executor', () => {
  it('writes normalized tables and preserves legacy HTML instead of replacing source data', async () => {
    const sql: string[] = [];
    const database = {
      prepare(statement: string) { sql.push(statement); return { bind() { return this; }, first: async () => null, run: async () => ({ meta: { changes: 1 } }) }; },
      batch: async (statements: unknown[]) => { expect(statements.length).toBeGreaterThan(2); }
    } as unknown as D1Database;
    const executor = createD1MigrationExecutor(database);
    await executor.importWork('u1', 'm1', { id: 'old-work', title: '旧书', volumes: [{ id: 'v1', title: '第一卷', chapters: [{ id: 'c1', title: '第一章', content: '<p>旧正文</p>' }] }] }, 'hash');
    expect(sql.join('\n')).toContain('legacy_html');
    expect(sql.join('\n')).not.toContain('DELETE FROM cloud_documents');
  });

  it('names volume and chapter targets with the legacy work id to prevent cross-work collisions', async () => {
    const bound: unknown[][] = [];
    const database = {
      prepare() { return { bind(...values: unknown[]) { bound.push(values); return this; }, first: async () => null, run: async () => ({ meta: { changes: 1 } }) }; },
      batch: async () => undefined
    } as unknown as D1Database;
    const executor = createD1MigrationExecutor(database);
    await executor.importWork('u1', 'migration', { id: 'work-a', title: '甲', volumes: [{ id: 'shared-volume', title: '卷', chapters: [{ id: 'shared-chapter', title: '章', content: '<p>甲</p>' }] }] }, 'hash-a');
    await executor.importWork('u1', 'migration', { id: 'work-b', title: '乙', volumes: [{ id: 'shared-volume', title: '卷', chapters: [{ id: 'shared-chapter', title: '章', content: '<p>乙</p>' }] }] }, 'hash-b');
    const serialized = JSON.stringify(bound);
    expect(serialized).toContain('migrated:migration:work-a:volume:shared-volume');
    expect(serialized).toContain('migrated:migration:work-b:volume:shared-volume');
    expect(serialized).toContain('migrated:migration:work-a:chapter:shared-chapter');
    expect(serialized).toContain('migrated:migration:work-b:chapter:shared-chapter');
  });
});
