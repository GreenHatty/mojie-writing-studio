import { describe, expect, it, vi } from 'vitest';
import { createCollaborationHandlers } from './collaboration-handler';

describe('collaboration handlers', () => {
  it('creates comments and suggestions only through CSRF-protected requests', async () => {
    const assertMutation = vi.fn(); const createComment = vi.fn(async () => ({ id: 'comment' })); const createSuggestion = vi.fn(async () => ({ id: 'suggestion' }));
    const handlers = createCollaborationHandlers({ async requireUserId() { return 'u'; }, assertMutation, store: { createComment, createSuggestion, async handleSuggestion() { return { revision: 1 }; } } });
    await handlers.create(new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ type: 'comment', body: '这里需要解释' }) }), 'c');
    await handlers.create(new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ type: 'suggestion', replacementContent: { type: 'doc' }, baseRevision: 2 }) }), 'c');
    expect(assertMutation).toHaveBeenCalledTimes(2); expect(createComment).toHaveBeenCalledWith('u', 'c', '这里需要解释', null); expect(createSuggestion).toHaveBeenCalledWith('u', 'c', { type: 'doc' }, 2, null);
  });

  it('requires an explicit accept or reject action', async () => {
    const handleSuggestion = vi.fn(async () => ({ revision: 3 }));
    const handlers = createCollaborationHandlers({ async requireUserId() { return 'editor'; }, assertMutation() {}, store: { async createComment() { return { id: 'c' }; }, async createSuggestion() { return { id: 's' }; }, handleSuggestion } });
    const response = await handlers.handle(new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ action: 'accept' }) }), 'chapter', 'suggestion');
    expect(response.status).toBe(200); expect(handleSuggestion).toHaveBeenCalledWith('editor', 'chapter', 'suggestion', 'accept');
  });
});
