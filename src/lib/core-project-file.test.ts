import { describe, expect, it } from 'vitest';
import { importDocxRoundTrip } from './docx-roundtrip';
import { exportBasicDocx, exportCoreProjectJson, exportCoreProjectZip, importCoreProjectJson, importCoreProjectZip, plainTextToCanonical, type CoreProjectPackage } from './core-project-file';

const project: CoreProjectPackage = { schemaVersion: 2, exportedAt: '2026-07-14T00:00:00Z', work: { id: 'work', title: '墨界验收', kind: 'long', volumes: [{ id: 'volume', title: '第一卷', chapters: [{ id: 'chapter', title: '第一章', plainText: '第一段\n第二段', canonicalContent: plainTextToCanonical('第一段\n第二段') }] }] } };

describe('core project files', () => {
  it('round-trips schema v2 through JSON and a bounded ZIP package', async () => {
    expect(importCoreProjectJson(exportCoreProjectJson(project))).toEqual(project);
    await expect(importCoreProjectZip(exportCoreProjectZip(project))).resolves.toEqual(project);
  });

  it('exports a readable basic DOCX without losing the chapter text', async () => {
    const session = await importDocxRoundTrip(exportBasicDocx(project.work));
    expect(session.paragraphs.map((item) => item.text)).toEqual(expect.arrayContaining(['墨界验收', '第一章', '第一段', '第二段']));
  });

  it('rejects malformed canonical documents before importing them', () => {
    const malformed = structuredClone(project) as unknown as { work: { volumes: Array<{ chapters: Array<{ canonicalContent: { schemaVersion?: number } }> }> } };
    delete malformed.work.volumes[0]!.chapters[0]!.canonicalContent.schemaVersion;
    expect(() => importCoreProjectJson(JSON.stringify(malformed))).toThrow('章节标准正文');
  });
});
