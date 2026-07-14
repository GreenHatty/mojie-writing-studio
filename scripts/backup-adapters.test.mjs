import { describe, expect, it, vi } from 'vitest';
import { S3CompatibleBackupAdapter, WebDavBackupAdapter, backupAdapterFor, validateBackupUrl } from './backup-adapters.mjs';

describe('external backup adapters', () => {
  it('rejects non-HTTPS, credentialed and private-network targets', () => {
    expect(() => validateBackupUrl('http://dav.example.com')).toThrow('backup_https_required');
    expect(() => validateBackupUrl('https://user:pass@dav.example.com')).toThrow('backup_url_credentials_forbidden');
    expect(() => validateBackupUrl('https://127.0.0.1/backups')).toThrow('backup_host_forbidden');
    expect(() => validateBackupUrl('https://192.168.1.2/backups')).toThrow('backup_host_forbidden');
  });

  it('performs WebDAV create, read and delete without following redirects', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 201 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = new WebDavBackupAdapter({ baseUrl: 'https://dav.example.com/archive', username: 'writer', password: 'secret' }, fetchImpl);
    await adapter.put('works/one.json', new TextEncoder().encode('{}'));
    expect(new TextDecoder().decode(await adapter.get('works/one.json'))).toBe('{"ok":true}');
    await adapter.delete('works/one.json');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
  });

  it('signs S3-compatible create/read/delete requests without exposing the secret', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = new S3CompatibleBackupAdapter({ endpoint: 'https://s3.example.com', bucket: 'mojie', region: 'auto', accessKeyId: 'ACCESS', secretAccessKey: 'SECRET', pathStyle: true }, fetchImpl);
    await adapter.put('works/one.json', new TextEncoder().encode('{}'));
    await adapter.get('works/one.json');
    await adapter.delete('works/one.json');
    const headers = fetchImpl.mock.calls[0][1].headers;
    expect(headers.authorization).toContain('AWS4-HMAC-SHA256 Credential=ACCESS/');
    expect(JSON.stringify(headers)).not.toContain('SECRET');
  });

  it('rejects redirects and unsupported target types', async () => {
    const redirect = async () => new Response('', { status: 302, headers: { location: 'https://elsewhere.example.com' } });
    const adapter = new WebDavBackupAdapter({ baseUrl: 'https://dav.example.com', username: '', password: '' }, redirect);
    await expect(adapter.put('a.json', new Uint8Array())).rejects.toThrow('backup_redirect_rejected');
    expect(() => backupAdapterFor('r2', {})).toThrow('backup_target_unsupported');
  });

  it('caps backup download bodies', async () => {
    const huge = async () => new Response('x', { status: 200, headers: { 'content-length': String(30 * 1024 * 1024) } });
    const adapter = new WebDavBackupAdapter({ baseUrl: 'https://dav.example.com', username: '', password: '' }, huge);
    await expect(adapter.get('huge.json')).rejects.toThrow('backup_response_too_large');
  });

  it('uses bounded backoff for 429 and then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 201 }));
    const adapter = new WebDavBackupAdapter({ baseUrl: 'https://dav.example.com', username: 'writer', password: 'secret' }, fetchImpl);
    await adapter.put('retry.json', new Uint8Array());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
