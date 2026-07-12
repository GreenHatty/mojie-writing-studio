'use client';

import { useEffect, useState } from 'react';
import type { EditorSelectionSnapshot } from '../lib/collaboration';
import type { ProjectEntity } from '../lib/project-model';
import type { WritingRepository } from '../lib/repository';

type ChapterPlanningPanelProps = {
  repository: WritingRepository;
  workId: string;
};

type ChapterPlanForm = {
  title: string;
  status: string;
  viewpoint: string;
  time: string;
  location: string;
  characters: string;
  goal: string;
  conflict: string;
  informationGain: string;
  emotionChange: string;
  payoff: string;
  foreshadowing: string;
  recovery: string;
  endingHook: string;
  targetWords: number;
  color: string;
  locked: boolean;
  hidden: boolean;
};

const EMPTY_FORM: ChapterPlanForm = {
  title: '当前章节细纲',
  status: '构思中',
  viewpoint: '',
  time: '',
  location: '',
  characters: '',
  goal: '',
  conflict: '',
  informationGain: '',
  emotionChange: '',
  payoff: '',
  foreshadowing: '',
  recovery: '',
  endingHook: '',
  targetWords: 2000,
  color: '#8d6e63',
  locked: false,
  hidden: false
};

function stringField(entity: ProjectEntity, key: string): string {
  const value = entity.fields[key];
  return typeof value === 'string' ? value : '';
}

function booleanField(entity: ProjectEntity, key: string): boolean {
  return entity.fields[key] === true;
}

