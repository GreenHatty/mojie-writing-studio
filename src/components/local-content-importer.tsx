'use client';

import { useRef, useState } from 'react';
import { readLocalContentFile, type ImportedLocalContent } from '../lib/local-content-import';
import { HelpTip } from './help-tip';

export type ImportApplyMode = 'append' | 'replace';

export function LocalContentImporter({
  disabled,
  onApply,
  compact = false,
  label = '导入本地文件'
}: {
  disabled?: boolean;
  onApply(text: string, mode: ImportApplyMode, fileName: string): void | Promise<void>;
  compact?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportedLocalContent | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setStatus('正在安全读取文件…');
    try {
      const imported = await readLocalContentFile(file);
      if (!imported.text.trim()) throw new Error('文件中没有可导入的文字。');
      setPreview(imported);
      setStatus('');
    } catch (error) {
      setPreview(null);
      setStatus(error instanceof Error ? error.message : '文件读取失败。');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function apply(mode: ImportApplyMode) {
    if (!preview) return;
    setBusy(true);
    try {
      await onApply(preview.text, mode, preview.fileName);
      setPreview(null);
      setStatus(`已${mode === 'append' ? '追加' : '替换'}“${preview.fileName}”内容。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入内容应用失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`local-content-importer ${compact ? 'is-compact' : ''}`}>
      <input
        accept="text/plain,.md,.markdown,.html,.htm,.docx,text/markdown,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(event) => void choose(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />
      <button disabled={disabled || busy} onClick={() => inputRef.current?.click()} title="选择 TXT、Markdown、HTML 或 DOCX，将文字追加或替换到当前编辑区" type="button">
        {busy ? '读取中…' : label}
      </button>
      <HelpTip text="文件只在当前浏览器中解析。确认预览后可追加或替换；不会自动覆盖当前内容。支持 TXT、Markdown、HTML 和 DOCX。" />
      {preview ? (
        <span className="local-import-preview" role="dialog" aria-label="导入内容预览">
          <strong>{preview.fileName}</strong>
          <span>{preview.text.slice(0, 180)}{preview.text.length > 180 ? '…' : ''}</span>
          <span className="local-import-actions">
            <button disabled={busy} onClick={() => void apply('append')} type="button">追加</button>
            <button disabled={busy} onClick={() => void apply('replace')} type="button">替换</button>
            <button disabled={busy} onClick={() => setPreview(null)} type="button">取消</button>
          </span>
        </span>
      ) : null}
      {status ? <small className="local-import-status" role="status">{status}</small> : null}
    </span>
  );
}
