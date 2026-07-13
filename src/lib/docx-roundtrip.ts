export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

export type DocxParagraph = {
  index: number;
  text: string;
};

export type DocxRoundTripSession = {
  originalBytes: Uint8Array;
  originalHash: string;
  entries: Map<string, Uint8Array>;
  paragraphs: DocxParagraph[];
  documentXml: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('当前运行环境不支持解压DOCX。');
  const stream = new Blob([toArrayBuffer(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export type ZipReadOptions = { maximumArchiveBytes?: number; maximumEntries?: number; maximumUncompressedBytes?: number };

export async function readZipEntries(bytes: Uint8Array, options: ZipReadOptions = {}): Promise<Map<string, Uint8Array>> {
  const maximumArchiveBytes = options.maximumArchiveBytes ?? 100 * 1024 * 1024;
  const maximumEntries = options.maximumEntries ?? 4_096;
  const maximumUncompressedBytes = options.maximumUncompressedBytes ?? 250 * 1024 * 1024;
  if (bytes.byteLength > maximumArchiveBytes) throw new Error('压缩包超过允许的文件大小。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readU32(view, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('DOCX压缩包结构无效。');
  const entryCount = readU16(view, eocdOffset + 10);
  if (entryCount > maximumEntries) throw new Error('压缩包文件项过多。');
  const centralOffset = readU32(view, eocdOffset + 16);
  const entries = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor < 0 || cursor + 46 > bytes.byteLength) throw new Error('DOCX中央目录越界。');
    if (readU32(view, cursor) !== 0x02014b50) throw new Error('DOCX中央目录损坏。');
    const flags = readU16(view, cursor + 8);
    if ((flags & 0x0001) !== 0) throw new Error('不支持加密的DOCX压缩包。');
    const method = readU16(view, cursor + 10);
    const compressedSize = readU32(view, cursor + 20);
    const uncompressedSize = readU32(view, cursor + 24);
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > maximumUncompressedBytes) throw new Error('压缩包解压后体积超过安全上限。');
    const fileNameLength = readU16(view, cursor + 28);
    const extraLength = readU16(view, cursor + 30);
    const commentLength = readU16(view, cursor + 32);
    const localOffset = readU32(view, cursor + 42);
    if (cursor + 46 + fileNameLength + extraLength + commentLength > bytes.byteLength) throw new Error('DOCX中央目录文件项越界。');
    const name = textDecoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));

    if (localOffset + 30 > bytes.byteLength) throw new Error(`DOCX文件项“${name}”位置越界。`);
    if (readU32(view, localOffset) !== 0x04034b50) throw new Error(`DOCX文件项“${name}”损坏。`);
    const localNameLength = readU16(view, localOffset + 26);
    const localExtraLength = readU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart < 0 || dataStart + compressedSize > bytes.byteLength) throw new Error(`DOCX文件项“${name}”内容越界。`);
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (method === 0) data = compressed;
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error(`DOCX包含暂不支持的压缩方式：${method}`);
    if (data.byteLength !== uncompressedSize) throw new Error(`DOCX文件项“${name}”解压长度不符。`);
    if (entries.has(name)) throw new Error(`DOCX包含重复文件项：“${name}”。`);
    entries.set(name, data);
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.byteLength + data.byteLength);
    const localView = new DataView(local.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, 0x0800);
    writeU16(localView, 8, 0);
    writeU16(localView, 10, 0);
    writeU16(localView, 12, 0);
    writeU32(localView, 14, crc);
    writeU32(localView, 18, data.byteLength);
    writeU32(localView, 22, data.byteLength);
    writeU16(localView, 26, name.byteLength);
    writeU16(localView, 28, 0);
    local.set(name, 30);
    local.set(data, 30 + name.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, 0x0800);
    writeU16(centralView, 10, 0);
    writeU16(centralView, 12, 0);
    writeU16(centralView, 14, 0);
    writeU32(centralView, 16, crc);
    writeU32(centralView, 20, data.byteLength);
    writeU32(centralView, 24, data.byteLength);
    writeU16(centralView, 28, name.byteLength);
    writeU16(centralView, 30, 0);
    writeU16(centralView, 32, 0);
    writeU16(centralView, 34, 0);
    writeU16(centralView, 36, 0);
    writeU32(centralView, 38, 0);
    writeU32(centralView, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.byteLength;
  }

  const centralDirectory = concatBytes(centralParts);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeU32(eocdView, 0, 0x06054b50);
  writeU16(eocdView, 4, 0);
  writeU16(eocdView, 6, 0);
  writeU16(eocdView, 8, entries.length);
  writeU16(eocdView, 10, entries.length);
  writeU32(eocdView, 12, centralDirectory.byteLength);
  writeU32(eocdView, 16, localOffset);
  writeU16(eocdView, 20, 0);
  return concatBytes([...localParts, centralDirectory, eocd]);
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function encodeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function extractParagraphs(documentXml: string): DocxParagraph[] {
  const paragraphs: DocxParagraph[] = [];
  const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gu;
  let index = 0;
  for (const match of documentXml.matchAll(paragraphPattern)) {
    const text = [...match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
      .map((textMatch) => decodeXml(textMatch[1] ?? ''))
      .join('');
    paragraphs.push({ index, text });
    index += 1;
  }
  return paragraphs;
}

function replaceParagraphText(paragraphXml: string, nextText: string): string {
  const textPattern = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/gu;
  const nodes = [...paragraphXml.matchAll(textPattern)];
  if (!nodes.length) {
    return paragraphXml.replace(/<\/w:p>$/u, `<w:r><w:t xml:space="preserve">${encodeXml(nextText)}</w:t></w:r></w:p>`);
  }

  let cursor = 0;
  let nodeIndex = 0;
  return paragraphXml.replace(textPattern, (_full, attributes: string | undefined, encodedOriginal: string | undefined) => {
    const originalLength = decodeXml(encodedOriginal ?? '').length;
    const isLast = nodeIndex === nodes.length - 1;
    const segment = isLast ? nextText.slice(cursor) : nextText.slice(cursor, cursor + originalLength);
    cursor += segment.length;
    nodeIndex += 1;
    const needsSpace = /^\s|\s$/u.test(segment);
    const existing = attributes ?? '';
    const finalAttributes = needsSpace && !/xml:space=/u.test(existing) ? `${existing} xml:space="preserve"` : existing;
    return `<w:t${finalAttributes}>${encodeXml(segment)}</w:t>`;
  });
}

function updateDocumentXml(documentXml: string, paragraphTexts: string[]): string {
  let index = 0;
  return documentXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gu, (paragraph) => {
    const text = paragraphTexts[index] ?? '';
    index += 1;
    return replaceParagraphText(paragraph, text);
  });
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function importDocxRoundTrip(input: Uint8Array | ArrayBuffer): Promise<DocxRoundTripSession> {
  const originalBytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input.slice(0));
  const entries = await readZipEntries(originalBytes);
  const documentBytes = entries.get('word/document.xml');
  if (!documentBytes) throw new Error('DOCX缺少word/document.xml。');
  const documentXml = textDecoder.decode(documentBytes);
  const paragraphs = extractParagraphs(documentXml);
  return {
    originalBytes,
    originalHash: await sha256Hex(originalBytes),
    entries,
    paragraphs,
    documentXml
  };
}

export async function exportDocxRoundTrip(session: DocxRoundTripSession, paragraphTexts: string[]): Promise<Uint8Array> {
  if (paragraphTexts.length !== session.paragraphs.length) {
    throw new Error('原格式模式要求段落数量保持不变；请使用普通DOCX导出处理增删段落。');
  }
  const unchanged = paragraphTexts.every((text, index) => text === session.paragraphs[index]?.text);
  if (unchanged) return new Uint8Array(session.originalBytes);
  const updatedEntries = [...session.entries.entries()].map(([name, data]) => ({
    name,
    data: name === 'word/document.xml'
      ? textEncoder.encode(updateDocumentXml(session.documentXml, paragraphTexts))
      : new Uint8Array(data)
  }));
  return createStoredZip(updatedEntries);
}
