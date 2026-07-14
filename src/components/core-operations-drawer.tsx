'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoreChapter, CoreUser, CoreWorkDirectory } from '../lib/core-api';
import {
  cancelCoreRankingTask,
  createCoreBackupTarget,
  createCoreRankingSource,
  createCoreRankingTask,
  deleteCoreBackupObject,
  disableCoreBackupTarget,
  downloadCoreBackupObject,
  getCoreRankingTask,
  importCoreRanking,
  listCoreBackups,
  listCorePublicationRecords,
  listCoreRankingSources,
  recordCorePublication,
  runCoreBackup,
  type CoreBackupObject,
  type CoreBackupRun,
  type CoreBackupTarget,
  type CorePublicationRecord,
  type CoreRankingItem,
  type CoreRankingSource,
  type CoreRankingTask
} from '../lib/core-operations-api';
import { analyzeSellingPoints, type RankingItem } from '../lib/rankings';
import { prepareChapterForPublication, type PublicationPlatform } from '../lib/publication';

type Tab = 'publication' | 'rankings' | 'backups';
const platformLabel = { qidian: '起点中文网', fanqie: '番茄免费小说' } as const;
const authorPortal = { qidian: 'https://write.qq.com/', fanqie: 'https://fanqienovel.com/writer/zone/' } as const;

function errorText(error: unknown): string { return error instanceof Error ? error.message : '操作未完成。'; }
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function CoreOperationsDrawer({ user, csrf, directory, chapter, text, onClose }: { user: CoreUser; csrf: string; directory: CoreWorkDirectory; chapter: CoreChapter; text: string; onClose(): void }) {
  const [tab, setTab] = useState<Tab>('publication');
  return <section aria-label="平台运营与外部备份" aria-modal="true" className="operations-drawer" role="dialog">
    <header><div><p className="eyebrow">按需加载的辅助模块</p><h2>平台运营与备份</h2><p>这些功能与正文输入、切章和本地保存完全隔离；关闭面板不会中断写作。</p></div><button onClick={onClose} type="button">关闭</button></header>
    <nav aria-label="运营功能"><button aria-current={tab === 'publication'} onClick={() => setTab('publication')} type="button">发布准备</button><button aria-current={tab === 'rankings'} onClick={() => setTab('rankings')} type="button">平台榜单</button><button aria-current={tab === 'backups'} onClick={() => setTab('backups')} type="button">外部备份</button></nav>
    <div className="operations-drawer-body">
      {tab === 'publication' ? <PublicationWorkspace chapter={chapter} csrf={csrf} directory={directory} text={text} /> : null}
      {tab === 'rankings' ? <RankingWorkspace csrf={csrf} isOwner={user.platformRole === 'OWNER'} /> : null}
      {tab === 'backups' ? <BackupWorkspace csrf={csrf} directory={directory} /> : null}
    </div>
  </section>;
}

