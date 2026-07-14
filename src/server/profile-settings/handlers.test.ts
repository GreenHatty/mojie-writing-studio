import { describe, expect, it, vi } from 'vitest';
import { createProfileSettingsHandlers } from './handlers';

const settings = { theme: 'paper' as const, fontSize: 18, lineHeight: 1.9, editorWidth: 'comfortable' as const, leftColumnWidth: 280, rightColumnWidth: 320, updatedAt: '2026-07-13T00:00:00.000Z' };

describe('profile settings handlers', () => {
  it('requires CSRF and validates bounded visual preferences', async () => {
    const assertMutation = vi.fn();
    const put = vi.fn(async () => settings);
    const handlers = createProfileSettingsHandlers({ requireUserId: async () => 'user-1', assertMutation, store: { get: async () => settings, put } });
    const response = await handlers.put(new Request('https://app.test/api/core/profile-settings', { method: 'PUT', body: JSON.stringify({ ...settings, updatedAt: undefined }) }));
    expect(response.status).toBe(200);
    expect(assertMutation).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith('user-1', expect.objectContaining({ theme: 'paper', fontSize: 18 }));
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('rejects unsafe sidebar sizes before persistence', async () => {
    const handlers = createProfileSettingsHandlers({ requireUserId: async () => 'user-1', assertMutation: () => undefined, store: { get: async () => settings, put: async () => settings } });
    const response = await handlers.put(new Request('https://app.test', { method: 'PUT', body: JSON.stringify({ ...settings, leftColumnWidth: 10 }) }));
    expect(response.status).toBe(400);
  });
});
