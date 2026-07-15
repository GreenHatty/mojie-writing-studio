'use client';

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { HelpTip } from './help-tip';

export type WorldMapMarkerType = 'mountain' | 'river' | 'volcano' | 'ruin' | 'treasure' | 'city' | 'town' | 'forest' | 'route' | 'label';
export type WorldMapTool = WorldMapMarkerType | 'eraser';
export type WorldMapItem = { id: string; title: string; x: number; y: number; markerType: string; path?: string[]; scale?: number; rotation?: number };

export const WORLD_PLATE_SAMPLES = [
  { id: 'modern-city', label: '现代都市圈', src: '/map-assets/modern-city.webp', thumbnail: '/map-assets/thumbs/modern-city.webp', help: '环形都市、港口群岛、卫星城与山海交通板块' },
  { id: 'cultivation-continent', label: '修仙大陆', src: '/map-assets/cultivation-continent.webp', thumbnail: '/map-assets/thumbs/cultivation-continent.webp', help: '五域大陆、仙海、禁区与宗门势力板块' },
  { id: 'supernatural-apocalypse', label: '异能末世', src: '/map-assets/supernatural-apocalypse.webp', thumbnail: '/map-assets/thumbs/supernatural-apocalypse.webp', help: '淹没都市、异常风暴、幸存安全区与异能势力板块' },
  { id: 'wasteland-world', label: '废土世界', src: '/map-assets/wasteland-world.webp', thumbnail: '/map-assets/thumbs/wasteland-world.webp', help: '裂谷荒漠、辐射盆地、绿洲据点与旧文明板块' },
  { id: 'wuxia-realms', label: '古代武侠', src: '/map-assets/wuxia-realms.webp', thumbnail: '/map-assets/thumbs/wuxia-realms.webp', help: '中原州府、边关、江湖门派与水路商道板块' },
  { id: 'primordial-world', label: '洪荒世界', src: '/map-assets/primordial-world.webp', thumbnail: '/map-assets/thumbs/primordial-world.webp', help: '天地四极、神族祖地、混沌海与先天禁区板块' },
  { id: 'western-fantasy', label: '西幻世界', src: '/map-assets/western-fantasy.webp', thumbnail: '/map-assets/thumbs/western-fantasy.webp', help: '王国、公国、精灵森林、龙脉与外海群岛板块' }
] as const;

const LABELS: Record<WorldMapTool, string> = { mountain: '山脉', river: '河流', volcano: '火山', ruin: '遗址', treasure: '秘宝', city: '城市', town: '小镇', forest: '森林', route: '道路', label: '地名', eraser: '橡皮擦' };
const PATH_TOOLS = new Set<WorldMapTool>(['mountain', 'river', 'forest', 'route']);

function boardPoint(event: ReactPointerEvent, board: HTMLElement): { x: number; y: number } {
  const rect = board.getBoundingClientRect();
  return { x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)) };
}

