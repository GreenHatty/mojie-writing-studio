'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildMapSvg, type GraphEdge, type GraphNode } from '../lib/graph-model';
import { detectCharacterLifeConflicts, detectTimelineConflicts, type ProjectEntity, type TimelineEvent } from '../lib/project-model';
import type { WritingRepository } from '../lib/repository';
import { StoryRelationshipGraph, StoryTimeline } from './story-visual-canvases';
import { WorldPlateMapWorkbench, WORLD_PLATE_SAMPLES, type WorldMapItem, type WorldMapMarkerType } from './world-plate-map-workbench';

type VisualSettingsPanelProps = {
  repository: Pick<WritingRepository, 'listEntities' | 'saveEntity' | 'softDeleteEntity' | 'restoreEntity'>;
  workId: string;
  chapters?: Array<{ id: string; title: string }>;
  readOnly?: boolean;
};

type VisualMode = 'timeline' | 'relationships' | 'map';
type UndoStep = { action: 'delete' | 'restore' | 'update'; entityId: string; before?: ProjectEntity };
type UndoEntry = { label: string; steps: UndoStep[] };

function fieldString(entity: ProjectEntity, key: string): string {
  const value = entity.fields[key];
  return typeof value === 'string' ? value : '';
}

function fieldNumber(entity: ProjectEntity, key: string, fallback: number): number {
  const value = entity.fields[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fieldStrings(entity: ProjectEntity, key: string): string[] {
  const value = entity.fields[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function downloadSvg(svg: string, fileName: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function VisualSettingsPanel({ repository, workId, chapters = [], readOnly = false }: VisualSettingsPanelProps) {
  const [mode, setMode] = useState<VisualMode>('timeline');
  const [characters, setCharacters] = useState<ProjectEntity[]>([]);
  const [factions, setFactions] = useState<ProjectEntity[]>([]);
  const [locations, setLocations] = useState<ProjectEntity[]>([]);
  const [events, setEvents] = useState<ProjectEntity[]>([]);
  const [relationships, setRelationships] = useState<ProjectEntity[]>([]);
  const [materials, setMaterials] = useState<ProjectEntity[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeLayer, setActiveLayer] = useState('全部图层');
  const [undoHistory, setUndoHistory] = useState<Record<VisualMode, UndoEntry[]>>({ timeline: [], relationships: [], map: [] });
  const [pendingClear, setPendingClear] = useState<VisualMode | null>(null);
  const [skipClearWarning, setSkipClearWarning] = useState(false);

  const [eventForm, setEventForm] = useState({ title: '', startAt: '', endAt: '', locationId: '', characterIds: [] as string[], chapterIds: [] as string[], predecessorIds: [] as string[], isForeshadowing: false });
  const [relationForm, setRelationForm] = useState({ fromId: '', toId: '', label: '合作', strength: 3 });
  const [locationForm, setLocationForm] = useState({ title: '', summary: '', x: 160, y: 120, layer: '默认层', markerType: 'node' as 'node' | 'region', width: 160, height: 100 });
  const [routeForm, setRouteForm] = useState({ fromId: '', toId: '', label: '路线', layer: '默认层' });

  async function refresh() {
    const [nextCharacters, nextFactions, nextLocations, nextEvents, nextRelationships, nextMaterials] = await Promise.all([
      repository.listEntities(workId, 'character'),
      repository.listEntities(workId, 'faction'),
      repository.listEntities(workId, 'location'),
      repository.listEntities(workId, 'timeline'),
      repository.listEntities(workId, 'relationship'),
      repository.listEntities(workId, 'material')
    ]);
    setCharacters(nextCharacters);
    setFactions(nextFactions);
    setLocations(nextLocations);
    setEvents(nextEvents);
    setRelationships(nextRelationships);
    setMaterials(nextMaterials);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repository.listEntities(workId, 'character'),
      repository.listEntities(workId, 'faction'),
      repository.listEntities(workId, 'location'),
      repository.listEntities(workId, 'timeline'),
      repository.listEntities(workId, 'relationship'),
      repository.listEntities(workId, 'material')
    ]).then(([nextCharacters, nextFactions, nextLocations, nextEvents, nextRelationships, nextMaterials]) => {
      if (cancelled) return;
      setCharacters(nextCharacters);
      setFactions(nextFactions);
      setLocations(nextLocations);
      setEvents(nextEvents);
      setRelationships(nextRelationships);
      setMaterials(nextMaterials);
    });
    return () => {
      cancelled = true;
    };
  }, [repository, workId]);

  const timelineEvents = useMemo<TimelineEvent[]>(
    () => events.map((event) => ({
      ...event,
      kind: 'timeline',
      startAt: fieldString(event, 'startAt'),
      endAt: fieldString(event, 'endAt'),
      characterIds: fieldStrings(event, 'characterIds'),
      locationId: fieldString(event, 'locationId') || undefined,
      chapterIds: fieldStrings(event, 'chapterIds'),
      predecessorIds: fieldStrings(event, 'predecessorIds'),
      isForeshadowing: event.fields.isForeshadowing === true
    })),
    [events]
  );
  const timelineConflicts = useMemo(() => [
    ...detectTimelineConflicts(timelineEvents),
    ...detectCharacterLifeConflicts(timelineEvents, characters.map((character) => ({ id: character.id, title: character.title, birthDate: fieldString(character, 'birthDate') || undefined, deathAt: fieldString(character, 'deathAt') || undefined })))
  ], [characters, timelineEvents]);
  const entityById = useMemo(
    () => new Map([...characters, ...factions, ...locations].map((entity) => [entity.id, entity])),
    [characters, factions, locations]
  );

  const relationshipNodes = useMemo<GraphNode[]>(
    () => [...characters, ...factions].map((entity) => ({
      id: entity.id,
      label: entity.title,
      kind: entity.kind === 'faction' ? 'faction' : 'character'
    })),
    [characters, factions]
  );
  const relationshipEdges = useMemo<GraphEdge[]>(
    () => relationships
      .filter((entity) => fieldString(entity, 'edgeKind') !== 'route')
      .map((entity) => ({
        id: entity.id,
        fromId: fieldString(entity, 'fromId'),
        toId: fieldString(entity, 'toId'),
        label: fieldString(entity, 'relationType') || entity.title,
        strength: fieldNumber(entity, 'strength', 3)
      })),
    [relationships]
  );
  const mapLayers = useMemo(() => ['全部图层', ...new Set(locations.map((entity) => fieldString(entity, 'layer') || '默认层'))], [locations]);
  const mapNodes = useMemo<GraphNode[]>(
    () => locations.filter((entity) => activeLayer === '全部图层' || (fieldString(entity, 'layer') || '默认层') === activeLayer).map((entity, index) => ({
      id: entity.id,
      label: entity.title,
      kind: 'location',
      x: fieldNumber(entity, 'x', 90 + (index % 3) * 180),
      y: fieldNumber(entity, 'y', 90 + Math.floor(index / 3) * 120),
      layer: fieldString(entity, 'layer') || '默认层',
      variant: fieldString(entity, 'markerType') === 'region' ? 'region' : 'node',
      width: fieldNumber(entity, 'width', 160),
      height: fieldNumber(entity, 'height', 100)
    })),
    [activeLayer, locations]
  );
  const mapEdges = useMemo<GraphEdge[]>(
    () => relationships
      .filter((entity) => fieldString(entity, 'edgeKind') === 'route' && (activeLayer === '全部图层' || (fieldString(entity, 'layer') || '默认层') === activeLayer))
      .map((entity) => ({
        id: entity.id,
        fromId: fieldString(entity, 'fromId'),
        toId: fieldString(entity, 'toId'),
        label: fieldString(entity, 'relationType') || entity.title
      })),
    [activeLayer, relationships]
  );
  const mapSvg = useMemo(() => buildMapSvg(mapNodes, mapEdges, { width: 640, height: 420, title: '作品地图' }), [mapEdges, mapNodes]);
  const mapConfig = materials.find((entity) => fieldString(entity, 'systemType') === 'map-config') ?? null;
  const mapBackgroundId = (mapConfig ? fieldString(mapConfig, 'backgroundId') : '') || WORLD_PLATE_SAMPLES[0].id;
  const mapItems = useMemo<WorldMapItem[]>(() => locations.map((entity) => ({
    id: entity.id,
    title: entity.title,
    x: fieldNumber(entity, 'x', 50) > 100 ? fieldNumber(entity, 'x', 50) / 6.4 : fieldNumber(entity, 'x', 50),
    y: fieldNumber(entity, 'y', 50) > 100 ? fieldNumber(entity, 'y', 50) / 4.2 : fieldNumber(entity, 'y', 50),
    markerType: fieldString(entity, 'markerType') || 'city',
    path: fieldStrings(entity, 'path'),
    scale: fieldNumber(entity, 'scale', 1),
    rotation: fieldNumber(entity, 'rotation', 0)
  })), [locations]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus('');
    try {
      await action();
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(false);
    }
  }

  function remember(targetMode: VisualMode, entry: UndoEntry) {
    setUndoHistory((current) => ({ ...current, [targetMode]: [...current[targetMode], entry].slice(-80) }));
  }

  async function undoLast(targetMode: VisualMode) {
    const entry = undoHistory[targetMode].at(-1);
    if (!entry) return;
    await run(async () => {
      for (const step of [...entry.steps].reverse()) {
        if (step.action === 'delete') await repository.softDeleteEntity(step.entityId);
        else if (step.action === 'restore') await repository.restoreEntity(step.entityId);
        else if (step.before) await repository.saveEntity(workId, { id: step.before.id, kind: step.before.kind, title: step.before.title, summary: step.before.summary, fields: step.before.fields });
      }
      setUndoHistory((current) => ({ ...current, [targetMode]: current[targetMode].slice(0, -1) }));
      setStatus(`已撤回：${entry.label}`);
    });
  }

  function entitiesForClear(targetMode: VisualMode): ProjectEntity[] {
    if (targetMode === 'timeline') return events;
    if (targetMode === 'relationships') return relationships.filter((entity) => fieldString(entity, 'edgeKind') !== 'route');
    return [...locations, ...relationships.filter((entity) => fieldString(entity, 'edgeKind') === 'route')];
  }

  async function clearMode(targetMode: VisualMode, rememberPreference = false) {
    const targets = entitiesForClear(targetMode);
    setPendingClear(null);
    setSkipClearWarning(false);
    if (!targets.length) { setStatus('当前图中没有可清空的内容。'); return; }
    if (rememberPreference && typeof localStorage !== 'undefined') localStorage.setItem(`mojie:skip-visual-clear-warning:${targetMode}`, '1');
    const label = targetMode === 'timeline' ? '时间线' : targetMode === 'relationships' ? '人物关系图' : '地图';
    await run(async () => {
      for (const entity of targets) await repository.softDeleteEntity(entity.id);
      remember(targetMode, { label: `清空${label}`, steps: targets.map((entity) => ({ action: 'restore' as const, entityId: entity.id })) });
      setStatus(`已清空${label}的 ${targets.length} 项内容，可立即整体撤回。`);
    });
  }

  function requestClear(targetMode: VisualMode) {
    const skip = typeof localStorage !== 'undefined' && localStorage.getItem(`mojie:skip-visual-clear-warning:${targetMode}`) === '1';
    if (skip) void clearMode(targetMode);
    else setPendingClear(targetMode);
  }

  async function addEvent() {
    if (!eventForm.title.trim() || !eventForm.startAt || !eventForm.endAt) {
      setStatus('事件名称、开始时间和结束时间不能为空。');
      return;
    }
    await run(async () => {
      const saved = await repository.saveEntity(workId, {
        kind: 'timeline',
        title: eventForm.title,
        fields: {
          startAt: new Date(eventForm.startAt).toISOString(),
          endAt: new Date(eventForm.endAt).toISOString(),
          locationId: eventForm.locationId || null,
          characterIds: eventForm.characterIds,
          chapterIds: eventForm.chapterIds,
          predecessorIds: eventForm.predecessorIds,
          isForeshadowing: eventForm.isForeshadowing
        }
      });
      remember('timeline', { label: `添加事件“${eventForm.title}”`, steps: [{ action: 'delete', entityId: saved.id }] });
      setEventForm({ title: '', startAt: '', endAt: '', locationId: '', characterIds: [], chapterIds: [], predecessorIds: [], isForeshadowing: false });
      setStatus('时间线事件已保存。');
    });
  }

  async function addRelationship() {
    if (!relationForm.fromId || !relationForm.toId || relationForm.fromId === relationForm.toId) {
      setStatus('请选择两个不同的人物或势力。');
      return;
    }
    await run(async () => {
      const saved = await repository.saveEntity(workId, {
        kind: 'relationship',
        title: relationForm.label,
        fields: {
          edgeKind: 'relationship',
          fromId: relationForm.fromId,
          toId: relationForm.toId,
          relationType: relationForm.label,
          strength: relationForm.strength
        }
      });
      remember('relationships', { label: `添加关系“${relationForm.label}”`, steps: [{ action: 'delete', entityId: saved.id }] });
      setStatus('人物关系已保存。');
    });
  }

  async function addLocation() {
    if (!locationForm.title.trim()) {
      setStatus('地点名称不能为空。');
      return;
    }
    await run(async () => {
      const saved = await repository.saveEntity(workId, {
        kind: 'location',
        title: locationForm.title,
        summary: locationForm.summary,
        fields: { x: locationForm.x, y: locationForm.y, layer: locationForm.layer || '默认层', markerType: locationForm.markerType, width: locationForm.width, height: locationForm.height }
      });
      remember('map', { label: `添加地点“${locationForm.title}”`, steps: [{ action: 'delete', entityId: saved.id }] });
      setLocationForm({ title: '', summary: '', x: 160, y: 120, layer: locationForm.layer || '默认层', markerType: 'node', width: 160, height: 100 });
      setStatus('地图地点已保存。');
    });
  }

  async function addRoute() {
    if (!routeForm.fromId || !routeForm.toId || routeForm.fromId === routeForm.toId) {
      setStatus('请选择两个不同地点。');
      return;
    }
    await run(async () => {
      const saved = await repository.saveEntity(workId, {
        kind: 'relationship',
        title: routeForm.label,
        fields: {
          edgeKind: 'route',
          fromId: routeForm.fromId,
          toId: routeForm.toId,
          relationType: routeForm.label,
          layer: routeForm.layer || '默认层'
        }
      });
      remember('map', { label: `添加路线“${routeForm.label}”`, steps: [{ action: 'delete', entityId: saved.id }] });
      setStatus('地图路线已保存。');
    });
  }

  return (
    <section className="visual-settings-panel">
      <div className="visual-mode-tabs" role="tablist" aria-label="可视化设定">
        <button aria-selected={mode === 'timeline'} onClick={() => setMode('timeline')} role="tab" title="用甘特图或线性轴编排事件、人物、地点、前置关系与伏笔" type="button">时间线</button>
        <button aria-selected={mode === 'relationships'} onClick={() => setMode('relationships')} role="tab" title="用网状图、树状图或流向图管理人物与势力关系" type="button">人物关系</button>
        <button aria-selected={mode === 'map'} onClick={() => setMode('map')} role="tab" title="选择题材世界底图，绘制、移动、融合、替换和擦除地图元素" type="button">地图DIY</button>
      </div>

      {mode === 'timeline' ? (
        <div className="timeline-tool">
          <StoryTimeline events={timelineEvents} names={new Map([...characters, ...factions, ...locations].map((entity) => [entity.id, entity.title]))} />
          <div className="visual-undo-bar"><button className="danger-button" disabled={busy || readOnly || !events.length} onClick={() => requestClear('timeline')} title="把当前时间线事件移入回收站；确认后仍可一次撤回" type="button">清空时间线</button><button disabled={busy || readOnly || !undoHistory.timeline.length} onClick={() => void undoLast('timeline')} title="逐次撤回本次打开面板后对时间线所做的保存操作" type="button">↶ 撤回时间线操作{undoHistory.timeline.length ? `（${undoHistory.timeline.length}）` : ''}</button></div>
          <details className="visual-editor-details"><summary>添加时间线事件</summary>
          <div className="visual-form-grid">
            <label><span>事件名称</span><input onChange={(event) => setEventForm((form) => ({ ...form, title: event.target.value }))} value={eventForm.title} /></label>
            <label><span>开始时间</span><input onChange={(event) => setEventForm((form) => ({ ...form, startAt: event.target.value }))} type="datetime-local" value={eventForm.startAt} /></label>
            <label><span>结束时间</span><input onChange={(event) => setEventForm((form) => ({ ...form, endAt: event.target.value }))} type="datetime-local" value={eventForm.endAt} /></label>
            <label><span>地点</span><select onChange={(event) => setEventForm((form) => ({ ...form, locationId: event.target.value }))} value={eventForm.locationId}><option value="">未指定</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.title}</option>)}</select></label>
            <fieldset><legend>相关人物</legend>{characters.map((character) => <label key={character.id}><input checked={eventForm.characterIds.includes(character.id)} onChange={(event) => setEventForm((form) => ({ ...form, characterIds: event.target.checked ? [...form.characterIds, character.id] : form.characterIds.filter((id) => id !== character.id) }))} type="checkbox" />{character.title}</label>)}</fieldset>
            {chapters.length ? <fieldset><legend>相关章节</legend>{chapters.map((chapter) => <label key={chapter.id}><input checked={eventForm.chapterIds.includes(chapter.id)} onChange={(event) => setEventForm((form) => ({ ...form, chapterIds: event.target.checked ? [...form.chapterIds, chapter.id] : form.chapterIds.filter((id) => id !== chapter.id) }))} type="checkbox" />{chapter.title}</label>)}</fieldset> : null}
            {events.length ? <fieldset><legend>前置事件</legend>{events.map((eventEntity) => <label key={eventEntity.id}><input checked={eventForm.predecessorIds.includes(eventEntity.id)} onChange={(event) => setEventForm((form) => ({ ...form, predecessorIds: event.target.checked ? [...form.predecessorIds, eventEntity.id] : form.predecessorIds.filter((id) => id !== eventEntity.id) }))} type="checkbox" />{eventEntity.title}</label>)}</fieldset> : null}
            <label><input checked={eventForm.isForeshadowing} onChange={(event) => setEventForm((form) => ({ ...form, isForeshadowing: event.target.checked }))} type="checkbox" />这是伏笔事件</label>
            <button disabled={busy || readOnly} onClick={() => void addEvent()} type="button">保存事件</button>
          </div>
          </details>
          {timelineConflicts.length ? <div className="timeline-conflicts"><strong>发现 {timelineConflicts.length} 项时间冲突</strong><ul>{timelineConflicts.map((conflict, index) => <li key={`${conflict.code}-${index}`}>{conflict.message}</li>)}</ul></div> : null}
          <ol className="timeline-list">{[...timelineEvents].sort((a, b) => a.startAt.localeCompare(b.startAt)).map((event) => <li key={event.id}><time>{event.startAt ? new Date(event.startAt).toLocaleString('zh-CN') : '时间未定'}</time><strong>{event.title}</strong><span>{event.locationId ? entityById.get(event.locationId)?.title : '地点未定'} · {event.characterIds.map((id) => entityById.get(id)?.title).filter(Boolean).join('、') || '人物未定'}</span></li>)}</ol>
        </div>
      ) : null}

      {mode === 'relationships' ? (
        <div className="relationship-tool">
          <StoryRelationshipGraph edges={relationshipEdges} nodes={relationshipNodes} />
          <div className="visual-undo-bar"><button className="danger-button" disabled={busy || readOnly || !relationshipEdges.length} onClick={() => requestClear('relationships')} title="只清空关系连线，不删除人物或势力卡；确认后可撤回" type="button">清空关系图</button><button disabled={busy || readOnly || !undoHistory.relationships.length} onClick={() => void undoLast('relationships')} title="逐次撤回已保存的关系操作；节点拖动可在图内单独撤回" type="button">↶ 撤回关系操作{undoHistory.relationships.length ? `（${undoHistory.relationships.length}）` : ''}</button></div>
          <details className="visual-editor-details"><summary>添加人物 / 势力关系</summary>
          <div className="visual-form-grid compact">
            <label><span>起点人物/势力</span><select onChange={(event) => setRelationForm((form) => ({ ...form, fromId: event.target.value }))} value={relationForm.fromId}><option value="">请选择</option>{[...characters, ...factions].map((entity) => <option key={entity.id} value={entity.id}>{entity.title}</option>)}</select></label>
            <label><span>终点人物/势力</span><select onChange={(event) => setRelationForm((form) => ({ ...form, toId: event.target.value }))} value={relationForm.toId}><option value="">请选择</option>{[...characters, ...factions].map((entity) => <option key={entity.id} value={entity.id}>{entity.title}</option>)}</select></label>
            <label><span>关系</span><input onChange={(event) => setRelationForm((form) => ({ ...form, label: event.target.value }))} value={relationForm.label} /></label>
            <label><span>强度 1-5</span><input max={5} min={1} onChange={(event) => setRelationForm((form) => ({ ...form, strength: Number(event.target.value) }))} type="number" value={relationForm.strength} /></label>
            <button disabled={busy || readOnly} onClick={() => void addRelationship()} type="button">保存关系</button>
          </div>
          </details>
          <button className="visual-export" onClick={() => downloadSvg(buildMapSvg(relationshipNodes, relationshipEdges, { width: 640, height: 420, title: '人物关系图' }), '人物关系图.svg')} type="button">导出SVG</button>
        </div>
      ) : null}

      {mode === 'map' ? (
        <div className="map-tool">
          <div className="visual-undo-bar"><button className="danger-button" disabled={busy || readOnly || !mapItems.length} onClick={() => requestClear('map')} title="清空地图上的地点、贴图、笔画和路线，保留当前底图；确认后可撤回" type="button">清空地图内容</button><button disabled={busy || readOnly || !undoHistory.map.length} onClick={() => void undoLast('map')} title="逐次撤回地图标注、移动、融合、擦除或底图切换" type="button">↶ 撤回地图操作{undoHistory.map.length ? `（${undoHistory.map.length}）` : ''}</button></div>
          <WorldPlateMapWorkbench
            backgroundId={mapBackgroundId}
            items={mapItems}
            onBackgroundChange={async (backgroundId) => {
              await run(async () => {
                const saved = await repository.saveEntity(workId, { id: mapConfig?.id, kind: 'material', title: '地图画布配置', summary: '系统保存的地图底图选择', fields: { ...(mapConfig?.fields ?? {}), systemType: 'map-config', backgroundId } });
                remember('map', { label: `切换底图为“${WORLD_PLATE_SAMPLES.find((item) => item.id === backgroundId)?.label ?? backgroundId}”`, steps: mapConfig ? [{ action: 'update', entityId: mapConfig.id, before: mapConfig }] : [{ action: 'delete', entityId: saved.id }] });
                setStatus('题材底图已保存。');
              });
            }}
            onCreate={async (input) => {
              await run(async () => {
                const saved = await repository.saveEntity(workId, { kind: 'location', title: input.title, fields: { x: input.x, y: input.y, markerType: input.markerType as WorldMapMarkerType, path: input.path ?? [], scale: input.scale ?? 1, rotation: input.rotation ?? 0, layer: activeLayer === '全部图层' ? '默认层' : activeLayer } });
                remember('map', { label: `添加“${input.title}”`, steps: [{ action: 'delete', entityId: saved.id }] }); setStatus(`${input.title}已添加到地图。`);
              });
            }}
            onDelete={async (id) => {
              const entity = locations.find((item) => item.id === id); if (!entity) return;
              await run(async () => { await repository.softDeleteEntity(id); remember('map', { label: `擦除“${entity.title}”`, steps: [{ action: 'restore', entityId: id }] }); setStatus(`已擦除“${entity.title}”，可立即撤回。`); });
            }}
            onDeleteMany={async (ids) => {
              const targets = locations.filter((item) => ids.includes(item.id)); if (!targets.length) return;
              await run(async () => { for (const entity of targets) await repository.softDeleteEntity(entity.id); remember('map', { label: `橡皮擦连续擦除 ${targets.length} 项`, steps: targets.map((entity) => ({ action: 'restore' as const, entityId: entity.id })) }); setStatus(`橡皮擦已连续擦除 ${targets.length} 项，可一次撤回整笔操作。`); });
            }}
            onMerge={async (sourceId, targetId) => {
              const source = locations.find((item) => item.id === sourceId); const target = locations.find((item) => item.id === targetId); if (!source || !target) return;
              await run(async () => { await repository.saveEntity(workId, { id: target.id, kind: target.kind, title: target.title, summary: target.summary, fields: { ...target.fields, scale: Math.min(2.4, fieldNumber(target, 'scale', 1) + .25), mergedFrom: [...fieldStrings(target, 'mergedFrom'), source.id] } }); await repository.softDeleteEntity(source.id); remember('map', { label: `融合“${source.title}”与“${target.title}”`, steps: [{ action: 'update', entityId: target.id, before: target }, { action: 'restore', entityId: source.id }] }); setStatus('同类贴图已融合；源贴图保留在回收站，可撤回。'); });
            }}
            onUpdate={async (id, patch) => {
              const entity = locations.find((item) => item.id === id); if (!entity) return;
              const { title: nextTitle, ...fieldPatch } = patch;
              await run(async () => { await repository.saveEntity(workId, { id: entity.id, kind: entity.kind, title: nextTitle ?? entity.title, summary: entity.summary, fields: { ...entity.fields, ...fieldPatch } }); remember('map', { label: `调整“${entity.title}”`, steps: [{ action: 'update', entityId: entity.id, before: entity }] }); setStatus(`已调整“${entity.title}”。`); });
            }}
            readOnly={readOnly}
          />
          <details className="visual-editor-details"><summary>精确地点与区域参数</summary>
          <div className="visual-form-grid compact">
            <label><span>显示图层</span><select onChange={(event) => setActiveLayer(event.target.value)} value={activeLayer}>{mapLayers.map((layer) => <option key={layer} value={layer}>{layer}</option>)}</select></label>
            <label><span>地点名</span><input onChange={(event) => setLocationForm((form) => ({ ...form, title: event.target.value }))} value={locationForm.title} /></label>
            <label><span>说明</span><input onChange={(event) => setLocationForm((form) => ({ ...form, summary: event.target.value }))} value={locationForm.summary} /></label>
            <label><span>图层</span><input onChange={(event) => setLocationForm((form) => ({ ...form, layer: event.target.value }))} value={locationForm.layer} /></label>
            <label><span>类型</span><select onChange={(event) => setLocationForm((form) => ({ ...form, markerType: event.target.value as 'node' | 'region' }))} value={locationForm.markerType}><option value="node">地点节点</option><option value="region">区域范围</option></select></label>
            <label><span>X坐标</span><input max={620} min={20} onChange={(event) => setLocationForm((form) => ({ ...form, x: Number(event.target.value) }))} type="number" value={locationForm.x} /></label>
            <label><span>Y坐标</span><input max={400} min={20} onChange={(event) => setLocationForm((form) => ({ ...form, y: Number(event.target.value) }))} type="number" value={locationForm.y} /></label>
            {locationForm.markerType === 'region' ? <><label><span>区域宽度</span><input max={360} min={84} onChange={(event) => setLocationForm((form) => ({ ...form, width: Number(event.target.value) }))} type="number" value={locationForm.width} /></label><label><span>区域高度</span><input max={240} min={40} onChange={(event) => setLocationForm((form) => ({ ...form, height: Number(event.target.value) }))} type="number" value={locationForm.height} /></label></> : null}
            <button disabled={busy || readOnly} onClick={() => void addLocation()} type="button">添加地点</button>
          </div>
          <div className="visual-form-grid route-form">
            <label><span>路线起点</span><select onChange={(event) => setRouteForm((form) => ({ ...form, fromId: event.target.value }))} value={routeForm.fromId}><option value="">请选择</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.title}</option>)}</select></label>
            <label><span>路线终点</span><select onChange={(event) => setRouteForm((form) => ({ ...form, toId: event.target.value }))} value={routeForm.toId}><option value="">请选择</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.title}</option>)}</select></label>
            <label><span>路线名称</span><input onChange={(event) => setRouteForm((form) => ({ ...form, label: event.target.value }))} value={routeForm.label} /></label>
            <label><span>路线图层</span><input onChange={(event) => setRouteForm((form) => ({ ...form, layer: event.target.value }))} value={routeForm.layer} /></label>
            <button disabled={busy || readOnly} onClick={() => void addRoute()} type="button">添加路线</button>
          </div>
          </details>
          <div className="map-svg-preview" dangerouslySetInnerHTML={{ __html: mapSvg }} />
          <button className="visual-export" onClick={() => downloadSvg(mapSvg, '作品地图.svg')} type="button">导出SVG</button>
        </div>
      ) : null}

      <p className="visual-status" role="status">{readOnly ? '当前作品权限为只读；可查看并导出图形，但不能保存设定。' : status}</p>
      {pendingClear ? <div aria-label="清空图示确认" aria-modal="true" className="visual-clear-dialog" role="dialog"><div><h2>确定清空{pendingClear === 'timeline' ? '时间线' : pendingClear === 'relationships' ? '人物关系图' : '地图内容'}？</h2><p>将把 {entitiesForClear(pendingClear).length} 项内容移入回收站，不会永久删除；本次操作完成后可用“撤回”整体恢复。</p><label><input checked={skipClearWarning} onChange={(event) => setSkipClearWarning(event.target.checked)} type="checkbox" />下次不再提醒（仍会保留撤回）</label><footer><button onClick={() => { setPendingClear(null); setSkipClearWarning(false); }} type="button">取消</button><button className="danger-button" onClick={() => void clearMode(pendingClear, skipClearWarning)} type="button">确认清空</button></footer></div></div> : null}
    </section>
  );
}
