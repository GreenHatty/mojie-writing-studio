import { describe, expect, it } from 'vitest';
import { createD1CollaborationStore } from './collaboration-d1-store';

function databaseForRole(role: 'VIEWER' | 'COMMENTER' | 'EDITOR') {
  return { prepare() { return { bind() { return { first: async () => ({ owner_id: 'owner', member_role: role, canonical_content: '{"type":"doc"}', plain_text: '', word_count: 0, revision: 1 }) }; } }; } } as unknown as D1Database;
}

describe('D1 collaboration permissions', () => {
  it('does not let a Viewer create a comment', async () => {
    await expect(createD1CollaborationStore(databaseForRole('VIEWER')).createComment('viewer', 'c', 'no', null)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('lets a Commenter propose but not accept changes', async () => {
    await expect(createD1CollaborationStore(databaseForRole('COMMENTER')).handleSuggestion('commenter', 'c', 's', 'accept')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