export function WorldPlateMapWorkbench({
  items, backgroundId, readOnly, onBackgroundChange, onCreate, onUpdate, onDelete, onDeleteMany, onMerge
}: {
  items: WorldMapItem[];
  backgroundId: string;
  readOnly?: boolean;
  onBackgroundChange(id: string): Promise<void>;
  onCreate(input: Omit<WorldMapItem, 'id'>): Promise<void>;
  onUpdate(id: string, patch: Partial<Omit<WorldMapItem, 'id'>>): Promise<void>;
  onDelete(id: string): Promise<void>;
  onDeleteMany?(ids: string[]): Promise<void>;
  onMerge(sourceId: string, targetId: string): Promise<void>;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<WorldMapTool>('mountain');
  const [labelDraft, setLabelDraft] = useState('未命名之地');
  const [draft, setDraft] = useState<Array<{ x: number; y: number }>>([]);
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [placementScale, setPlacementScale] = useState(1);
  const [placementRotation, setPlacementRotation] = useState(0);
  const [erasingIds, setErasingIds] = useState<Set<string>>(() => new Set());
  const eraseStroke = useRef<Set<string>>(new Set());
  const sample = WORLD_PLATE_SAMPLES.find((item) => item.id === backgroundId) ?? WORLD_PLATE_SAMPLES[0];
  const paths = useMemo(() => items.filter((item) => item.path?.length).map((item) => ({ ...item, points: item.path!.map((point) => point.split(',').map(Number) as [number, number]) })), [items]);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function safe(action: () => Promise<void>) {
    setBusy(true); setStatus('');
    try { await action(); }
    catch (error) { setStatus(error instanceof Error ? error.message : '地图操作失败。'); }
    finally { setBusy(false); }
  }

  async function finishDrawing() {
    if (!draft.length || readOnly || tool === 'eraser') { setDraft([]); return; }
    const first = draft[0]!;
    const title = tool === 'label' ? labelDraft.trim() || '未命名之地' : `${LABELS[tool]} ${items.length + 1}`;
    const path = PATH_TOOLS.has(tool) && draft.length > 1 ? draft.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`) : undefined;
    await safe(() => onCreate({ title, markerType: tool, x: first.x, y: first.y, path, scale: placementScale, rotation: placementRotation }));
    setDraft([]);
  }

  async function finishDrag(item: WorldMapItem) {
    if (!dragging) return;
    const target = items.find((candidate) => candidate.id !== item.id && candidate.markerType === item.markerType && !candidate.path?.length && Math.hypot(candidate.x - dragging.x, candidate.y - dragging.y) < 5);
    setDragging(null);
    if (target) await safe(() => onMerge(item.id, target.id));
    else await safe(() => onUpdate(item.id, { x: dragging.x, y: dragging.y }));
  }

  function collectEraseTarget(target: EventTarget | null) {
    const element = target instanceof Element ? target : null;
    const id = element?.closest<HTMLElement>('[data-map-item]')?.dataset.mapItem;
    if (!id || eraseStroke.current.has(id) || !items.some((item) => item.id === id)) return;
    eraseStroke.current.add(id);
    setErasingIds(new Set(eraseStroke.current));
  }

  async function finishEraseStroke() {
    const ids = [...eraseStroke.current];
    eraseStroke.current = new Set();
    if (!ids.length) return;
    await safe(async () => {
      if (onDeleteMany) await onDeleteMany(ids);
      else for (const id of ids) await onDelete(id);
    });
    setErasingIds(new Set());
  }

  return <section className="world-plate-workbench">
    <header><div><strong>世界大陆区域板块图</strong><span>{sample.help}。底图不烙入地名；所有贴图和标注可移动、融合、替换或擦除。</span></div><HelpTip text="选择一种题材底图，再使用水彩贴图层绘制。拖动同类贴图重叠会融合；选中贴图后可用当前工具替换。" /></header>
    <div className="world-plate-sample-heading"><strong>七类题材底图</strong><button disabled={busy || readOnly} onClick={() => { const choices = WORLD_PLATE_SAMPLES.filter((item) => item.id !== sample.id); const next = choices[Math.floor(Math.random() * choices.length)]!; void safe(() => onBackgroundChange(next.id)); }} title="从其余题材世界板块图中随机选择一张" type="button">随机换一张</button></div>
    <div className="world-plate-samples" aria-label="题材世界底图">{WORLD_PLATE_SAMPLES.map((item) => <button aria-pressed={sample.id === item.id} disabled={busy || readOnly} key={item.id} onClick={() => void safe(() => onBackgroundChange(item.id))} title={item.help} type="button"><img alt="" decoding="async" loading="lazy" src={item.thumbnail} /><span>{item.label}</span></button>)}</div>
    <div className="world-map-controls">
      <div className="world-map-tools">{(Object.keys(LABELS) as WorldMapTool[]).map((type) => <button aria-pressed={tool === type} className={`tool-${type}`} disabled={readOnly || busy} key={type} onClick={() => setTool(type)} title={type === 'eraser' ? '按住鼠标或手写笔滑过贴图与笔画即可连续擦除，松开后可整笔撤回' : `${LABELS[type]}工具`} type="button"><span className={`map-tool-swatch sticker-${type}`} aria-hidden="true" /><b>{LABELS[type]}</b></button>)}</div>
      <label className="map-label-input"><span>地名文字</span><input disabled={readOnly || busy} maxLength={40} onChange={(event) => setLabelDraft(event.target.value)} placeholder="输入后选择地名工具" value={labelDraft} /></label>
      <div className="map-placement-controls" aria-label="新贴图大小和旋转">
        <label><span>放置大小 {Math.round(placementScale * 100)}%</span><input disabled={readOnly || busy} max="2.4" min="0.55" onChange={(event) => setPlacementScale(Number(event.target.value))} step="0.05" type="range" value={placementScale} /></label>
        <label><span>放置旋转 {placementRotation}°</span><input disabled={readOnly || busy} max="345" min="0" onChange={(event) => setPlacementRotation(Number(event.target.value))} step="15" type="range" value={placementRotation} /></label>
      </div>
    </div>
    {selected ? <div className="selected-map-item"><span>已选：{selected.title}</span><button disabled={busy || readOnly || selected.markerType === tool || tool === 'eraser' || tool === 'label'} onClick={() => void safe(() => onUpdate(selected.id, { markerType: tool }))} type="button">用“{LABELS[tool]}”替换</button><button disabled={busy || readOnly} onClick={() => void safe(() => onUpdate(selected.id, { scale: Math.min(2.4, (selected.scale ?? 1) + .2) }))} type="button">放大</button><button disabled={busy || readOnly} onClick={() => void safe(() => onUpdate(selected.id, { scale: Math.max(.55, (selected.scale ?? 1) - .2) }))} type="button">缩小</button><button disabled={busy || readOnly} onClick={() => void safe(() => onUpdate(selected.id, { rotation: ((selected.rotation ?? 0) + 15) % 360 }))} type="button">旋转</button></div> : null}
    <div
      aria-label="可绘制世界地图"
      className={`world-plate-board is-tool-${tool}`}
      onPointerDown={(event) => { if (readOnly || busy) return; if (tool === 'eraser') { event.currentTarget.setPointerCapture(event.pointerId); collectEraseTarget(document.elementFromPoint(event.clientX, event.clientY) ?? event.target); return; } if (event.target !== event.currentTarget && (event.target as HTMLElement).closest('[data-map-item]')) return; event.currentTarget.setPointerCapture(event.pointerId); setDraft([boardPoint(event, event.currentTarget)]); }}
      onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; if (tool === 'eraser') { collectEraseTarget(document.elementFromPoint(event.clientX, event.clientY)); return; } if (!PATH_TOOLS.has(tool)) return; const next = boardPoint(event, event.currentTarget); setDraft((current) => { const last = current.at(-1); return !last || Math.hypot(next.x - last.x, next.y - last.y) > 1.7 ? [...current, next] : current; }); }}
      onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (tool === 'eraser') void finishEraseStroke(); else void finishDrawing(); }}
      onPointerCancel={() => { eraseStroke.current = new Set(); setErasingIds(new Set()); setDraft([]); }}
      ref={boardRef}
      role="application"
      style={{ '--world-map-background': `url("${sample.src}")` } as CSSProperties}
    >
      <svg className="world-map-paths" preserveAspectRatio="none" viewBox="0 0 100 100">{[...paths.map((item) => ({ id: item.id, markerType: item.markerType, points: item.points, draft: false })), ...(draft.length > 1 ? [{ id: 'draft', markerType: tool, points: draft.map((point) => [point.x, point.y] as [number, number]), draft: true }] : [])].map((path) => <polyline className={`world-map-line is-${path.markerType} ${path.draft ? 'is-draft' : ''} ${erasingIds.has(path.id) ? 'is-erasing' : ''}`} data-map-item={path.draft ? undefined : path.id} key={path.id} points={path.points.map(([x, y]) => `${x},${y}`).join(' ')} />)}</svg>
      {[...paths.map((item) => ({ id: item.id, markerType: item.markerType, points: item.points })), ...(draft.length > 1 ? [{ id: 'draft', markerType: tool, points: draft.map((point) => [point.x, point.y] as [number, number]) }] : [])].filter((path) => ['mountain', 'forest', 'river', 'route'].includes(path.markerType)).flatMap((path) => path.points.filter((_, index) => index % (path.markerType === 'river' || path.markerType === 'route' ? 3 : 2) === 0).map(([x, y], index) => <span aria-hidden="true" className={`world-map-sticker sticker-${path.markerType} ${erasingIds.has(path.id) ? 'is-erasing' : ''}`} data-map-item={path.id === 'draft' ? undefined : path.id} key={`${path.id}:${index}`} style={{ left: `${x}%`, top: `${y}%` }} />))}
      {items.filter((item) => !item.path?.length).map((item) => <button
        className={`world-map-item ${item.markerType === 'label' ? 'is-label' : 'world-map-sticker sticker-' + item.markerType} ${selectedId === item.id ? 'is-selected' : ''} ${erasingIds.has(item.id) ? 'is-erasing' : ''}`}
        data-map-item={item.id}
        key={item.id}
        onClick={(event) => { event.stopPropagation(); if (tool !== 'eraser') setSelectedId(item.id); }}
        onPointerDown={(event) => { if (readOnly || busy || tool === 'eraser') return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedId(item.id); setDragging({ id: item.id, x: item.x, y: item.y }); }}
        onPointerMove={(event) => { if (!dragging || dragging.id !== item.id || !boardRef.current) return; const next = boardPoint(event, boardRef.current); setDragging({ id: item.id, ...next }); }}
        onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); void finishDrag(item); }}
        style={{ left: `${dragging?.id === item.id ? dragging.x : item.x}%`, top: `${dragging?.id === item.id ? dragging.y : item.y}%`, '--sticker-scale': String(item.scale ?? 1), '--sticker-rotation': `${item.rotation ?? 0}deg` } as CSSProperties}
        title={`${item.title}；拖动可移动，同类重叠可融合`}
        type="button"
      >{item.markerType === 'label' ? item.title : <span className="sr-only">{item.title}</span>}</button>)}
      {draft.length === 1 && !PATH_TOOLS.has(tool) && tool !== 'eraser' ? <span className={`world-map-item is-draft ${tool === 'label' ? 'is-label' : 'world-map-sticker sticker-' + tool}`} style={{ left: `${draft[0]!.x}%`, top: `${draft[0]!.y}%` }}>{tool === 'label' ? labelDraft : ''}</span> : null}
    </div>
    <footer><span role="status">{status || (busy ? '正在保存地图操作…' : '所有地图操作均写入当前作品；使用面板上方“撤回地图操作”可逐次恢复。')}</span><strong>{items.length} 个可编辑图层对象</strong></footer>
  </section>;
}
