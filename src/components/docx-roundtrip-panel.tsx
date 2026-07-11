'use client';

import { useState } from 'react';
import { apiRequest } from '../lib/api-client';
import {
  exportDocxRoundTrip,
  importDocxRoundTrip,
  sha256Hex,
  type DocxRoundTripSession
} from '../lib/docx-roundtrip';

type DocxRoundTripPanelProps = {
  workId: string;
};

function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DocxRoundTripPanel({ workId }: DocxRoundTripPanelProps) {
  const [session, setSession] = useState<DocxRoundTripSession | null>(null);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [fileName, setFileName] = useState('document.docx');
  const [assetId, setAssetId] = useState('');
  const [editedHash, setEditedHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function openFile(file: File) {
    setBusy(true);
    setStatus('');
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('DOCX文件不能超过100MB。');
      const imported = await importDocxRoundTrip(await file.arrayBuffer());
      setSession(imported);
      setParagraphs(imported.paragraphs.map((paragraph) => paragraph.text));
      setFileName(file.name);
      setAssetId('');
      setEditedHash('');
      setStatus(`已读取 ${imported.paragraphs.length} 个正文段落。未修改时导出与原文件哈希完全一致。`);
    } catch (error) {
      setSession(null);
      setParagraphs([]);
      setStatus(error instanceof Error ? error.message : 'DOCX读取失败。');
    } finally {
      setBusy(false);
    }
  }

  async function buildEdited(): Promise<Uint8Array> {
    if (!session) throw new Error('请先选择DOCX文件。');
    const bytes = await exportDocxRoundTrip(session, paragraphs);
    setEditedHash(await sha256Hex(bytes));
    return bytes;
  }

  async function exportOriginal() {
    if (!session) return;
    downloadBytes(session.originalBytes, fileName);
    setStatus('已导出字节级原始DOCX。');
  }

  async function exportEdited() {
    setBusy(true);
    try {
      const bytes = await buildEdited();
      downloadBytes(bytes, fileName.replace(/\.docx$/iu, '') + '-墨界编辑.docx');
      setStatus('已导出原格式DOCX。图片、样式、关系、页眉页脚等未编辑包部件保持原样。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'DOCX导出失败。');
    } finally {
      setBusy(false);
    }
  }

  async function uploadOriginal() {
    if (!session) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/docx/${encodeURIComponent(workId)}/original`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'x-file-name': encodeURIComponent(fileName),
          'x-paragraph-count': String(paragraphs.length)
        },
        body: session.originalBytes.buffer.slice(session.originalBytes.byteOffset, session.originalBytes.byteOffset + session.originalBytes.byteLength)
      });
      const payload = await response.json() as { asset?: { id: string }; error?: { message: string } };
      if (!response.ok || !payload.asset) throw new Error(payload.error?.message || '原件上传失败。');
      setAssetId(payload.asset.id);
      setStatus('原始DOCX已加密权限隔离后保存到对象存储。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '原件上传失败。');
    } finally {
      setBusy(false);
    }
  }

  async function uploadEdited() {
    if (!assetId) {
      setStatus('请先上传原始DOCX。');
      return;
    }
    setBusy(true);
    try {
      const bytes = await buildEdited();
      const response = await fetch(`/api/docx/assets/${encodeURIComponent(assetId)}/edited`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      });
      const payload = await response.json() as { editedHash?: string; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message || '编辑件上传失败。');
      setEditedHash(payload.editedHash || '');
      setStatus('编辑后的DOCX已保存，可由有权限的作品成员下载。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '编辑件上传失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="docx-roundtrip-panel">
      <summary>DOCX 原格式导入与导出</summary>
      <p>原件始终保留。未修改时按原始字节导出；原格式编辑模式要求段落数量不变，只替换正文文字，从而保留现有段落样式、图片、页眉页脚、脚注和关系文件。</p>
      <label className="file-picker">
        <span>选择 DOCX 文件</span>
        <input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openFile(file);
          event.target.value = '';
        }} type="file" />
      </label>
      {session ? (
        <div className="docx-workspace">
          <div className="docx-integrity">
            <strong>{fileName}</strong>
            <span>原始 SHA-256：{session.originalHash}</span>
            {editedHash ? <span>编辑件 SHA-256：{editedHash}</span> : null}
          </div>
          <div className="docx-paragraphs">
            {paragraphs.map((paragraph, index) => (
              <label key={index}>
                <span>段落 {index + 1}</span>
                <textarea onChange={(event) => setParagraphs((current) => current.map((value, currentIndex) => currentIndex === index ? event.target.value : value))} value={paragraph} />
              </label>
            ))}
          </div>
          <div className="docx-actions">
            <button disabled={busy} onClick={() => void exportOriginal()} type="button">导出原始文件</button>
            <button disabled={busy} onClick={() => void exportEdited()} type="button">导出原格式编辑件</button>
            <button disabled={busy} onClick={() => void uploadOriginal()} type="button">保存原件到云端</button>
            <button disabled={busy || !assetId} onClick={() => void uploadEdited()} type="button">保存编辑件到云端</button>
            {assetId ? <a href={`/api/docx/assets/${encodeURIComponent(assetId)}/edited`}>下载云端编辑件</a> : null}
          </div>
        </div>
      ) : null}
      <p className="docx-status" role="status">{status}</p>
    </details>
  );
}
