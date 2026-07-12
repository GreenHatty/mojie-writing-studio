import { describe, expect, it } from 'vitest';
import { canPerform, normalizeBackupPolicy, type WorkspaceRole } from './server-security';

describe('canPerform', () => {
  const roles: WorkspaceRole[] = ['owner', 'admin', 'writer', 'editor', 'commenter', 'viewer'];

  it('allows only owners and admins to invite users and configure backups', () => {
    for (const role of roles) {
      expect(canPerform(role, 'invite-user')).toBe(role === 'owner' || role === 'admin');
      expect(canPerform(role, 'manage-backups')).toBe(role === 'owner' || role === 'admin');
    }
  });

  it('allows writers and editors to update content but not viewers', () => {
    expect(canPerform('owner', 'write-content')).toBe(true);
    expect(canPerform('admin', 'write-content')).toBe(true);
    expect(canPerform('writer', 'write-content')).toBe(true);
    expect(canPerform('editor', 'write-content')).toBe(true);
    expect(canPerform('commenter', 'write-content')).toBe(false);
    expect(canPerform('viewer', 'write-content')).toBe(false);
  });
});

describe('normalizeBackupPolicy', () => {
  it('normalizes user-selected intervals and retention windows', () => {
    expect(normalizeBackupPolicy({ intervalMinutes: 30, retentionHours: 72 })).toEqual({
      intervalMinutes: 30,
      retentionHours: 72
    });
  });

  it('rejects unsafe schedules', () => {
    expect(() => normalizeBackupPolicy({ intervalMinutes: 2, retentionHours: 1 })).toThrow(/间隔/u);
    expect(() => normalizeBackupPolicy({ intervalMinutes: 30, retentionHours: 0 })).toThrow(/保留/u);
    expect(() => normalizeBackupPolicy({ intervalMinutes: 30, retentionHours: 24 * 366 })).toThrow(/保留/u);
  });
});
