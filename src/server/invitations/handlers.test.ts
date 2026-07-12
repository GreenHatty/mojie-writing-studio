import { describe, expect, it, vi } from 'vitest';
import { createInvitationHandlers } from './handlers';

describe('invitation handlers', () => {
  it('creates a scoped invitation through session and CSRF checks', async () => {
    const assertMutation = vi.fn(); const create = vi.fn(async () => ({ id: 'i', token: 'secret-once' }));
    const handlers = createInvitationHandlers({ async requireUserId() { return 'owner'; }, assertOrigin() {}, assertMutation, workflow: { create, async revoke() {}, async accept() { return { userId: 'u' }; } } });
    const response = await handlers.create(new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ role: 'EDITOR', workId: 'w', expiresAt: '2026-07-13T00:00:00Z', maxUses: 1 }) }));
    expect(response.status).toBe(201); expect(assertMutation).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledWith('owner', expect.objectContaining({ role: 'EDITOR', workId: 'w' }));
  });

  it('accepts a token with credentials but returns generic invitation errors', async () => {
    const accept = vi.fn(async () => ({ userId: 'writer' }));
    const handlers = createInvitationHandlers({ async requireUserId() { return 'owner'; }, assertOrigin() {}, assertMutation() {}, workflow: { async create() { return { id: 'i', token: 't' }; }, async revoke() {}, accept } });
    const response = await handlers.accept(new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ account: 'writer', password: 'strong-password' }) }), 'token');
    expect(response.status).toBe(200); expect(accept).toHaveBeenCalledWith('token', 'writer', 'strong-password');
  });
});
