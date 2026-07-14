'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Castle, Gem, Landmark, Mountain, Route, Trees, Waves, Flame, House, MapPin, type LucideIcon } from 'lucide-react';
import type { GraphEdge, GraphNode, PositionedGraphNode } from '../lib/graph-model';
import type { TimelineEvent } from '../lib/project-model';

export type TimelineView = 'gantt' | 'linear';

function timeValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function StoryTimeline({ events, names }: { events: TimelineEvent[]; names: Map<string, string> }) {
  const [view, setView] = useState<TimelineView>('gantt');
  const ordered = useMemo(() => [...events].sort((a, b) => timeValue(a.startAt) - timeValue(b.startAt)), [events]);
  const bounds = useMemo(() => {
    const values = ordered.flatMap((event) => [timeValue(event.startAt), timeValue(event.endAt)]).filter(Boolean);
    const min = values.length ? Math.min(...values) : Date.now();
    const max = values.length ? Math.max(...values) : min + 86_400_000;
    return { min, span: Math.max(3_600_000, max - min) };
  }, [ordered]);

  return <section className="story-timeline" aria-label="可视时间线">
    <header><div><strong>剧情时间轴</strong><span>{ordered.length} 个事件 · 拖动下方区域可横向查看</span></div><div className="visual-view-switch"><button aria-pressed={view === 'gantt'} onClick={() => setView('gantt')} type="button">甘特图</button><button aria-pressed={view === 'linear'} onClick={() => setView('linear')} type="button">线性轴</button></div></header>
    {ordered.length === 0 ? <div className="visual-empty"><strong>先创建一个事件</strong><span>保存后会按时间、人物和地点自动排列。</span></div> : null}
    {view === 'gantt' && ordered.length ? <div className="gantt-board">
      <div className="gantt-axis"><span>开始</span><span>中段</span><span>结束</span></div>
      {ordered.map((event, index) => {
        const start = ((timeValue(event.startAt) - bounds.min) / bounds.span) * 100;
        const width = Math.max(3, ((timeValue(event.endAt) - timeValue(event.startAt)) / bounds.span) * 100);
        return <div className="gantt-row" key={event.id}><div className="gantt-label"><strong>{event.title}</strong><span>{event.characterIds.map((id) => names.get(id)).filter(Boolean).join('、') || '人物未定'}</span></div><div className="gantt-track"><div className="gantt-bar" data-lane={index % 4} style={{ left: `${Math.max(0, start)}%`, width: `${Math.min(100 - start, width)}%` }} title={`${new Date(event.startAt).toLocaleString('zh-CN')} 至 ${new Date(event.endAt).toLocaleString('zh-CN')}`}><span>{event.isForeshadowing ? '伏笔 · ' : ''}{names.get(event.locationId ?? '') ?? '地点未定'}</span></div></div></div>;
      })}
    </div> : null}
    {view === 'linear' && ordered.length ? <ol className="linear-story-axis">{ordered.map((event) => <li key={event.id}><time>{new Date(event.startAt).toLocaleString('zh-CN')}</time><span className="linear-dot" /><article><strong>{event.title}</strong><p>{names.get(event.locationId ?? '') ?? '地点未定'} · {event.characterIds.map((id) => names.get(id)).filter(Boolean).join('、') || '人物未定'}</p></article></li>)}</ol> : null}
  </section>;
}

export type RelationshipView = 'network' | 'tree' | 'sankey';

