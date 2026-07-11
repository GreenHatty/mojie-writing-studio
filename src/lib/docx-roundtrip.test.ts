import { describe, expect, it } from 'vitest';
import {
  createStoredZip,
  exportDocxRoundTrip,
  importDocxRoundTrip,
  sha256Hex
} from './docx-roundtrip';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sampleDocx(): Uint8Array {
  return createStoredZip([
    {
      name: '[Content_Types].xml',
      data: encoder.encode('<Types><Default Extension="png" ContentType="image/png"/></Types>')
    },
    {
      name: 'word/document.xml',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>第一章</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>原始正文</w:t></w:r></w:p>' +
        '</w:body></w:document>'
      )
    },
    { name: 'word/header1.xml', data: encoder.encode('<w:hdr><w:t>固定页眉</w:t></w:hdr>') },
    { name: 'word/media/image1.png', data: new Uint8Array([1, 2, 3, 4, 5]) }
  ]);
}

function mixedRunDocx(): Uint8Array {
  return createStoredZip([
    {
      name: '[Content_Types].xml',
      data: encoder.encode('<Types/>')
    },
    {
      name: 'word/document.xml',
      data: encoder.encode(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>粗体</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>斜体</w:t></w:r></w:p>' +
        '</w:body></w:document>'
      )
    }
  ]);
}

describe('DOCX round trip', () => {
  it('returns the exact original bytes when content is not edited', async () => {
    const original = sampleDocx();
    const session = await importDocxRoundTrip(original);
    const exported = await exportDocxRoundTrip(session, session.paragraphs.map((item) => item.text));

    expect(await sha256Hex(exported)).toBe(await sha256Hex(original));
    expect(exported).toEqual(original);
  });

  it('changes paragraph text while preserving styles, headers and media', async () => {
    const original = sampleDocx();
    const session = await importDocxRoundTrip(original);
    const exported = await exportDocxRoundTrip(session, ['新标题', '新正文']);
    const reparsed = await importDocxRoundTrip(exported);

    expect(reparsed.paragraphs.map((item) => item.text)).toEqual(['新标题', '新正文']);
    expect(decoder.decode(reparsed.entries.get('word/document.xml'))).toContain('w:val="Heading1"');
    expect(decoder.decode(reparsed.entries.get('word/document.xml'))).toContain('<w:b/>');
    expect(decoder.decode(reparsed.entries.get('word/header1.xml'))).toContain('固定页眉');
    expect(reparsed.entries.get('word/media/image1.png')).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('keeps existing mixed run formatting nodes while redistributing edited text', async () => {
    const session = await importDocxRoundTrip(mixedRunDocx());
    const exported = await exportDocxRoundTrip(session, ['新粗新斜']);
    const xml = decoder.decode((await importDocxRoundTrip(exported)).entries.get('word/document.xml'));

    expect(xml).toContain('<w:rPr><w:b/></w:rPr><w:t>新粗</w:t>');
    expect(xml).toContain('<w:rPr><w:i/></w:rPr><w:t>新斜</w:t>');
  });

  it('requires the same paragraph count in format-preserving mode', async () => {
    const session = await importDocxRoundTrip(sampleDocx());
    await expect(exportDocxRoundTrip(session, ['只有一段'])).rejects.toThrow(/段落数量/u);
  });
});
