import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const baseUrl = String(process.env.MOJIE_PREVIEW_URL || '').replace(/\/+$/u, '');
const adminToken = process.env.MOJIE_ADMIN_TOKEN || '';
const d1Name = process.env.MOJIE_D1_NAME || '';
const rankingSourceUrl = process.env.MOJIE_AUTHORIZED_RANKING_URL || '';
const rankingAuthorization = process.env.MOJIE_RANKING_AUTHORIZATION || '';
const reportPath = process.env.MOJIE_ACCEPTANCE_REPORT || 'cloudflare-preview-acceptance.json';

if (!baseUrl || !adminToken || !d1Name) {
  throw new Error('MOJIE_PREVIEW_URL、MOJIE_ADMIN_TOKEN 和 MOJIE_D1_NAME 均为必填。');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeSql(value) {
  return String(value).replace(/'/gu, "''");
}

function runD1(command) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', d1Name, '--remote', '--command', command], {
    stdio: 'inherit',
    env: process.env
  });
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
    title: '墨界云端验收作品',
    payload: {
      id: workId,
      title: '墨界云端验收作品',
      volumes: [{ id: `volume-${stamp}`, title: '第一卷', chapters: [{ id: chapterId, title: '第1章', content: '<p>原始验收正文</p>', plainText: '原始验收正文' }] }]
    }
  }
}, [201]);
assert(createdWork.revision === 1, '云端作品初始修订号不正确。');
passed('创建权限隔离的云端作品');

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
    title: '墨界云端验收作品',
    payload: {
      id: workId,
      title: '墨界云端验收作品',
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
passed('撤权立即清除会话并阻止缓存访问');

const docxBytes = Buffer.from('UEsDBBQAAAAIABwK7FwXmADX6wAAALIBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU4DMQy98xWRr2gmAweEUKc9sByBQ/kAK/HMRM2mOC3t3+NpoQdUONpvs99itQ9e7aiwS7GHm7YDRdEk6+LYw8f6pbkHxRWjRZ8i9XAghtXyarE+ZGIl4sg9TLXmB63ZTBSQ25QpCjKkErDKWEad0WxwJH3bdXfapFgp1qbOHiBmTzTg1lf1vJf96ZJCnkE9nphzWA+Ys3cGq+B6F+2vmOY7ohXlkcOTy3wtBNCXI2bo74Qf4ZuUU5wl9Y6lvmIQmv5MxWqbzDaItP3f58KlaRicobN+dsslGWKW1oNvz0hAF88f6GPlyy9QSwMEFAAAAAgAHArsXD+t/vqvAAAALAEAAAsAAABfcmVscy8ucmVsc43POw7CMAwA0J1TRN5pWgaEUEMXhNQVlQNEiZtWNB/F4dPbk4EBKgZG/57tunnaid0x0uidgKoogaFTXo/OCLh0p/UOGCXptJy8QwEzEjSHVX3GSaY8Q8MYiGXEkYAhpbDnnNSAVlLhA7pc6X20MuUwGh6kukqDfFOWWx4/DVigrNUCYqsrYN0c8B/c9/2o8OjVzaJLP3YsOrIso8Ek4OGj5vqdLjILPJ/Dv548vABQSwMEFAAAAAgAHArsXBfF5N/DAAAA5wAAABEAAAB3b3JkL2RvY3VtZW50LnhtbEWOPW7DMAxG957C0N7I6VAUhn+2zB2SAygSExuwSENU43jvkCFje4EsDXKA3qhpfYtIztDlEfxIPDKv9rZNduC4ISzEfJaKBFCTaXBbiNVy8fgiEvYKjWoJoRADsKjKh7zPDOk3C+iTYEDO+kLU3neZlKxrsIpn1AGG2YacVT60bit7cqZzpIE5HLCtfErTZ2lVg6IMyjWZIdYuwkX48ud0/v08jqf3v6/DeDleP75zGfNIN3HaZtD+1ckpuGvk/4vlDVBLAQIUAxQAAAAIABwK7FwXmADX6wAAALIBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAHArsXD+t/vqvAAAALAEAAAsAAAAAAAAAAAAAAIABHAEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAHArsXBfF5N/DAAAA5wAAABEAAAAAAAAAAAAAAIAB9AEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAAOYCAAAAAA==', 'base64');
const uploadedDocx = await owner.json(`/api/docx/${encodeURIComponent(workId)}/original`, {
  method: 'POST',
  headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-file-name': encodeURIComponent('墨界预览验收.docx'), 'x-paragraph-count': '1' },
  body: docxBytes
}, [201]);
const downloadedDocx = Buffer.from(await (await owner.request(`/api/docx/assets/${encodeURIComponent(uploadedDocx.asset.id)}/original`)).arrayBuffer());
assert(createHash('sha256').update(downloadedDocx).digest('hex') === createHash('sha256').update(docxBytes).digest('hex'), 'DOCX 原件下载哈希与上传不一致。');
passed('DOCX 原件 R2 存储与字节哈希一致');

await owner.request('/api/rankings/sources', {
  method: 'POST',
  json: { platform: 'qidian', listName: '非法来源测试', category: '全部', sourceUrl: 'https://example.com/rank', authorizationNote: '预览验收拒绝非白名单域名' }
}, [400]);

if (rankingSourceUrl) {
  const source = await owner.json('/api/rankings/sources', {
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
  const snapshots = await owner.json(`/api/rankings/snapshots?sourceId=${encodeURIComponent(source.sourceId)}`);
  assert(snapshots.snapshots.length >= 1, '授权榜单未生成快照。');
  passed('授权排行榜实时抓取、前十快照与热点解析');
} else {
  await owner.json('/api/rankings/sources', {
    method: 'POST',
    json: {
      platform: 'qidian',
      listName: '预览配置验证',
      category: '全部',
      sourceUrl: 'https://www.qidian.com/rank/',
      authorizationNote: '仅验证白名单配置；数据源保持停用，不执行抓取',
      enabled: false
    }
  }, [201]);
  passed('排行榜域名白名单与授权记录校验', { liveCollection: 'skipped-no-authorized-url' });
}

const policy = await owner.json('/api/backups/policies', {
  method: 'POST',
  json: { targetType: 'r2', enabled: true, intervalMinutes: 5, retentionHours: 1, workId, config: {} }
}, [201]);
runD1(`UPDATE backup_policies SET next_backup_at='1970-01-01T00:00:00.000Z' WHERE id='${safeSql(policy.policyId)}'`);
const backupCreated = await owner.json('/api/backups/run', { method: 'POST', json: {} });
assert(backupCreated.created >= 1 && backupCreated.failures.length === 0, `R2 备份创建失败：${JSON.stringify(backupCreated.failures)}`);
runD1(`UPDATE backup_policies SET enabled=0 WHERE id='${safeSql(policy.policyId)}'`);
runD1(`UPDATE backup_objects SET expires_at='1970-01-01T00:00:00.000Z' WHERE policy_id='${safeSql(policy.policyId)}' AND deleted_at IS NULL`);
const backupDeleted = await owner.json('/api/backups/run', { method: 'POST', json: {} });
assert(backupDeleted.deleted >= 1, '过期 R2 临时备份未自动删除。');
passed('R2 定时备份创建与到期删除');

const overview = await owner.json('/api/admin/overview');
assert(overview.counts.users >= 3 && overview.counts.works >= 1, '管理后台统计未反映验收数据。');
passed('Owner 管理后台与审计统计');

const report = {
  generatedAt: new Date().toISOString(),
  previewUrl: baseUrl,
  workId,
  checks,
  summary: { passed: checks.length, failed: 0, liveRankingCollection: Boolean(rankingSourceUrl) }
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`全部 ${checks.length} 项 Cloudflare 预览验收通过。`);