function graphLayout(nodes: GraphNode[], edges: GraphEdge[], view: RelationshipView): PositionedGraphNode[] {
  if (!nodes.length) return [];
  if (view === 'tree') {
    const incoming = new Set(edges.map((edge) => edge.toId));
    const roots = nodes.filter((node) => !incoming.has(node.id));
    const rootIds = new Set((roots.length ? roots : nodes.slice(0, 1)).map((node) => node.id));
    const levels = new Map<string, number>([...rootIds].map((id) => [id, 0]));
    for (let pass = 0; pass < nodes.length; pass += 1) for (const edge of edges) if (levels.has(edge.fromId) && !levels.has(edge.toId)) levels.set(edge.toId, (levels.get(edge.fromId) ?? 0) + 1);
    const buckets = new Map<number, GraphNode[]>();
    for (const node of nodes) { const level = levels.get(node.id) ?? 1; buckets.set(level, [...(buckets.get(level) ?? []), node]); }
    return nodes.map((node) => { const level = levels.get(node.id) ?? 1; const peers = buckets.get(level) ?? [node]; const index = peers.findIndex((item) => item.id === node.id); return { ...node, x: 90 + level * 210, y: 70 + index * (320 / Math.max(1, peers.length - 1 || 1)) }; });
  }
  if (view === 'sankey') {
    const left = nodes.filter((_, index) => index % 3 === 0); const middle = nodes.filter((_, index) => index % 3 === 1); const right = nodes.filter((_, index) => index % 3 === 2);
    return [left, middle, right].flatMap((column, columnIndex) => column.map((node, index) => ({ ...node, x: 90 + columnIndex * 270, y: 70 + index * (320 / Math.max(1, column.length - 1 || 1)) })));
  }
  const centerX = 320; const centerY = 210;
  return nodes.map((node, index) => { const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2; return { ...node, x: centerX + Math.cos(angle) * 245, y: centerY + Math.sin(angle) * 150 }; });
}

export function StoryRelationshipGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [view, setView] = useState<RelationshipView>('network');
  const [manual, setManual] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const base = useMemo(() => graphLayout(nodes, edges, view), [edges, nodes, view]);
  const positioned = base.map((node) => ({ ...node, ...(manual[node.id] ?? {}) }));
  const byId = new Map(positioned.map((node) => [node.id, node]));

  function move(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setManual((current) => ({ ...current, [dragging]: { x: Math.max(45, Math.min(595, ((event.clientX - rect.left) / rect.width) * 640)), y: Math.max(40, Math.min(380, ((event.clientY - rect.top) / rect.height) * 420)) } }));
  }

  return <section className="story-relationship"><header><div><strong>关系图谱</strong><span>拖动节点调整位置；线宽表示关系强度</span></div><div className="visual-view-switch">{(['network', 'tree', 'sankey'] as const).map((item) => <button aria-pressed={view === item} key={item} onClick={() => { setView(item); setManual({}); }} type="button">{{ network: '网状', tree: '树状', sankey: '流向' }[item]}</button>)}</div></header>
    {!nodes.length ? <div className="visual-empty"><strong>先创建人物或势力</strong><span>再添加关系，图谱会自动布局。</span></div> : <svg aria-label="可拖动人物关系图" className="relationship-svg relationship-canvas" onPointerMove={move} onPointerUp={() => setDragging(null)} viewBox="0 0 640 420">
      <defs><marker id="relationship-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4"><path d="M0,0 L8,4 L0,8 Z" /></marker></defs>
      {edges.map((edge) => { const from = byId.get(edge.fromId); const to = byId.get(edge.toId); if (!from || !to) return null; const width = view === 'sankey' ? 2 + (edge.strength ?? 1) * 2 : Math.max(1.5, edge.strength ?? 2); return <g key={edge.id}><path d={`M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`} markerEnd="url(#relationship-arrow)" strokeWidth={width} /><text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 7}>{edge.label}</text></g>; })}
      {positioned.map((node) => <g className="relationship-node" key={node.id} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(node.id); }} transform={`translate(${node.x} ${node.y})`}><circle r={node.kind === 'faction' ? 32 : 27} /><text textAnchor="middle" y="4">{node.label.slice(0, 8)}</text><title>{node.label}</title></g>)}
    </svg>}
  </section>;
}

