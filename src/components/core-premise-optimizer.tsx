'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createCoreProjectEntity, listCoreProjectEntities, type CoreWorkDirectory } from '../lib/core-api';
import { deleteCoreAiProvider, getCoreAiProvider, optimizeCorePremise, saveCoreAiProvider, type CoreAiProviderConfig } from '../lib/core-operations-api';
import { HelpTip } from './help-tip';
import { LocalContentImporter } from './local-content-importer';

type ProviderForm = { provider: 'deepseek' | 'openai-compatible'; label: string; baseUrl: string; model: string; apiKey: string };
const DEFAULT_FORM: ProviderForm = { provider: 'deepseek', label: 'DeepSeek 核心设定导师', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro', apiKey: '' };

function message(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  const labels: Record<string, string> = {
    AI_CONFIG_KEY_NOT_CONFIGURED: '服务器尚未配置模型密钥加密主密钥，已安全停止，未保存明文。',
    AI_PROVIDER_NOT_CONFIGURED: '请先保存模型服务配置。',
    AI_PROVIDER_TIMEOUT: '模型在 45 秒内没有完成，请稍后重试或精简输入。',
    AI_HOST_NOT_ALLOWED: '该模型域名不在服务器允许清单中，请由站点所有者加入 MOJIE_AI_ALLOWED_HOSTS。',
    AI_INPUT_TOO_SHORT: '请至少提供一段具体设定、世界观或大纲，再启动优化。'
  };
  return Object.entries(labels).find(([code]) => value.includes(code))?.[1] ?? value;
}

function entityText(entity: Awaited<ReturnType<typeof listCoreProjectEntities>>[number]): string {
  const fields = Object.entries(entity.fields).flatMap(([key, value]) => value == null || value === false ? [] : [`${key}：${Array.isArray(value) ? value.join('、') : String(value)}`]);
  return [`【${entity.kind}｜${entity.title}】`, entity.summary, ...fields].filter(Boolean).join('\n');
}

export function CorePremiseOptimizer({ directory, csrf }: { directory: CoreWorkDirectory; csrf: string }) {
  const [config, setConfig] = useState<CoreAiProviderConfig | null>(null);
  const [form, setForm] = useState<ProviderForm>(DEFAULT_FORM);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('正在检查模型配置…');
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const canEdit = directory.role === 'WORK_OWNER' || directory.role === 'EDITOR';
  const deepseek = form.provider === 'deepseek';
  const sourceLength = useMemo(() => [...input].length, [input]);

  useEffect(() => {
    const controller = new AbortController(); controllerRef.current = controller;
    void getCoreAiProvider(controller.signal).then((result) => {
      setConfig(result.config);
      if (result.config) setForm({ provider: result.config.provider, label: result.config.label, baseUrl: result.config.baseUrl, model: result.config.model, apiKey: '' });
      setStatus(result.config ? `已配置 ${result.config.label}；已保存密钥不会回传浏览器。` : result.keyStorageReady ? '尚未配置模型服务。' : '服务器尚未配置模型密钥加密主密钥。');
    }).catch((error) => { if (!controller.signal.aborted) setStatus(message(error)); });
    return () => controller.abort();
  }, []);

  async function saveProvider() {
    setBusy(true); setStatus('正在加密保存模型配置…');
    try {
      await saveCoreAiProvider(form, csrf);
      const result = await getCoreAiProvider(); setConfig(result.config); setForm((current) => ({ ...current, apiKey: '' }));
      setStatus('模型配置已在服务端加密保存；浏览器未保留密钥。');
    } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }

  async function removeProvider() {
    if (!window.confirm('删除已保存的模型配置和密钥？')) return;
    setBusy(true);
    try { await deleteCoreAiProvider(csrf); setConfig(null); setForm(DEFAULT_FORM); setStatus('模型配置已删除。'); }
    catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }

  async function collectWorkContext() {
    setBusy(true); setStatus('正在汇总当前作品的大纲、世界观和人物设定…');
    try {
      const entities = (await listCoreProjectEntities(directory.id)).filter((entity) => ['outline', 'chapter-plan', 'world', 'character', 'faction', 'location'].includes(entity.kind));
      const assembled = [`作品：${directory.title}`, ...entities.slice(0, 120).map(entityText)].join('\n\n').slice(0, 58_000);
      if (!entities.length) throw new Error('当前作品还没有可汇总的大纲或世界设定；可以直接输入或导入本地文件。');
      setInput(assembled); setStatus(`已汇总 ${entities.length} 条作品设定，请先检查再发送。`);
    } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }

  async function optimize() {
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true); setStatus('模型正在按“关系重置”流程分析；不会改写正文…'); setOutput('');
    try {
      const result = await optimizeCorePremise({ workId: directory.id, input }, csrf, controller.signal);
      setOutput(result.output); setStatus(`已由 ${result.model} 生成建议。请人工判断后再保存或采用。`);
    } catch (error) { if (!controller.signal.aborted) setStatus(message(error)); }
    finally { setBusy(false); }
  }

  async function saveAsWorldSetting() {
    if (!output.trim()) return;
    setBusy(true);
    try {
      await createCoreProjectEntity(directory.id, { kind: 'world', title: '核心设定优化方案', summary: output.slice(0, 1_000), fields: { category: '核心设定', rule: output, source: '核心设定优化器建议，已由作者选择保存', generatedAt: new Date().toISOString() } }, csrf);
      setStatus('已另存为一条“世界观 / 核心设定”，没有覆盖原设定或正文。');
    } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }

  return <section className="premise-optimizer">
    <header><div><p className="eyebrow">可选模型辅助</p><h2>核心设定优化</h2><p>只在你提供具体设定后，从“关系重置”角度检查看点、爽点、热点和长线冲突。</p></div><HelpTip text="模型只返回建议，不会自动覆盖正文。API 密钥只在服务端加密保存；输入会发送给你选择的模型服务商，请按其隐私条款决定是否使用。" /></header>
    <details className="ai-provider-config" open={!config}>
      <summary>模型服务配置 {config ? `· ${config.label}` : '· 未配置'}</summary>
      <div className="ai-config-grid">
        <label><span>服务类型</span><select disabled={busy} onChange={(event) => { const provider = event.target.value as ProviderForm['provider']; setForm((current) => ({ ...current, provider, baseUrl: provider === 'deepseek' ? 'https://api.deepseek.com' : current.baseUrl, model: provider === 'deepseek' ? 'deepseek-v4-pro' : current.model })); }} value={form.provider}><option value="deepseek">DeepSeek</option><option value="openai-compatible">其他 OpenAI 兼容服务</option></select></label>
        <label><span>配置名称</span><input disabled={busy} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} value={form.label} /></label>
        <label><span>API 基础地址</span><input disabled={busy || deepseek} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} value={form.baseUrl} /></label>
        <label><span>模型</span>{deepseek ? <select disabled={busy} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} value={form.model}><option value="deepseek-v4-pro">deepseek-v4-pro（深度优化）</option><option value="deepseek-v4-flash">deepseek-v4-flash（快速）</option></select> : <input disabled={busy} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} value={form.model} />}</label>
        <label className="ai-key-field"><span>API 密钥 {config ? '（留空则沿用已保存密钥）' : ''}</span><input autoComplete="new-password" disabled={busy} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="仅本次提交到服务端加密" type="password" value={form.apiKey} /></label>
        <div className="ai-config-actions"><button disabled={busy || (!config && !form.apiKey.trim())} onClick={() => void saveProvider()} type="button">加密保存配置</button>{config ? <button disabled={busy} onClick={() => void removeProvider()} type="button">删除配置</button> : null}</div>
      </div>
    </details>
    <div className="premise-source-heading"><div><strong>作者已有设定 / 世界观 / 大纲</strong><span>{sourceLength.toLocaleString('zh-CN')} / 60,000 字符</span></div><div><LocalContentImporter compact disabled={busy} label="导入本地内容" onApply={(text, mode) => setInput((current) => mode === 'append' && current.trim() ? `${current.replace(/\s+$/u, '')}\n\n${text}` : text)} /><button disabled={busy} onClick={() => void collectWorkContext()} type="button">汇总当前作品设定</button></div></div>
    <textarea aria-label="待优化的核心设定" disabled={busy} maxLength={60_000} onChange={(event) => setInput(event.target.value)} placeholder="必须提供具体内容，例如：主角是谁、世界规则怎样运转、目前的大纲与核心矛盾是什么。" value={input} />
    <div className="premise-run-actions"><button disabled={busy || !config || input.trim().length < 20} onClick={() => void optimize()} type="button">按关系重置法优化</button>{busy ? <button onClick={() => controllerRef.current?.abort()} type="button">取消本次请求</button> : null}</div>
    {output ? <article className="premise-output"><header><strong>优化建议（不会自动采用）</strong><div><button onClick={() => void navigator.clipboard.writeText(output)} type="button">复制</button>{canEdit ? <button disabled={busy} onClick={() => void saveAsWorldSetting()} type="button">另存为核心设定</button> : null}</div></header><div>{output}</div></article> : null}
    <p className="visual-status" role="status">{status}</p>
  </section>;
}
