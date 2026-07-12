export type DatabaseLifecycleState =
  | 'idle'
  | 'opening'
  | 'upgrading'
  | 'ready'
  | 'blocked'
  | 'versionchange'
  | 'upgrade-failed'
  | 'read-only'
  | 'closed';

export type DatabaseLifecycleListener = (state: DatabaseLifecycleState, detail?: string) => void;

export function withDatabaseTimeout<T>(promise: Promise<T>, timeoutMs = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('INDEXEDDB_OPEN_TIMEOUT')), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

export function createDatabaseCoordinator(databaseName: string, listener?: DatabaseLifecycleListener) {
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`mojie-db:${databaseName}`);
  channel?.addEventListener('message', (event) => {
    if (event.data?.type === 'upgrade-requested') listener?.('blocked', '另一个标签页正在升级本地数据库。');
    if (event.data?.type === 'versionchange') listener?.('versionchange', '本地数据库版本已经变化。');
  });
  return {
    announce(type: 'upgrade-requested' | 'versionchange') { channel?.postMessage({ type }); },
    close() { channel?.close(); }
  };
}
