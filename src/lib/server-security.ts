export type WorkspaceRole = 'owner' | 'admin' | 'writer' | 'editor' | 'commenter' | 'viewer';

export type WorkspaceAction =
  | 'invite-user'
  | 'manage-members'
  | 'manage-backups'
  | 'manage-ranking-sources'
  | 'write-content'
  | 'comment'
  | 'read-content';

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<WorkspaceAction>> = {
  owner: new Set([
    'invite-user',
    'manage-members',
    'manage-backups',
    'manage-ranking-sources',
    'write-content',
    'comment',
    'read-content'
  ]),
  admin: new Set([
    'invite-user',
    'manage-members',
    'manage-backups',
    'manage-ranking-sources',
    'write-content',
    'comment',
    'read-content'
  ]),
  writer: new Set(['write-content', 'comment', 'read-content']),
  editor: new Set(['write-content', 'comment', 'read-content']),
  commenter: new Set(['comment', 'read-content']),
  viewer: new Set(['read-content'])
};

export function canPerform(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return ROLE_PERMISSIONS[role].has(action);
}

export type BackupPolicyInput = {
  intervalMinutes: number;
  retentionHours: number;
};

export function normalizeBackupPolicy(input: BackupPolicyInput): BackupPolicyInput {
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 5 || input.intervalMinutes > 30 * 24 * 60) {
    throw new Error('自动备份间隔必须是5分钟到30天之间的整数分钟。');
  }
  if (!Number.isInteger(input.retentionHours) || input.retentionHours < 1 || input.retentionHours > 24 * 365) {
    throw new Error('临时备份保留时间必须是1小时到365天之间的整数小时。');
  }
  return { intervalMinutes: input.intervalMinutes, retentionHours: input.retentionHours };
}