export type TerrainMarkerType = 'mountain' | 'river' | 'volcano' | 'ruin' | 'treasure' | 'city' | 'town' | 'forest' | 'route';
export type TerrainItem = { id: string; title: string; x: number; y: number; markerType: string; path?: string[] };
type TerrainSample = { id: string; label: string; seed: number; water: string; low: string; mid: string; high: string };
const SAMPLES: TerrainSample[] = [
  { id: 'eastern', label: '山河大陆', seed: 17, water: '#a9c9c0', low: '#cbd3ad', mid: '#96a47d', high: '#756d5b' },
  { id: 'islands', label: '群岛海权', seed: 43, water: '#86b8bd', low: '#d6c89b', mid: '#8da77e', high: '#686858' },
  { id: 'wasteland', label: '荒原裂谷', seed: 91, water: '#9eb6b0', low: '#d7bd8e', mid: '#b08362', high: '#67564d' }
];
const ICONS: Record<TerrainMarkerType, LucideIcon> = { mountain: Mountain, river: Waves, volcano: Flame, ruin: Landmark, treasure: Gem, city: Castle, town: House, forest: Trees, route: Route };
const LABELS: Record<TerrainMarkerType, string> = { mountain: '山峰', river: '河流', volcano: '火山', ruin: '遗址', treasure: '宝藏', city: '城市', town: '小镇', forest: '树林', route: '道路' };

function random2(x: number, y: number, seed: number): number { const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return value - Math.floor(value); }
function smooth(value: number): number { return value * value * (3 - 2 * value); }
function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x); const y0 = Math.floor(y); const fx = smooth(x - x0); const fy = smooth(y - y0);
  const a = random2(x0, y0, seed); const b = random2(x0 + 1, y0, seed); const c = random2(x0, y0 + 1, seed); const d = random2(x0 + 1, y0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function drawTerrain(canvas: HTMLCanvasElement, sample: TerrainSample) {
  const width = 640; const height = 400; canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) return;
  const image = context.createImageData(width, height);
  const palette = [sample.water, sample.low, sample.mid, sample.high].map((color) => color.match(/[a-f\d]{2}/giu)!.map((hex) => Number.parseInt(hex, 16)));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const nx = x / width - .5; const ny = y / height - .5;
    const continental = sample.id === 'islands' ? .52 - Math.hypot(nx, ny) * .45 : .72 - Math.hypot(nx * .9, ny) * .66;
    const elevation = noise(x / 105, y / 105, sample.seed) * .5 + noise(x / 43, y / 43, sample.seed + 9) * .25 + noise(x / 17, y / 17, sample.seed + 27) * .12 + continental * .45;
    const level = elevation < .43 ? 0 : elevation < .57 ? 1 : elevation < .7 ? 2 : 3; const color = palette[level]!; const offset = (y * width + x) * 4;
    image.data[offset] = color[0]!; image.data[offset + 1] = color[1]!; image.data[offset + 2] = color[2]!; image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.globalAlpha = .12; context.strokeStyle = '#2f4d42'; context.lineWidth = 1;
  for (let y = 22; y < height; y += 28) { context.beginPath(); for (let x = 0; x < width; x += 8) { const yy = y + (noise(x / 80, y / 80, sample.seed + 70) - .5) * 14; x ? context.lineTo(x, yy) : context.moveTo(x, yy); } context.stroke(); }
  context.globalAlpha = 1;
}

