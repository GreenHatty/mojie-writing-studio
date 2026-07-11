export type PlatformRole = 'OWNER' | 'WRITER';

export type WorkRole = 'EDITOR' | 'COMMENTER' | 'VIEWER';

export type CanonicalContent = {
  type: 'doc';
  content?: Array<Record<string, unknown>>;
};

export type RuntimeBindings = {
  DB?: D1Database;
  OBJECTS?: R2Bucket;
  APP_ORIGIN?: string;
  OWNER_INITIALIZATION_KEY?: string;
  LOCAL_DRAFT_KEK?: string;
  MOJIE_ADMIN_TOKEN?: string;
  MOJIE_BACKUP_MASTER_KEY?: string;
  NODE_ENV?: string;
};

export type RequiredRuntimeBindings = RuntimeBindings & {
  DB: D1Database;
  OBJECTS: R2Bucket;
  APP_ORIGIN: string;
  OWNER_INITIALIZATION_KEY: string;
  LOCAL_DRAFT_KEK: string;
  MOJIE_ADMIN_TOKEN: string;
  MOJIE_BACKUP_MASTER_KEY: string;
};

export type SyncOperationRecord = {
  clientOperationId: string;
  userId: string;
  chapterId: string;
};