function PublicationWorkspace({ csrf, directory, chapter, text }: { csrf: string; directory: CoreWorkDirectory; chapter: CoreChapter; text: string }) {
  const [platform, setPlatform] = useState<PublicationPlatform>('qidian');
  const [platformChapterId, setPlatformChapterId] = useState('');
  const [records, setRecords] = useState<CorePublicationRecord[]>([]);
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const prepared = useMemo(() => prepareChapterForPublication({ platform, title: chapter.title, body: text, advisoryMinimumCharacters: 1_000 }), [chapter.title, platform, text]);

  useEffect(() => { const controller = new AbortController(); listCorePublicationRecords(directory.id, controller.signal).then(setRecords).catch((error) => { if (!controller.signal.aborted) setStatus(errorText(error)); }); return () => controller.abort(); }, [directory.id]);
  async function copy(value: string, label: string) { try { await navigator.clipboard.writeText(value); setStatus(`${label}已复制；最终发布仍需你在平台后台人工确认。`); } catch { setStatus('浏览器未允许剪贴板访问，请手动选择复制。'); } }
  async function record() {
    setBusy(true); setStatus('');
    try {
      await recordCorePublication({ workId: directory.id, chapterId: chapter.id, platform, platformChapterId }, csrf);
      setRecords(await listCorePublicationRecords(directory.id)); setPlatformChapterId(''); setStatus('已记录人工发布状态和当前正文修订号。');
    } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); }
  }
  return <section className="operations-section publication-workspace">
    <header><div><h3>发布前检查</h3><p>只生成可复制副本，不保存平台密码，不自动登录、处理验证码或点击发布。</p></div><label><span>平台</span><select onChange={(event) => setPlatform(event.target.value as PublicationPlatform)} value={platform}><option value="qidian">起点中文网</option><option value="fanqie">番茄免费小说</option></select></label></header>
    <div className="operations-summary"><strong>{prepared.characterCount} 字</strong><span>{prepared.blockingIssues.length ? `${prepared.blockingIssues.length} 项阻断问题` : '基本检查通过'} · {prepared.warnings.length} 项人工复核</span></div>
    {prepared.blockingIssues.length || prepared.warnings.length ? <ul className="operations-issues">{[...prepared.blockingIssues, ...prepared.warnings].map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : null}
    <div className="publication-copy-grid"><label><span>章节标题</span><textarea readOnly value={prepared.title} /></label><label><span>正文发布副本</span><textarea readOnly value={prepared.body} /></label></div>
    <div className="operations-actions"><button disabled={!prepared.title} onClick={() => void copy(prepared.title, '标题')} type="button">复制标题</button><button disabled={!prepared.body} onClick={() => void copy(prepared.body, '正文')} type="button">复制正文</button><a href={authorPortal[platform]} rel="noreferrer" target="_blank">打开{platformLabel[platform]}作者后台</a></div>
    <section className="publication-recording"><h4>人工发布记录</h4><label><span>平台章节号（可选）</span><input onChange={(event) => setPlatformChapterId(event.target.value)} value={platformChapterId} /></label><button disabled={busy || prepared.blockingIssues.length > 0} onClick={() => void record()} type="button">标记本章已由我发布</button>{records.length ? <ul>{records.slice(0, 20).map((item) => <li key={item.id}><strong>{item.title}</strong><span>{platformLabel[item.platform]} · 修订 {item.source_revision} · {new Date(item.published_at).toLocaleString('zh-CN')}</span></li>)}</ul> : <p>当前作品尚无人工发布记录。</p>}</section>
    <p role="status">{status}</p>
  </section>;
}

function asLegacyItem(source: CoreRankingSource, item: CoreRankingItem): RankingItem {
  return { id: `${source.id}:${item.rank}`, date: source.latestSnapshot?.rankingDate ?? '', platform: source.platform === 'qidian' ? '起点' : '番茄', listName: source.listName, category: source.category, rank: item.rank, title: item.title, author: item.author, tags: item.tags, status: '公开榜单', publicWordCount: 0, blurb: item.blurb, publicUrl: item.url, importedAt: source.lastSuccessAt ?? '', sourceStatus: 'manual-import' };
}

