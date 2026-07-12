import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const baseUrl = String(process.env.MOJIE_PREVIEW_URL || '').replace(/\/+$/u, '');
const adminToken = process.env.MOJIE_ADMIN_TOKEN || '';
const rankingSourceUrl = process.env.MOJIE_AUTHORIZED_RANKING_URL || '';
const rankingAuthorization = process.env.MOJIE_RANKING_AUTHORIZATION || '';
const reportPath = process.env.MOJIE_ACCEPTANCE_REPORT || 'cloudflare-preview-acceptance.json';

if (!baseUrl || !adminToken) {
  throw new Error('MOJIE_PREVIEW_URL 和 MOJIE_ADMIN_TOKEN 均为必填。');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class CookieClient {
  constructor(name) {
    this.name = name;
    this.cookie = '';
  }

  async request(path, options = {}, expectedStatuses = [200]) {
    const method = options.method || 'GET';
    const headers = new Headers(options.headers || {});
    if (this.cookie) headers.set('cookie', this.cookie);
    if (method !== 'GET' && method !== 'HEAD') headers.set('origin', baseUrl);
    if (options.json !== undefined) headers.set('content-type', 'application/json');

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
      redirect: 'manual'
    });

    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    if (setCookies.length) this.cookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ');

    if (!expectedStatuses.includes(response.status)) {
      const text = await response.text();
      throw new Error(`${this.name} ${method} ${path} 返回 ${response.status}，预期 ${expectedStatuses.join('/')}：${text.slice(0, 1000)}`);
    }
    return response;
  }

  async json(path, options = {}, expectedStatuses = [200]) {
    const response = await this.request(path, options, expectedStatuses);
    return await response.json();
  }
}

const owner = new CookieClient('owner');
const editor = new CookieClient('editor');
const viewer = new CookieClient('viewer');
const anonymous = new CookieClient('anonymous');
const stamp = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const ownerEmail = `owner-${stamp}@preview.mojie.invalid`;
const editorEmail = `editor-${stamp}@preview.mojie.invalid`;
const viewerEmail = `viewer-${stamp}@preview.mojie.invalid`;
const ownerPassword = `Owner-${randomBytes(18).toString('base64url')}!`;
const editorPassword = `Editor-${randomBytes(18).toString('base64url')}!`;
const viewerPassword = `Viewer-${randomBytes(18).toString('base64url')}!`;
const workId = `acceptance-${stamp}`;
const chapterId = `chapter-${stamp}`;
const checks = [];

function passed(name, details = {}) {
  checks.push({ name, status: 'passed', ...details });
  console.log(`✓ ${name}`);
}

const publicStatus = await anonymous.json('/api/site/public');
assert(publicStatus.serverReady === true, '预览站点未绑定 D1。');
passed('D1 绑定与公开状态接口');

await anonymous.request('/api/cloud/works', {}, [401]);
passed('未登录读取私人作品返回 401');

const bootstrap = await owner.json('/api/auth/bootstrap', {
  method: 'POST',
  headers: { authorization: `Bearer ${adminToken}` },
  json: { email: ownerEmail, password: ownerPassword, displayName: '预览验收所有者' }
}, [201]);
assert(bootstrap.user?.globalRole === 'owner', '首次初始化未创建 owner。');
passed('首次站点所有者初始化');

const createdWork = await owner.json(`/api/cloud/works/${encodeURIComponent(workId)}`, {
  method: 'PUT',
  json: {
    title: '墨界 D1 验收作品',
    payload: {
      id: workId,
      title: '墨界 D1 验收作品',
      volumes: [{ id: `volume-${stamp}`, title: '第一卷', chapters: [{ id: chapterId, title: '第1章', content: '<p>原始验收正文</p>', plainText: '原始验收正文' }] }]
    }
  }
}, [201]);
assert(createdWork.revision === 1, '云端作品初始修订号不正确。');
passed('创建权限隔离的 D1 云端作品');

async function inviteAndRegister(client, email, password, role) {
  const invite = await owner.json(`/api/cloud/works/${encodeURIComponent(workId)}/invitations`, {
    method: 'POST',
    json: { email, role, expiresHours: 2, maxUses: 1 }
  }, [201]);
  const accepted = await client.json('/api/auth/accept-invite', {
    method: 'POST',
    json: { email, password, displayName: `${role}验收用户`, token: invite.invitation.token }
  }, [201]);
  return accepted.user;
}

const editorUser = await inviteAndRegister(editor, editorEmail, editorPassword, 'editor');
const viewerUser = await inviteAndRegister(viewer, viewerEmail, viewerPassword, 'viewer');
passed('作品级一次性邀请与注册');

await editor.request(`/api/cloud/works/${encodeURIComponent(workId)}`);
await viewer.request(`/api/cloud/works/${encodeURIComponent(workId)}`);
passed('已授权 editor/viewer 可读取作品');

