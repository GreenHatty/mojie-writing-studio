export type PlatformRole = 'OWNER' | 'WRITER';

export type WorkRole = 'EDITOR' | 'COMMENTER' | 'VIEWER';

export type CanonicalContent = {
  type: 'doc';
  /** All persisted values are normalized to the current Tiptap schema. */
  schemaVersion?: number;
  content?: Array<Record<string, unknown>>;
};

export type RuntimeBindings = {
  DB?: D1Database;
  APP_ORIGIN?: string;
  OWNER_INITIALIZATION_KEY?: string;
  LOCAL_DRAFT_KEK?: string;
  NODE_ENV?: string;
};

export type RequiredRuntimeBindings = RuntimeBindings & {
  DB: D1Database;
  APP_ORIGIN: string;
  OWNER_INITIALIZATION_KEY: string;
  LOCAL_DRAFT_KEK: string;
};

export type SyncOperationRecord = {
  clientOperationId: string;
  userId: string;
  chapterId: string;
};
