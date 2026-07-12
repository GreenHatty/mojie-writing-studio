import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { guardMojiePrivateContent } from './mojie-privacy-guard.mjs';

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql.includes('FROM sessions')) {
      return this.database.sessions.get(this.values[0]) || null;
    }
    if (this.sql.includes('FROM cloud_documents')) {
      const workId = this.values[0];
      return this.database.works.has(workId) ? { work_id: workId } : null;
    }
    if (this.sql.includes('FROM work_members')) {
      const [workId, userId] = this.values;
      const role = this.database.members.get(`${workId}:${userId}`);
      return role ? { role } : null;
    }
    return null;
  }

  async all() {
    if (!this.sql.includes('FROM cloud_documents d JOIN work_members')) return { results: [] };
    const userId = this.values[0];
    return {
      results: [...this.database.works]
        .filter((workId) => this.database.members.has(`${workId}:${userId}`))
        .map((workId) => ({ work_id: workId, role: this.database.members.get(`${workId}:${userId}`) }))
    };
  }
}

class FakeDatabase {
  constructor() {
    this.sessions = new Map();
    this.works = new Set();
    this.members = new Map();
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  addSession(token, userId, globalRole) {
    this.sessions.set(tokenHash(token), {
      id: userId,
      status: 'active',
      global_role: globalRole,
      expires_at: '2099-01-01T00:00:00.000Z'
    });
  }
}

function request(path, method = 'GET', token = '') {
  return new Request(`https://preview.example${path}`, {
    method,
    headers: token ? { cookie: `mojie_session=${token}` } : undefined
  });
}

const DB = new FakeDatabase();
DB.addSession('writer-token', 'writer-user', 'writer');
DB.addSession('viewer-token', 'viewer-user', 'viewer');
DB.addSession('owner-token', 'owner-user', 'owner');
DB.addSession('editor-token', 'editor-user', 'editor');
DB.works.add('private-work');
DB.members.set('private-work:editor-user', 'editor');

let result = await guardMojiePrivateContent(request('/api/cloud/works/new-work', 'PUT'), { DB });
assert.equal(result?.status, 401, '未登录用户不能创建作品');

result = await guardMojiePrivateContent(request('/api/cloud/works/new-work', 'PUT', 'writer-token'), { DB });
assert.equal(result, null, '具备写作角色的登录用户应能创建尚不存在的作品');

result = await guardMojiePrivateContent(request('/api/cloud/works/new-work', 'PUT', 'viewer-token'), { DB });
assert.equal(result?.status, 403, '只读用户不能创建作品');

result = await guardMojiePrivateContent(request('/api/cloud/works/private-work', 'GET', 'owner-token'), { DB });
assert.equal(result?.status, 403, '全局所有者没有成员关系时不能读取私人作品');

result = await guardMojiePrivateContent(request('/api/cloud/works/private-work', 'PUT', 'editor-token'), { DB });
assert.equal(result, null, '明确授权的编辑可以写入已有作品');

result = await guardMojiePrivateContent(request('/api/cloud/works', 'GET', 'owner-token'), { DB });
assert.equal(result?.status, 200);
const ownerWorks = await result.json();
assert.deepEqual(ownerWorks.works, [], '作品列表不得因为全局角色返回未授权作品');

result = await guardMojiePrivateContent(request('/api/cloud/works', 'GET', 'editor-token'), { DB });
const editorWorks = await result.json();
assert.deepEqual(editorWorks.works, [{ work_id: 'private-work', role: 'editor' }]);

console.log('Privacy guard enforces creation roles and explicit work membership.');