function RankingWorkspace({ csrf, isOwner }: { csrf: string; isOwner: boolean }) {
  const [sources, setSources] = useState<CoreRankingSource[]>([]); const [selectedSourceId, setSelectedSourceId] = useState(''); const [selectedRank, setSelectedRank] = useState(1);
  const [task, setTask] = useState<CoreRankingTask | null>(null); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const polling = useRef<AbortController | null>(null);
  const source = sources.find((item) => item.id === selectedSourceId) ?? sources[0]; const item = source?.latestSnapshot?.items.find((value) => value.rank === selectedRank) ?? source?.latestSnapshot?.items[0];
  const analysis = source && item ? analyzeSellingPoints(asLegacyItem(source, item)) : null;
  async function refresh(signal?: AbortSignal) { const next = await listCoreRankingSources(signal); setSources(next); setSelectedSourceId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? ''); }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal).catch((error) => { if (!controller.signal.aborted) setStatus(errorText(error)); }); return () => { controller.abort(); polling.current?.abort(); }; }, []);
  async function addSource(form: HTMLFormElement) {
    setBusy(true); try { const data = new FormData(form); await createCoreRankingSource({ platform: String(data.get('platform')) as 'qidian' | 'fanqie', listName: String(data.get('listName')), category: String(data.get('category')), sourceUrl: String(data.get('sourceUrl')), authorizationNote: String(data.get('authorizationNote')) }, csrf); form.reset(); await refresh(); setStatus('来源已保存；只有明确记录授权依据的公开 HTTPS 来源才可运行。'); } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); }
  }
  async function importFile(file: File) {
    if (!source) return; setBusy(true);
    try { if (file.size > 2 * 1024 * 1024) throw new Error('榜单文件不能超过 2MB。'); const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'; const result = await importCoreRanking({ sourceId: source.id, format, content: await file.text(), rankingDate: new Date().toISOString().slice(0, 10) }, csrf); await refresh(); setStatus(`已导入 ${result.itemCount} 条公开榜单记录。`); } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); }
  }
  async function runTask() {
    setBusy(true); setStatus(''); polling.current?.abort(); const controller = new AbortController(); polling.current = controller;
    try {
      const created = await createCoreRankingTask(source?.id ?? null, csrf, controller.signal); let current = await getCoreRankingTask(created.taskId, controller.signal); setTask(current);
      for (let attempt = 0; attempt < 45 && !['completed', 'partial', 'failed', 'cancelled'].includes(current.status); attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 1_000)); current = await getCoreRankingTask(created.taskId, controller.signal); setTask(current); }
      if (!['completed', 'partial', 'failed', 'cancelled'].includes(current.status)) setStatus('任务仍在后台队列中；关闭面板不会取消任务。'); else { setStatus(current.status === 'completed' ? '榜单快照更新完成。' : `任务结束：${current.status}${current.error_code ? `（${current.error_code}）` : ''}`); await refresh(); }
    } catch (error) { if (!controller.signal.aborted) setStatus(errorText(error)); } finally { setBusy(false); }
  }
  return <section className="operations-section ranking-workspace">
    <header><div><h3>公开平台榜单</h3><p>进入本标签后才读取来源和各来源最新一条成功快照；历史快照不会随工作台启动加载。</p></div>{source ? <label><span>来源</span><select onChange={(event) => { setSelectedSourceId(event.target.value); setSelectedRank(1); }} value={source.id}>{sources.map((item) => <option key={item.id} value={item.id}>{platformLabel[item.platform]} · {item.listName} · {item.category}</option>)}</select></label> : null}</header>
    {isOwner ? <details><summary>管理员来源与手动导入</summary><form onSubmit={(event) => { event.preventDefault(); void addSource(event.currentTarget); }}><label><span>平台</span><select name="platform"><option value="qidian">起点</option><option value="fanqie">番茄</option></select></label><label><span>榜单名称</span><input defaultValue="综合榜" name="listName" /></label><label><span>分类</span><input defaultValue="全部" name="category" /></label><label><span>公开 HTTPS 来源</span><input name="sourceUrl" placeholder="https://…" required /></label><label><span>授权依据说明</span><input name="authorizationNote" required /></label><button disabled={busy} type="submit">保存来源</button></form>{source ? <label className="ranking-import"><span>导入脱敏 CSV/JSON</span><input accept=".csv,.json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} type="file" /></label> : null}</details> : null}
    {source?.latestSnapshot ? <div className="ranking-snapshot"><div><h4>{source.latestSnapshot.rankingDate} · 前 {source.latestSnapshot.items.length}</h4><ol>{source.latestSnapshot.items.map((value) => <li key={`${value.rank}:${value.title}`}><button aria-current={value.rank === item?.rank} onClick={() => setSelectedRank(value.rank)} type="button"><strong>{value.rank}. {value.title}</strong><span>{value.author || '作者未公开'}{value.rankChange === null ? ' · 新上榜' : value.rankChange === 0 ? ' · 排名不变' : ` · ${value.rankChange > 0 ? '上升' : '下降'} ${Math.abs(value.rankChange)}`}</span></button></li>)}</ol></div>{analysis ? <article><h4>{item?.title} · 卖点结构推测</h4><dl><div><dt>书名结构</dt><dd>{analysis.titleStructure}</dd></div><div><dt>简介钩子</dt><dd>{analysis.blurbHook}</dd></div><div><dt>核心机制</dt><dd>{analysis.coreMechanism}</dd></div><div><dt>情绪预期</dt><dd>{analysis.coreEmotion}</dd></div><div><dt>标签组合</dt><dd>{analysis.tagCombination}</dd></div></dl><p>{analysis.disclaimer}</p></article> : null}</div> : <p className="operations-empty">尚无成功快照。解析失败、验证码、空榜单或无效跳转不会覆盖上次成功结果。</p>}
    {isOwner && source ? <div className="operations-actions"><button disabled={busy} onClick={() => void runTask()} type="button">创建后台采集任务</button>{task && !['completed', 'partial', 'failed', 'cancelled'].includes(task.status) ? <button onClick={() => void cancelCoreRankingTask(task.id, csrf).then(() => setTask({ ...task, status: 'cancelled' }))} type="button">取消任务</button> : null}<span>{task ? `${task.status} · ${task.progress}%` : ''}</span></div> : null}
    <p role="status">{status}</p>
  </section>;
}

function BackupWorkspace({ csrf, directory }: { csrf: string; directory: CoreWorkDirectory }) {
  const [targets, setTargets] = useState<CoreBackupTarget[]>([]); const [runs, setRuns] = useState<CoreBackupRun[]>([]); const [objects, setObjects] = useState<CoreBackupObject[]>([]); const [configured, setConfigured] = useState(false);
  const [targetType, setTargetType] = useState<'webdav' | 's3-compatible'>('webdav'); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  async function refresh(signal?: AbortSignal) { const result = await listCoreBackups(signal); const scopedTargets = result.targets.filter((item) => item.work_id === directory.id); const targetIds = new Set(scopedTargets.map((item) => item.id)); setTargets(scopedTargets); setRuns(result.runs.filter((item) => targetIds.has(item.target_id))); setObjects(result.objects.filter((item) => item.work_id === directory.id)); setConfigured(result.configured); return result.runs; }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal).catch((error) => { if (!controller.signal.aborted) setStatus(errorText(error)); }); return () => controller.abort(); }, [directory.id]);
  async function create(form: HTMLFormElement) {
    setBusy(true); try {
      const data = new FormData(form); const config = targetType === 'webdav' ? { baseUrl: String(data.get('baseUrl')), username: String(data.get('username')), password: String(data.get('password')) } : { endpoint: String(data.get('endpoint')), bucket: String(data.get('bucket')), region: String(data.get('region') || 'auto'), accessKeyId: String(data.get('accessKeyId')), secretAccessKey: String(data.get('secretAccessKey')), pathStyle: true };
      await createCoreBackupTarget({ workId: directory.id, label: String(data.get('label') || '外部备份'), targetType, intervalMinutes: Number(data.get('intervalMinutes') || 360), retentionHours: Number(data.get('retentionHours') || 168), config }, csrf); form.reset(); await refresh(); setStatus('外部备份目标已加密保存；凭据不会回显。');
    } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); }
  }
  async function run(targetId: string) { setBusy(true); try { const created = await runCoreBackup(targetId, csrf); setStatus('备份已进入后台任务；辅助服务失败不会影响正文保存。'); for (let attempt = 0; attempt < 20; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 1_000)); const latest = (await refresh()).find((item) => item.id === created.runId); if (latest && ['completed', 'partial', 'failed', 'cancelled'].includes(latest.status)) { setStatus(latest.status === 'completed' ? '外部备份已完成并记录完整性哈希。' : `备份任务结束：${latest.status}${latest.error_code ? `（${latest.error_code}）` : ''}`); break; } } } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); } }
  async function download(object: CoreBackupObject) { setBusy(true); try { downloadBlob(await downloadCoreBackupObject(object.id), `墨界备份-${object.created_at.slice(0, 10)}.json`); setStatus('已校验哈希并下载外部备份。'); } catch (error) { setStatus(errorText(error)); } finally { setBusy(false); } }
  return <section className="operations-section backup-workspace">
    <header><div><h3>可选外部备份</h3><p>默认架构仍是 D1 + 每用户加密 IndexedDB。R2 未启用、未创建 Bucket，也不是运行前置条件。</p></div></header>
    {!configured ? <p className="operations-warning">已实现但需外部配置：服务端缺少 <code>MOJIE_BACKUP_MASTER_KEY</code>，因此凭据加密采用失败关闭，当前不能保存备份目标。</p> : null}
    {directory.role === 'WORK_OWNER' ? <details><summary>新增 WebDAV / S3 兼容目标</summary><form onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}><label><span>名称</span><input defaultValue="作品外部备份" name="label" /></label><label><span>类型</span><select onChange={(event) => setTargetType(event.target.value as typeof targetType)} value={targetType}><option value="webdav">WebDAV</option><option value="s3-compatible">S3 兼容</option></select></label><label><span>间隔（分钟）</span><input defaultValue="360" min="15" name="intervalMinutes" type="number" /></label><label><span>保留（小时）</span><input defaultValue="168" min="1" name="retentionHours" type="number" /></label>{targetType === 'webdav' ? <><label><span>HTTPS 根地址</span><input name="baseUrl" required /></label><label><span>用户名</span><input name="username" required /></label><label><span>应用专用密码</span><input name="password" required type="password" /></label></> : <><label><span>HTTPS 端点</span><input name="endpoint" required /></label><label><span>Bucket</span><input name="bucket" required /></label><label><span>Region</span><input defaultValue="auto" name="region" /></label><label><span>Access Key ID</span><input name="accessKeyId" required /></label><label><span>Secret Access Key</span><input name="secretAccessKey" required type="password" /></label></>}<button disabled={busy || !configured} type="submit">加密保存目标</button></form></details> : <p>只有作品拥有者可以配置外部备份。</p>}
    {targets.length ? <ul className="backup-target-list">{targets.map((target) => <li key={target.id}><div><strong>{target.label}</strong><span>{target.target_type} · 每 {target.interval_minutes} 分钟 · 保留 {target.retention_hours} 小时</span><small>{target.last_error_code || (target.last_backup_at ? `最近成功：${new Date(target.last_backup_at).toLocaleString('zh-CN')}` : '尚未执行')}</small></div><div><button disabled={busy || !target.enabled} onClick={() => void run(target.id)} type="button">立即备份</button><button disabled={busy || !target.enabled} onClick={() => void disableCoreBackupTarget(target.id, csrf).then(() => refresh())} type="button">停用</button></div></li>)}</ul> : <p className="operations-empty">当前作品尚未配置外部备份目标。</p>}
    {runs.length ? <p>最近任务：{runs[0]!.status}{runs[0]!.error_code ? ` · ${runs[0]!.error_code}` : ''}</p> : null}
    {objects.length ? <section><h4>可读取的备份对象</h4><ul className="backup-object-list">{objects.map((object) => <li key={object.id}><div><strong>{new Date(object.created_at).toLocaleString('zh-CN')}</strong><span>{Math.ceil(object.size_bytes / 1024)} KB · 到期 {new Date(object.expires_at).toLocaleString('zh-CN')}</span></div><div><button disabled={busy} onClick={() => void download(object)} type="button">校验并下载</button><button disabled={busy} onClick={() => void deleteCoreBackupObject(object.id, csrf).then(() => refresh())} type="button">删除外部副本</button></div></li>)}</ul></section> : null}
    <p role="status">{status}</p>
  </section>;
}
