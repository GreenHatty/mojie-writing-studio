import { describe, expect, it } from 'vitest';
import { readJsonBody } from './request';

describe('readJsonBody', () => {
  it('rejects an oversized body before unbounded parsing', async () => {
    const request = new Request('https://writer.example/api', { method: 'POST', headers: { 'Content-Length': '100' }, body: '{}' });
    await expect(readJsonBody(request, 10)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });
});
