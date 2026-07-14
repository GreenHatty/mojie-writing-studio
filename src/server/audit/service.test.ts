import { describe, expect, it } from 'vitest';
import { createAuditService, createMemoryAuditStore } from './service';

describe('audit service', () => {
  it('drops正文 credentials cookies and tokens', async () => {
    const store = createMemoryAuditStore();
    const audit = createAuditService(store);
    await audit.write({ actorId: 'u', action: 'chapter.saved', targetType: 'chapter', targetId: 'c', metadata: { content: '正文', password: 'p', cookie: 'c', token: 't', revision: 2 } });
    expect(store.records()[0].metadata).toEqual({ revision: 2 });
  });
});