function numberField(entity: ProjectEntity, key: string, fallback: number): number {
  const value = entity.fields[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ChapterPlanningPanel({ repository, workId }: ChapterPlanningPanelProps) {
  const [chapterId, setChapterId] = useState('');
  const [entity, setEntity] = useState<ProjectEntity | null>(null);
  const [form, setForm] = useState<ChapterPlanForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const updateContext = (event: Event) => {
      const detail = (event as CustomEvent<EditorSelectionSnapshot>).detail;
      if (detail?.chapterId) setChapterId(detail.chapterId);
    };
    window.addEventListener('mojie:editor-context', updateContext);
    return () => window.removeEventListener('mojie:editor-context', updateContext);
  }, []);

  useEffect(() => {
    if (!chapterId) return;
    let cancelled = false;
    void repository.listEntities(workId, 'chapter-plan', { includeDeleted: true }).then((records) => {
      if (cancelled) return;
      const found = records.find((record) => record.fields.chapterId === chapterId && !record.deletedAt) ?? null;
      setEntity(found);
      if (!found) {
        setForm({ ...EMPTY_FORM });
        return;
      }
      setForm({
        title: found.title,
        status: stringField(found, 'status') || '构思中',
        viewpoint: stringField(found, 'viewpoint'),
        time: stringField(found, 'time'),
        location: stringField(found, 'location'),
        characters: stringField(found, 'characters'),
        goal: stringField(found, 'goal'),
        conflict: stringField(found, 'conflict'),
        informationGain: stringField(found, 'informationGain'),
        emotionChange: stringField(found, 'emotionChange'),
        payoff: stringField(found, 'payoff'),
        foreshadowing: stringField(found, 'foreshadowing'),
        recovery: stringField(found, 'recovery'),
        endingHook: stringField(found, 'endingHook'),
        targetWords: numberField(found, 'targetWords', 2000),
        color: stringField(found, 'color') || '#8d6e63',
        locked: booleanField(found, 'locked'),
        hidden: booleanField(found, 'hidden')
      });
    });
    return () => { cancelled = true; };
  }, [chapterId, repository, workId]);

  function update<K extends keyof ChapterPlanForm>(key: K, value: ChapterPlanForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!chapterId) {
      setStatus('请先点击正文，使系统定位当前章节。');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const saved = await repository.saveEntity(workId, {
        id: entity?.id,
        kind: 'chapter-plan',
        title: form.title || '当前章节细纲',
        summary: `${form.goal}${form.conflict ? `；冲突：${form.conflict}` : ''}`,
        fields: {
          chapterId,
          status: form.status,
          viewpoint: form.viewpoint,
          time: form.time,
          location: form.location,
          characters: form.characters,
          goal: form.goal,
          conflict: form.conflict,
          informationGain: form.informationGain,
          emotionChange: form.emotionChange,
          payoff: form.payoff,
          foreshadowing: form.foreshadowing,
          recovery: form.recovery,
          endingHook: form.endingHook,
          targetWords: form.targetWords,
          color: form.color,
          locked: form.locked,
          hidden: form.hidden
        }
      });
      setEntity(saved);
      setStatus('章节细纲已保存。模板更新不会覆盖该记录。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '章节细纲保存失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chapter-plan-panel">
      <div className="panel-section-heading"><div><p className="eyebrow">章节细纲</p><h2>{chapterId ? '当前章节策划卡' : '等待定位章节'}</h2></div><span className="chapter-plan-color" style={{ background: form.color }} /></div>
      <div className="chapter-plan-grid">
        <label className="span-two"><span>细纲名称</span><input onChange={(event) => update('title', event.target.value)} value={form.title} /></label>
        <label><span>章节状态</span><select onChange={(event) => update('status', event.target.value)} value={form.status}><option>构思中</option><option>草稿</option><option>初稿完成</option><option>修改中</option><option>待发布</option><option>已发布</option><option>暂停</option><option>废弃但保留</option></select></label>
        <label><span>目标字数</span><input min={0} onChange={(event) => update('targetWords', Math.max(0, Number(event.target.value) || 0))} type="number" value={form.targetWords} /></label>
        <label><span>视角人物</span><input onChange={(event) => update('viewpoint', event.target.value)} value={form.viewpoint} /></label>
        <label><span>时间</span><input onChange={(event) => update('time', event.target.value)} value={form.time} /></label>
        <label><span>地点</span><input onChange={(event) => update('location', event.target.value)} value={form.location} /></label>
        <label><span>出场人物</span><input onChange={(event) => update('characters', event.target.value)} value={form.characters} /></label>
        <label className="span-two"><span>本章目标</span><textarea onChange={(event) => update('goal', event.target.value)} value={form.goal} /></label>
        <label className="span-two"><span>本章冲突</span><textarea onChange={(event) => update('conflict', event.target.value)} value={form.conflict} /></label>
        <label><span>信息增量</span><textarea onChange={(event) => update('informationGain', event.target.value)} value={form.informationGain} /></label>
        <label><span>情绪变化</span><textarea onChange={(event) => update('emotionChange', event.target.value)} value={form.emotionChange} /></label>
        <label><span>爽点或虐点</span><textarea onChange={(event) => update('payoff', event.target.value)} value={form.payoff} /></label>
        <label><span>结尾钩子</span><textarea onChange={(event) => update('endingHook', event.target.value)} value={form.endingHook} /></label>
        <label><span>埋设伏笔</span><textarea onChange={(event) => update('foreshadowing', event.target.value)} value={form.foreshadowing} /></label>
        <label><span>回收伏笔</span><textarea onChange={(event) => update('recovery', event.target.value)} value={form.recovery} /></label>
        <label><span>章节颜色</span><input onChange={(event) => update('color', event.target.value)} type="color" value={form.color} /></label>
        <div className="chapter-plan-switches"><label><input checked={form.locked} onChange={(event) => update('locked', event.target.checked)} type="checkbox" />章节锁定标记</label><label><input checked={form.hidden} onChange={(event) => update('hidden', event.target.checked)} type="checkbox" />目录隐藏标记</label></div>
      </div>
      <div className="project-form-footer"><span role="status">{status}</span><button disabled={busy || !chapterId} onClick={() => void save()} type="button">{busy ? '正在保存…' : '保存章节细纲'}</button></div>
    </section>
  );
}
