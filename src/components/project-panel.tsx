'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ProjectEntity, ProjectEntityKind } from '../lib/project-model';
import type { WritingRepository } from '../lib/repository';
import { ChapterPlanningPanel } from './chapter-planning-panel';
import { CollaborationPanel } from './collaboration-panel';
import { SearchReplacePanel } from './search-replace-panel';
import { VisualSettingsPanel } from './visual-settings-panel';

type ProjectPanelProps = { repository: WritingRepository; workId: string };

const ENTITY_TYPES: Array<{ kind: ProjectEntityKind; label: string; description: string }> = [
  { kind: 'outline', label: '大纲', description: '总纲、分卷目标、章节细纲与伏笔线' },
  { kind: 'character', label: '人物', description: '姓名、别名、性格、目标、秘密和成长轨迹' },
  { kind: 'location', label: '地点', description: '区域、气候、资源、势力、交通和相关事件' },
  { kind: 'timeline', label: '时间线', description: '事件时间、人物、地点与前后关系' },
  { kind: 'relationship', label: '关系', description: '亲属、爱情、敌对、上下级和合作关系' },
  { kind: 'world', label: '世界观', description: '政治、经济、力量、科技、法律和历法' },
  { kind: 'faction', label: '势力', description: '组织目标、资源、范围和人物归属' },
  { kind: 'material', label: '素材', description: '来源、摘要、可信度、标签和使用记录' },
  { kind: 'goal', label: '目标', description: '写作目标、截止日期和完成状态' },
  { kind: 'dictionary', label: '词典', description: '专有名词、快捷词、白名单和敏感词' }
];

function labelFor(kind: ProjectEntityKind): string {
  return ENTITY_TYPES.find((item) => item.kind === kind)?.label ?? kind;
}

export function ProjectPanel({ repository, workId }: ProjectPanelProps) {
  const [kind, setKind] = useState<ProjectEntityKind>('outline');
  const [entities, setEntities] = useState<ProjectEntity[]>([]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [showVisualTools, setShowVisualTools] = useState(false);
  const [showChapterPlan, setShowChapterPlan] = useState(true);

  const selected = useMemo(() => entities.find((entity) => entity.id === selectedId) ?? null, [entities, selectedId]);

  async function refresh(nextKind = kind, showDeleted = includeDeleted) {
    const records = await repository.listEntities(workId, nextKind, { includeDeleted: showDeleted });
    setEntities(records);
    if (selectedId && !records.some((entity) => entity.id === selectedId)) setSelectedId(null);
  }

  useEffect(() => {
    let cancelled = false;
    void repository.listEntities(workId, kind, { includeDeleted }).then((records) => {
      if (!cancelled) setEntities(records);
    });
    return () => { cancelled = true; };
  }, [includeDeleted, kind, repository, workId]);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    setSummary(selected.summary);
  }, [selected]);

  function changeKind(nextKind: ProjectEntityKind) {
    setKind(nextKind);
    setSelectedId(null);
    setTitle('');
    setSummary('');
    setStatus('');
  }

  function clearForm() {
    setSelectedId(null);
    setTitle('');
    setSummary('');
    setStatus('');
  }

  async function save() {
    if (!title.trim()) { setStatus('请先填写名称。'); return; }
    setBusy(true);
    try {
      const saved = await repository.saveEntity(workId, {
        id: selected?.id,
        kind,
        title,
        summary,
        fields: selected?.fields ?? {}
      });
      await refresh();
      setSelectedId(saved.id);
      setStatus('已保存。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function toggleDeleted(entity: ProjectEntity) {
    setBusy(true);
    try {
      if (entity.deletedAt) await repository.restoreEntity(entity.id);
      else await repository.softDeleteEntity(entity.id);
      await refresh();
      if (!includeDeleted) clearForm();
      setStatus(entity.deletedAt ? '已从回收站恢复。' : '已移入回收站。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '操作失败。');
    } finally {
      setBusy(false);
    }
  }

  const currentType = ENTITY_TYPES.find((item) => item.kind === kind) ?? ENTITY_TYPES[0]!;

  return (
    <section className="project-panel">
      <section className="chapter-plan-section">
        <button className="visual-tools-toggle" onClick={() => setShowChapterPlan((value) => !value)} type="button">{showChapterPlan ? '收起当前章节细纲' : '打开当前章节细纲'}</button>
        {showChapterPlan ? <ChapterPlanningPanel repository={repository} workId={workId} /> : null}
      </section>

      <div className="project-kind-tabs" aria-label="设定类型" role="tablist">
        {ENTITY_TYPES.map((item) => (
          <button aria-selected={kind === item.kind} key={item.kind} onClick={() => changeKind(item.kind)} role="tab" type="button">{item.label}</button>
        ))}
      </div>
      <div className="project-intro"><p className="eyebrow">{currentType.label}</p><p>{currentType.description}</p></div>
      <div className="project-list-actions">
        <button onClick={clearForm} type="button">新建{currentType.label}</button>
        <label><input checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} type="checkbox" />显示回收站</label>
      </div>
      {entities.length ? (
        <ul className="project-entity-list">
          {entities.map((entity) => (
            <li className={entity.id === selectedId ? 'is-active' : ''} key={entity.id}>
              <button onClick={() => setSelectedId(entity.id)} type="button"><strong>{entity.title}</strong><small>{entity.deletedAt ? '回收站' : labelFor(entity.kind)}</small></button>
              <button disabled={busy} onClick={() => void toggleDeleted(entity)} type="button">{entity.deletedAt ? '恢复' : '删除'}</button>
            </li>
          ))}
        </ul>
      ) : <div className="context-empty">尚无{currentType.label}记录。</div>}
      <div className="project-editor-form">
        <label><span>名称</span><input maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder={`输入${currentType.label}名称`} value={title} /></label>
        <label><span>摘要与重点</span><textarea onChange={(event) => setSummary(event.target.value)} placeholder={`记录${currentType.label}的核心信息、关联和待完善内容`} value={summary} /></label>
        <div className="project-form-footer"><span role="status">{status}</span><button disabled={busy} onClick={() => void save()} type="button">{busy ? '正在保存…' : '保存'}</button></div>
      </div>

      <CollaborationPanel workId={workId} />
      <SearchReplacePanel repository={repository} workId={workId} />
      <section className="visual-tools-section">
        <button className="visual-tools-toggle" onClick={() => setShowVisualTools((value) => !value)} type="button">{showVisualTools ? '收起时间线、关系图与地图' : '打开时间线、关系图与地图'}</button>
        {showVisualTools ? <VisualSettingsPanel repository={repository} workId={workId} /> : null}
      </section>
    </section>
  );
}
