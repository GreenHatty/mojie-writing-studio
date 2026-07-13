'use client';

import { useEffect, useState } from 'react';
import {
  exportDocxRoundTrip,
  importDocxRoundTrip,
  sha256Hex,
  toArrayBuffer,
  type DocxRoundTripSession
} from '../lib/docx-roundtrip';
import {
  deleteLocalDocxAsset,
  listLocalDocxAssets,
  saveLocalDocxAsset,
  type LocalDocxAsset
} from '../lib/local-docx-vault';
import { apiRequest } from '../lib/api-client';

type DocxRoundTripPanelProps = {
  workId: string;
  userId?: string;
};

type SessionResponse = {
  authenticated: boolean;
  user: { id: string } | null;
};

function downloadBytes(bytes: Uint8Array | ArrayBuffer, fileName: string): void {
  const payload = bytes instanceof Uint8Array ? toArrayBuffer(bytes) : bytes.slice(0);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DocxRoundTripPanel({ workId, userId: suppliedUserId }: DocxRoundTripPanelProps) {
  const [session, setSession] = useState<DocxRoundTripSession | null>(null);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [fileName, setFileName] = useState('document.docx');
  const [editedHash, setEditedHash] = useState('');
  const [localAssetId, setLocalAssetId] = useState('');
  const [userId, setUserId] = useState(suppliedUserId ?? '');
  const [savedAssets, setSavedAssets] = useState<LocalDocxAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function refreshAssets(nextUserId = userId) {
    if (!nextUserId) return;
    setSavedAssets(await listLocalDocxAssets(nextUserId, workId));
  }

  useEffect(() => {
    if (suppliedUserId) {
      setUserId(suppliedUserId);
      void refreshAssets(suppliedUserId);
      return;
    }
    const controller = new AbortController();
    void apiRequest<SessionResponse>('/api/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(async (value) => {
        const nextUserId = value.user?.id || '';
        if (controller.signal.aborted) return;
        setUserId(nextUserId);
        if (nextUserId) setSavedAssets(await listLocalDocxAssets(nextUserId, workId));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [suppliedUserId, workId]);

  async function openFile(file: File) {
    setBusy(true);
    setStatus('');
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('DOCX文件不能超过100MB。');
      const imported = await importDocxRoundTrip(await file.arrayBuffer());
      setSession(imported);
      setParagraphs(imported.paragraphs.map((paragraph) => paragraph.text));
      setFileName(file.name);
      setLocalAssetId('');
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

  async function loadSavedAsset(asset: LocalDocxAsset) {
    setBusy(true);
    try {
      const original = await importDocxRoundTrip(asset.originalBytes);
      const current = asset.editedBytes ? await importDocxRoundTrip(asset.editedBytes) : original;
      if (current.paragraphs.length !== original.paragraphs.length) throw new Error('本地编辑件段落结构与原件不一致，无法进入原格式模式。');
      setSession(original);
      setParagraphs(current.paragraphs.map((paragraph) => paragraph.text));
      setFileName(asset.fileName);
      setLocalAssetId(asset.id);
      setEditedHash(asset.editedHash || '');
      setStatus('已从当前账号的本机 DOCX 文件库载入。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '本地 DOCX 载入失败。');
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

  async function saveOriginalLocally() {
    if (!session) return;
    if (!userId) {
      setStatus('无法确认当前账号，暂不能写入账号隔离的本机文件库。');
      return;
    }
    setBusy(true);
    try {
      const asset = await saveLocalDocxAsset({
        id: localAssetId || undefined,
        userId,
        workId,
        fileName,
        originalBytes: toArrayBuffer(session.originalBytes),
        originalHash: session.originalHash,
        paragraphCount: paragraphs.length
      });
      setLocalAssetId(asset.id);
      await refreshAssets(userId);
      setStatus('DOCX原件已保存到当前浏览器的账号隔离文件库，不会上传到Cloudflare。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '本机保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedLocally() {
    if (!session || !userId) {
      setStatus('请先载入文件并确认登录状态。');
      return;
    }
    setBusy(true);
    try {
      const bytes = await buildEdited();
      const hash = await sha256Hex(bytes);
      const asset = await saveLocalDocxAsset({
        id: localAssetId || undefined,
        userId,
        workId,
        fileName,
        originalBytes: toArrayBuffer(session.originalBytes),
        editedBytes: toArrayBuffer(bytes),
        originalHash: session.originalHash,
        editedHash: hash,
        paragraphCount: paragraphs.length
      });
      setLocalAssetId(asset.id);
      setEditedHash(hash);
      await refreshAssets(userId);
      setStatus('编辑件已保存到当前浏览器的账号隔离文件库。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '本机编辑件保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function removeSavedAsset(asset: LocalDocxAsset) {
    await deleteLocalDocxAsset(userId, asset.id);
    if (localAssetId === asset.id) setLocalAssetId('');
    await refreshAssets(userId);
    setStatus('本机 DOCX 记录已删除。');
  }

  return (
    <details className="docx-roundtrip-panel">
      <summary>DOCX 原格式导入、导出与本机文件库</summary>
      <p>DOCX 默认只保存在当前浏览器的 IndexedDB，不使用 R2，也不会产生 Cloudflare 对象存储费用。请定期下载原件和编辑件到电脑或另行备份。</p>
      <p>未修改时按原始字节导出；原格式编辑模式要求段落数量不变，只替换正文文字，从而保留现有段落样式、图片、页眉页脚、脚注和关系文件。</p>
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
            <button disabled={busy} onClick={() => void saveOriginalLocally()} type="button">保存原件到本机库</button>
            <button disabled={busy} onClick={() => void saveEditedLocally()} type="button">保存编辑件到本机库</button>
          </div>
        </div>
      ) : null}
      {savedAssets.length ? (
        <section className="docx-local-vault">
          <h3>当前账号 · 当前作品的本机 DOCX</h3>
          <ul className="backup-policy-list">
            {savedAssets.map((asset) => (
              <li key={asset.id}>
                <div><strong>{asset.fileName}</strong><span>{asset.editedHash ? '含编辑件' : '仅原件'} · {new Date(asset.updatedAt).toLocaleString('zh-CN')}</span><small>原件哈希：{asset.originalHash}</small></div>
                <div className="docx-actions">
                  <button disabled={busy} onClick={() => void loadSavedAsset(asset)} type="button">载入</button>
                  <button onClick={() => downloadBytes(asset.originalBytes, asset.fileName)} type="button">下载原件</button>
                  {asset.editedBytes ? <button onClick={() => downloadBytes(asset.editedBytes!, asset.fileName.replace(/\.docx$/iu, '') + '-墨界编辑.docx')} type="button">下载编辑件</button> : null}
                  <button disabled={busy} onClick={() => void removeSavedAsset(asset)} type="button">删除</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="docx-status" role="status">{status}</p>
    </details>
  );
}