export function TerrainMapWorkbench({ items, readOnly, onCreate }: { items: TerrainItem[]; readOnly?: boolean; onCreate(input: { title: string; markerType: TerrainMarkerType; x: number; y: number; path?: string[] }): Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const boardRef = useRef<HTMLDivElement>(null);
  const [sampleId, setSampleId] = useState(SAMPLES[0]!.id); const [tool, setTool] = useState<TerrainMarkerType>('mountain'); const [draft, setDraft] = useState<Array<{ x: number; y: number }>>([]); const [saving, setSaving] = useState(false);
  const sample = SAMPLES.find((item) => item.id === sampleId) ?? SAMPLES[0]!;
  useEffect(() => { if (canvasRef.current) drawTerrain(canvasRef.current, sample); }, [sample]);
  const paths = items.filter((item) => item.path?.length).map((item) => ({ ...item, points: item.path!.map((point) => point.split(',').map(Number)) }));

  function point(event: ReactPointerEvent): { x: number; y: number } { const rect = boardRef.current!.getBoundingClientRect(); return { x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10, y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10 }; }
  async function finish() {
    if (!draft.length || readOnly) { setDraft([]); return; }
    setSaving(true);
    try { const first = draft[0]!; await onCreate({ title: `${LABELS[tool]} ${items.length + 1}`, markerType: tool, x: first.x, y: first.y, path: tool === 'river' || tool === 'route' || tool === 'forest' || tool === 'mountain' ? draft.map((item) => `${item.x},${item.y}`) : undefined }); }
    finally { setSaving(false); setDraft([]); }
  }

  return <section className="terrain-workbench"><header><div><strong>世界地图画布</strong><span>选择样图与图示；河流、道路、山脉和树林可按住鼠标连续绘制</span></div><label>地形样图<select value={sampleId} onChange={(event) => setSampleId(event.target.value)}>{SAMPLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></header>
    <div className="terrain-toolbar" aria-label="地图图示工具">{(Object.keys(ICONS) as TerrainMarkerType[]).map((type) => { const Icon = ICONS[type]; return <button aria-pressed={tool === type} disabled={readOnly || saving} key={type} onClick={() => setTool(type)} type="button"><Icon aria-hidden="true" size={18} /><span>{LABELS[type]}</span></button>; })}</div>
    <div className="terrain-board" onPointerDown={(event) => { if (readOnly) return; event.currentTarget.setPointerCapture(event.pointerId); setDraft([point(event)]); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId) || !['river', 'route', 'forest', 'mountain'].includes(tool)) return; const next = point(event); setDraft((current) => { const last = current.at(-1); return !last || Math.hypot(next.x - last.x, next.y - last.y) > 2.4 ? [...current, next] : current; }); }} onPointerUp={() => void finish()} ref={boardRef} role="application" aria-label="可绘制世界地图">
      <canvas ref={canvasRef} />
      <svg className="terrain-paths" viewBox="0 0 100 100" preserveAspectRatio="none">{[...paths.map((item) => ({ id: item.id, markerType: item.markerType, points: item.points })), ...(draft.length > 1 ? [{ id: 'draft', markerType: tool, points: draft.map((item) => [item.x, item.y]) }] : [])].map((path) => <polyline className={`terrain-line is-${path.markerType}`} key={path.id} points={path.points.map(([x, y]) => `${x},${y}`).join(' ')} />)}</svg>
      {[...paths.map((item) => ({ id: item.id, markerType: item.markerType, points: item.points })), ...(draft.length > 1 ? [{ id: 'draft', markerType: tool, points: draft.map((item) => [item.x, item.y]) }] : [])].filter((path) => path.markerType === 'mountain' || path.markerType === 'forest').flatMap((path) => path.points.filter((_, index) => index % 3 === 0).map(([x, y], index) => { const Stamp = path.markerType === 'mountain' ? Mountain : Trees; return <Stamp aria-hidden="true" className={`terrain-brush-stamp is-${path.markerType}`} key={`${path.id}:${index}`} style={{ left: `${x}%`, top: `${y}%` }} />; }))}
      {items.filter((item) => !item.path?.length).map((item) => { const Marker = ICONS[(item.markerType as TerrainMarkerType)] ?? MapPin; return <div className={`terrain-marker is-${item.markerType}`} key={item.id} style={{ left: `${item.x}%`, top: `${item.y}%` }} title={item.title}><Marker aria-hidden="true" /><span>{item.title}</span></div>; })}
      {draft.length === 1 && !['river', 'route', 'forest', 'mountain'].includes(tool) ? (() => { const Marker = ICONS[tool]; return <div className={`terrain-marker is-${tool} is-draft`} style={{ left: `${draft[0]!.x}%`, top: `${draft[0]!.y}%` }}><Marker aria-hidden="true" /></div>; })() : null}
    </div>
    <footer><span>{saving ? '正在保存绘制…' : readOnly ? '当前为只读地图。' : '图示与路径会保存到当前作品；切换样图不会删除标注。'}</span><strong>{items.length} 个图示/笔画</strong></footer>
  </section>;
}