const editorUpdate = await editor.json(`/api/cloud/works/${encodeURIComponent(workId)}`, {
  method: 'PUT',
  json: {
    baseRevision: 1,
    title: '墨界 D1 验收作品',
    payload: {
      id: workId,
      title: '墨界 D1 验收作品',
      volumes: [{ id: `volume-${stamp}`, title: '第一卷', chapters: [{ id: chapterId, title: '第1章', content: '<p>编辑已修改正文</p>', plainText: '编辑已修改正文' }] }]
    }
  }
});
assert(editorUpdate.revision === 2, 'editor 写入未增加修订号。');
await viewer.request(`/api/cloud/works/${encodeURIComponent(workId)}`, {
  method: 'PUT',
  json: { baseRevision: 2, title: '禁止写入', payload: {} }
}, [403]);
passed('editor 可写、viewer 写入返回 403');

await owner.request(`/api/cloud/works/${encodeURIComponent(workId)}`, {
  method: 'PUT',
  json: { baseRevision: 1, title: '过期修订', payload: {} }
}, [409]);
passed('旧修订写入返回 409 并拒绝覆盖');

const comment = await editor.json(`/api/collaboration/works/${encodeURIComponent(workId)}/comments`, {
  method: 'POST',
  json: { chapterId, anchorFrom: 0, anchorTo: 2, quotedText: '编辑', body: '这里需要进一步说明人物动机。' }
}, [201]);
const suggestion = await editor.json(`/api/collaboration/works/${encodeURIComponent(workId)}/suggestions`, {
  method: 'POST',
  json: { chapterId, anchorFrom: 0, anchorTo: 2, originalText: '编辑', replacementText: '主角', reason: '避免指代含混。' }
}, [201]);
await owner.json(`/api/collaboration/suggestions/${encodeURIComponent(suggestion.suggestionId)}`, {
  method: 'PATCH',
  json: { status: 'accepted' }
});
assert(comment.commentId && suggestion.suggestionId, '批注或建议未创建。');
passed('批注、替换建议与人工接受状态');

const members = await owner.json(`/api/cloud/works/${encodeURIComponent(workId)}/members`);
assert(members.members.some((member) => member.user_id === editorUser.id && member.role === 'editor'), '成员列表缺少 editor。');
assert(members.members.some((member) => member.user_id === viewerUser.id && member.role === 'viewer'), '成员列表缺少 viewer。');
await owner.request(`/api/cloud/works/${encodeURIComponent(workId)}/members/${encodeURIComponent(editorUser.id)}`, { method: 'DELETE' });
await editor.request(`/api/cloud/works/${encodeURIComponent(workId)}`, {}, [401]);
passed('撤权立即清除会话并阻止继续访问');

await owner.request(`/api/docx/${encodeURIComponent(workId)}/original`, {
  method: 'POST',
  headers: {
    'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'x-file-name': encodeURIComponent('本地DOCX模式.docx'),
    'x-paragraph-count': '1'
  },
  body: new Uint8Array([80, 75, 3, 4])
}, [503]);
passed('未绑定 R2 时 DOCX 云上传明确返回 503，本地模式不伪装云存储');

await owner.request('/api/rankings/sources', {
  method: 'POST',
  json: { platform: 'qidian', listName: '非法来源测试', category: '全部', sourceUrl: 'https://example.com/rank', authorizationNote: '预览验收拒绝非白名单域名' }
}, [400]);

if (rankingSourceUrl) {
  await owner.json('/api/rankings/sources', {
    method: 'POST',
    json: {
      platform: rankingSourceUrl.includes('fanqie') ? 'fanqie' : 'qidian',
      listName: '授权预览验收榜',
      category: '全部',
      sourceUrl: rankingSourceUrl,
      authorizationNote: rankingAuthorization || '由仓库所有者提供的授权预览数据源',
      enabled: true
    }
  }, [201]);
  const rankingRun = await owner.json('/api/rankings/run', { method: 'POST', json: {} });
  assert(rankingRun.successes >= 1 && rankingRun.failures.length === 0, `授权榜单实时抓取失败：${JSON.stringify(rankingRun.failures)}`);
  passed('授权排行榜实时抓取', { liveCollection: true });
} else {
  passed('排行榜域名白名单与授权记录校验', { liveCollection: 'skipped-no-authorized-url' });
}

const policies = await owner.json('/api/backups/policies');
assert(Array.isArray(policies.policies), '第三方备份策略接口不可用。');
passed('WebDAV/S3 第三方备份策略接口可用', { liveExternalStorage: 'not-configured' });

const overview = await owner.json('/api/admin/overview');
assert(overview.counts.users >= 3 && overview.counts.works >= 1, '管理后台统计未反映验收数据。');
passed('Owner 管理后台与审计统计');

const report = {
  generatedAt: new Date().toISOString(),
  previewUrl: baseUrl,
  mode: 'd1-only-no-r2',
  workId,
  checks,
  storage: {
    cloudDocuments: 'Cloudflare D1',
    docx: 'browser IndexedDB and manual download',
    automaticBackup: 'WebDAV or S3-compatible after user configuration',
    r2: 'disabled'
  },
  summary: { passed: checks.length, failed: 0, liveRankingCollection: Boolean(rankingSourceUrl) }
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`全部 ${checks.length} 项 D1-only Cloudflare 预览验收通过。`);
