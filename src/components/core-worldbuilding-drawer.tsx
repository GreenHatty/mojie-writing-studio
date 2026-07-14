'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../lib/api-client';
import {
  createCoreProjectEntity,
  deleteCoreProjectEntity,
  listCoreEntityReferences,
  listCoreProjectEntities,
  restoreCoreProjectEntity,
  updateCoreProjectEntity,
  type CoreEntityReference,
  type CoreProjectEntity,
  type CoreUser,
  type CoreWorkDirectory
} from '../lib/core-api';
import type { ProjectEntity, ProjectEntityKind, ProjectFieldValue } from '../lib/project-model';
import type { WritingRepository } from '../lib/repository';
import { VisualSettingsPanel } from './visual-settings-panel';

type ManageKind = 'outline' | 'chapter-plan' | 'character' | 'location' | 'faction' | 'world' | 'material';
type FieldDefinition = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'tags' | 'checkbox' | 'select'; options?: Array<{ value: string; label: string }>; referenceKind?: ProjectEntityKind; chapterSelect?: boolean };

const KIND_WORKFLOWS: Record<ManageKind, { question: string; steps: string[]; done: string[] }> = {
  outline: { question: '这条大纲如何把前一状态推到一个不可逆的新状态？', steps: ['先定卷末不可逆结果', '倒推阶段目标和必须付出的代价', '用“因为→所以→但是”连接节点', '给伏笔标注埋设与回收位置'], done: ['节点有行动者和选择', '后一节点由前一结果触发', '高潮使用前文已有资源'] },
  'chapter-plan': { question: '本章结束时，目标、信息、关系或风险至少哪一项发生变化？', steps: ['确定开场状态和本章目标', '安排阻力升级与中段转折', '写清主角主动选择', '用结果和余波生成下一章任务'], done: ['本章不是纯过场', '冲突双方目标相斥', '结尾钩子下一章可兑现'] },
  character: { question: '这个人物在压力下会反复做出什么选择，又会因此失去什么？', steps: ['分开外在欲望与内在需要', '写出错误信念和行为证据', '设计三次递增选择', '用例外行为证明弧光发生'], done: ['性格可从行为看出', '缺点会造成真实损失', '人物离开主角仍有目标'] },
  location: { question: '这个地点如何限制行动、制造冲突，并只能在这里发生关键情节？', steps: ['确定剧情功能', '设置进入与离开条件', '补足五感和社会秩序', '关联资源、路线和危险'], done: ['地点不是换名背景', '空间关系影响行动', '至少有一项独特资源或禁忌'] },
  faction: { question: '这个组织靠什么资源维持，又因什么内部裂缝可能改变立场？', steps: ['写公开目标与真实目标', '列资源、筹码和依赖', '拆分内部派系', '定义对外关系的交换条件'], done: ['组织有现实运转方式', '成员利益不完全一致', '关系变化由筹码触发'] },
  world: { question: '这条规则如何被普通人看见、被谁受益、又能被怎样钻空子？', steps: ['写规则的可观察结果', '写限制、代价和执行者', '提供正例与反例', '检查它对日常生活和剧情的影响'], done: ['规则可被场景验证', '例外不是临时补丁', '力量与经济社会互相影响'] },
  material: { question: '这条资料中什么是事实、什么待核实、将怎样转化为原创情节？', steps: ['记录来源和日期', '拆分事实、推测与争议', '交叉验证关键结论', '只保存必要摘要并写小说化用途'], done: ['来源可追溯', '不把推测写成事实', '能指向具体章节或设定用途'] }
};

const KIND_INFO: Array<{ kind: ManageKind; label: string; description: string; fields: FieldDefinition[] }> = [
  { kind: 'outline', label: '故事大纲', description: '管理总纲、主线、副线、分卷目标、伏笔线和人物弧光。', fields: [
    { key: 'outlineType', label: '大纲类型', type: 'select', options: ['故事总纲', '主线', '副线', '分卷大纲', '人物弧光', '感情线', '伏笔线'].map((value) => ({ value, label: value })) },
    { key: 'parentId', label: '上级节点', type: 'select', referenceKind: 'outline' },
    { key: 'status', label: '状态', type: 'select', options: ['构思中', '进行中', '已完成', '待调整'].map((value) => ({ value, label: value })) },
    { key: 'objective', label: '阶段目标（谁要在何时前完成什么）', type: 'textarea' },
    { key: 'obstacle', label: '阻力与利益冲突', type: 'textarea' },
    { key: 'choice', label: '关键选择与代价', type: 'textarea' },
    { key: 'outcome', label: '不可逆结果', type: 'textarea' },
    { key: 'causalNext', label: '该结果如何触发下一节点', type: 'textarea' },
    { key: 'setupPayoff', label: '伏笔：埋设 / 提醒 / 误导 / 回收章节', type: 'textarea' }
  ] },
  { kind: 'chapter-plan', label: '章节细纲', description: '把目标、冲突、信息增量、情绪变化与结尾钩子关联到章节。', fields: [
    { key: 'chapterId', label: '关联章节', type: 'select', chapterSelect: true },
    { key: 'viewpoint', label: '视角人物', type: 'select', referenceKind: 'character' },
    { key: 'locationId', label: '地点', type: 'select', referenceKind: 'location' },
    { key: 'objective', label: '本章目标', type: 'textarea' },
    { key: 'openingState', label: '开场状态（资源 / 信息 / 关系 / 风险）', type: 'textarea' },
    { key: 'conflict', label: '本章冲突', type: 'textarea' },
    { key: 'turningPoint', label: '中段转折：什么新事实迫使改变方案', type: 'textarea' },
    { key: 'choice', label: '主角主动选择与即时代价', type: 'textarea' },
    { key: 'informationGain', label: '信息增量', type: 'textarea' },
    { key: 'emotionChange', label: '情绪变化', type: 'textarea' },
    { key: 'foreshadowing', label: '埋设/回收伏笔', type: 'textarea' },
    { key: 'hook', label: '结尾钩子', type: 'textarea' },
    { key: 'endingState', label: '章末新状态与下一章首场行动', type: 'textarea' },
    { key: 'expectedWordCount', label: '预计字数', type: 'number' }
  ] },
  { kind: 'character', label: '人物卡', description: '记录别名、身份、欲望、弱点、秘密、口吻和成长轨迹。', fields: [
    { key: 'aliases', label: '别名（逗号或换行分隔）', type: 'tags' },
    { key: 'identity', label: '身份/职业', type: 'text' },
    { key: 'age', label: '年龄', type: 'number' },
    { key: 'birthDate', label: '出生日期/时间', type: 'text' },
    { key: 'deathAt', label: '死亡日期/时间（可空）', type: 'text' },
    { key: 'factionId', label: '所属势力', type: 'select', referenceKind: 'faction' },
    { key: 'appearance', label: '外貌', type: 'textarea' },
    { key: 'personality', label: '性格与说话方式', type: 'textarea' },
    { key: 'desire', label: '核心欲望', type: 'textarea' },
    { key: 'need', label: '真正需要但尚未意识到的改变', type: 'textarea' },
    { key: 'misbelief', label: '错误信念及其形成事件', type: 'textarea' },
    { key: 'fear', label: '恐惧与弱点', type: 'textarea' },
    { key: 'secret', label: '秘密', type: 'textarea' },
    { key: 'arc', label: '成长轨迹', type: 'textarea' },
    { key: 'pressureChoices', label: '三次递增压力下的选择', type: 'textarea' },
    { key: 'voiceSample', label: '口吻样本：同一件事他会怎样说', type: 'textarea' },
    { key: 'status', label: '当前状态', type: 'text' }
  ] },
  { kind: 'location', label: '地点卡', description: '记录区域、风俗、资源、交通以及地图坐标。', fields: [
    { key: 'aliases', label: '别名', type: 'tags' }, { key: 'region', label: '所属区域', type: 'text' },
    { key: 'locationType', label: '地理类型', type: 'text' }, { key: 'climate', label: '气候', type: 'text' },
    { key: 'storyFunction', label: '剧情功能：此处迫使人物做什么', type: 'textarea' },
    { key: 'sensorySignature', label: '五感标识与生活细节', type: 'textarea' },
    { key: 'accessRules', label: '进入、离开与通行限制', type: 'textarea' },
    { key: 'resources', label: '资源、危险与控制势力', type: 'textarea' }, { key: 'customs', label: '风俗、秩序与交通', type: 'textarea' },
    { key: 'layer', label: '地图图层', type: 'text' }, { key: 'markerType', label: '地图类型', type: 'select', options: [{ value: 'node', label: '地点节点' }, { value: 'region', label: '区域范围' }] },
    { key: 'x', label: '地图 X 坐标', type: 'number' }, { key: 'y', label: '地图 Y 坐标', type: 'number' },
    { key: 'width', label: '区域宽度', type: 'number' }, { key: 'height', label: '区域高度', type: 'number' }
  ] },
  { kind: 'faction', label: '势力卡', description: '记录组织目标、范围、资源、敌友与内部结构。', fields: [
    { key: 'factionType', label: '势力类型', type: 'text' }, { key: 'goal', label: '核心目标', type: 'textarea' },
    { key: 'publicGoal', label: '公开目标与形象', type: 'textarea' }, { key: 'hiddenGoal', label: '真实目标与底线', type: 'textarea' },
    { key: 'territory', label: '活动范围', type: 'textarea' }, { key: 'resources', label: '资源、筹码与依赖', type: 'textarea' },
    { key: 'internalSplit', label: '内部派系与利益裂缝', type: 'textarea' }, { key: 'rules', label: '决策结构与继承规则', type: 'textarea' }
  ] },
  { kind: 'world', label: '世界观', description: '拆分政治、经济、历法、力量、科技、法律和禁忌。', fields: [
    { key: 'category', label: '设定分类', type: 'select', options: ['世界层级', '政治', '经济', '货币', '历法', '力量体系', '职业', '科技', '交通', '法律', '宗教', '禁忌', '历史'].map((value) => ({ value, label: value })) },
    { key: 'rule', label: '核心规则：条件 → 结果', type: 'textarea' }, { key: 'limits', label: '限制、代价与执行者', type: 'textarea' },
    { key: 'dailyImpact', label: '对普通人日常与行业的影响', type: 'textarea' }, { key: 'beneficiaries', label: '受益者、受损者与权力结构', type: 'textarea' },
    { key: 'loophole', label: '已知漏洞与可验证例外', type: 'textarea' }, { key: 'examples', label: '正文正例 / 反例及关联章节', type: 'textarea' }
  ] },
  { kind: 'material', label: '素材库', description: '保存自己的摘要、来源、可信度和适用题材，不默认复制外部全文。', fields: [
    { key: 'category', label: '分类', type: 'text' }, { key: 'tags', label: '标签', type: 'tags' },
    { key: 'source', label: '来源记录', type: 'text' }, { key: 'sourceDate', label: '来源日期', type: 'text' },
    { key: 'confidence', label: '可信度', type: 'select', options: ['待核实', '一般', '较高', '权威来源'].map((value) => ({ value, label: value })) },
    { key: 'claim', label: '可核实事实', type: 'textarea' }, { key: 'uncertainty', label: '争议、推测与待核实点', type: 'textarea' },
    { key: 'content', label: '自己的摘要（不要复制外部全文）', type: 'textarea' }, { key: 'fictionUse', label: '小说化用途与关联情节', type: 'textarea' }
  ] }
];

function tags(value: string): string[] { return [...new Set(value.split(/[\n,，、]/u).map((item) => item.trim()).filter(Boolean))].slice(0, 1000); }
function fieldText(value: ProjectFieldValue | undefined): string { return Array.isArray(value) ? value.join('\n') : value == null ? '' : String(value); }
function toLegacyEntity(entity: CoreProjectEntity, ownerId: string): ProjectEntity { return { ...entity, ownerId }; }

export function CoreWorldbuildingDrawer({ directory, user, csrf, onClose }: { directory: CoreWorkDirectory; user: CoreUser; csrf: string; onClose(): void }) {
  const [tab, setTab] = useState<'manage' | 'visual'>('manage');
  const [kind, setKind] = useState<ManageKind>('outline');
  const [entities, setEntities] = useState<CoreProjectEntity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [fields, setFields] = useState<Record<string, ProjectFieldValue>>({});
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('正在读取作品设定…');
  const [pendingDelete, setPendingDelete] = useState<{ entity: CoreProjectEntity; references: CoreEntityReference[] } | null>(null);
  const selected = entities.find((entity) => entity.id === selectedId) ?? null;
  const currentInfo = KIND_INFO.find((item) => item.kind === kind)!;
  const currentWorkflow = KIND_WORKFLOWS[kind];
  const canEdit = directory.role === 'WORK_OWNER' || directory.role === 'EDITOR';

  async function refresh(showDeleted = includeDeleted) {
    const records = await listCoreProjectEntities(directory.id, { includeDeleted: showDeleted });
    setEntities(records); setStatus('');
    if (selectedId && !records.some((entity) => entity.id === selectedId)) setSelectedId(null);
  }

  useEffect(() => { let active = true; void listCoreProjectEntities(directory.id, { includeDeleted }).then((records) => { if (active) { setEntities(records); setStatus(''); } }).catch((error) => { if (active) setStatus(error instanceof Error ? error.message : '设定读取失败。'); }); return () => { active = false; }; }, [directory.id, includeDeleted]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  useEffect(() => {
    if (!selected) return;
    setKind(selected.kind as ManageKind); setTitle(selected.title); setSummary(selected.summary); setFields(selected.fields);
  }, [selected]);

  function clearForm(nextKind = kind) { setKind(nextKind); setSelectedId(null); setTitle(''); setSummary(''); setFields({}); setStatus(''); }
  function setField(key: string, value: ProjectFieldValue) { setFields((current) => ({ ...current, [key]: value })); }

  async function save() {
    if (!title.trim()) { setStatus('请填写名称。'); return; }
    setBusy(true);
    try {
      const entity = selected
        ? await updateCoreProjectEntity(directory.id, selected.id, { title, summary, fields }, csrf)
        : await createCoreProjectEntity(directory.id, { kind, title, summary, fields }, csrf);
      await refresh(); setSelectedId(entity.id); setStatus('设定已保存。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '保存失败。'); }
    finally { setBusy(false); }
  }

  async function beginDelete(entity: CoreProjectEntity) {
    setBusy(true);
    try { setPendingDelete({ entity, references: await listCoreEntityReferences(directory.id, entity.id) }); }
    catch (error) { setStatus(error instanceof Error ? error.message : '无法检查关联内容。'); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteCoreProjectEntity(directory.id, pendingDelete.entity.id, csrf, { reason: '用户从设定面板删除', confirmReferences: true });
      setPendingDelete(null); clearForm(); await refresh(); setStatus('已移入设定回收站。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '删除失败。'); }
    finally { setBusy(false); }
  }

  async function restore(entity: CoreProjectEntity) {
    setBusy(true);
    try { await restoreCoreProjectEntity(directory.id, entity.id, csrf); await refresh(); setStatus('设定已恢复。'); }
    catch (error) { setStatus(error instanceof Error ? error.message : '恢复失败。'); }
    finally { setBusy(false); }
  }

  const repository = useMemo<Pick<WritingRepository, 'listEntities' | 'saveEntity'>>(() => ({
    async listEntities(_workId, entityKind, options) { return (await listCoreProjectEntities(directory.id, { kind: entityKind, includeDeleted: options?.includeDeleted })).map((entity) => toLegacyEntity(entity, user.id)); },
    async saveEntity(_workId, input) {
      const saved = input.id
        ? await updateCoreProjectEntity(directory.id, input.id, { title: input.title, summary: input.summary, fields: input.fields }, csrf)
        : await createCoreProjectEntity(directory.id, { kind: input.kind, title: input.title, summary: input.summary, fields: input.fields }, csrf);
      return toLegacyEntity(saved, user.id);
    }
  }), [csrf, directory.id, user.id]);

  function optionsFor(definition: FieldDefinition): Array<{ value: string; label: string }> {
    if (definition.options) return definition.options;
    if (definition.chapterSelect) return directory.volumes.flatMap((volume) => volume.chapters.map((chapter) => ({ value: chapter.id, label: `${volume.title} / ${chapter.title}` })));
    if (definition.referenceKind) return entities.filter((entity) => !entity.deletedAt && entity.kind === definition.referenceKind && entity.id !== selectedId).map((entity) => ({ value: entity.id, label: entity.title }));
    return [];
  }

  return <div aria-label="大纲与世界设定" aria-modal="true" className="authoring-drawer-backdrop" role="dialog">
    <section className="authoring-drawer worldbuilding-drawer">
      <header><div><p className="eyebrow">当前作品 · {directory.title}</p><h1>大纲与世界设定</h1></div><button aria-label="关闭大纲与世界设定" onClick={onClose} type="button">×</button></header>
      <nav aria-label="设定栏目"><button aria-current={tab === 'manage' ? 'page' : undefined} onClick={() => setTab('manage')} type="button">资料与大纲</button><button aria-current={tab === 'visual' ? 'page' : undefined} onClick={() => setTab('visual')} type="button">时间线、关系图与地图</button></nav>
      <div className="authoring-drawer-body">
        {tab === 'visual' ? <VisualSettingsPanel chapters={directory.volumes.flatMap((volume) => volume.chapters.map((chapter) => ({ id: chapter.id, title: `${volume.title} / ${chapter.title}` })))} readOnly={!canEdit} repository={repository} workId={directory.id} /> : <div className="worldbuilding-workspace">
          <aside><div className="world-kind-tabs">{KIND_INFO.map((item) => <button aria-current={kind === item.kind ? 'page' : undefined} key={item.kind} onClick={() => clearForm(item.kind)} type="button">{item.label}</button>)}</div><label className="include-deleted"><input checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} type="checkbox" />显示回收站</label><button disabled={!canEdit} onClick={() => clearForm()} type="button">＋ 新建设定</button><ul>{entities.filter((entity) => entity.kind === kind).map((entity) => <li className={entity.id === selectedId ? 'is-active' : ''} key={entity.id}><button onClick={() => setSelectedId(entity.id)} type="button"><strong>{entity.title}</strong><small>{entity.deletedAt ? '回收站' : entity.summary || currentInfo.label}</small></button>{canEdit ? entity.deletedAt ? <button disabled={busy} onClick={() => void restore(entity)} type="button">恢复</button> : <button disabled={busy} onClick={() => void beginDelete(entity)} type="button">删除</button> : null}</li>)}</ul></aside>
          <main><div className="world-editor-heading"><div className="project-intro"><p className="eyebrow">{currentInfo.label}</p><p>{canEdit ? currentInfo.description : `只读权限 · ${currentInfo.description}`}</p></div><button disabled={!canEdit || busy || Boolean(selected?.deletedAt)} onClick={() => void save()} type="button">{busy ? '处理中…' : selected ? '保存修改' : '创建设定'}</button></div><section className="entity-workflow"><strong>{currentWorkflow.question}</strong><ol>{currentWorkflow.steps.map((step) => <li key={step}>{step}</li>)}</ol><details><summary>完成检查</summary><ul>{currentWorkflow.done.map((item) => <li key={item}>{item}</li>)}</ul></details></section><label><span>名称</span><input disabled={!canEdit} maxLength={120} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label><span>本卡结论摘要（先写结论，不写空泛介绍）</span><textarea disabled={!canEdit} maxLength={20000} onChange={(event) => setSummary(event.target.value)} value={summary} /></label><div className="entity-fields">{currentInfo.fields.map((definition) => {
            const value = fields[definition.key];
            if (definition.type === 'checkbox') return <label key={definition.key}><span>{definition.label}</span><input checked={value === true} disabled={!canEdit} onChange={(event) => setField(definition.key, event.target.checked)} type="checkbox" /></label>;
            if (definition.type === 'select') return <label key={definition.key}><span>{definition.label}</span><select disabled={!canEdit} onChange={(event) => setField(definition.key, event.target.value || null)} value={fieldText(value)}><option value="">未指定</option>{optionsFor(definition).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
            if (definition.type === 'textarea' || definition.type === 'tags') return <label key={definition.key}><span>{definition.label}</span><textarea disabled={!canEdit} onChange={(event) => setField(definition.key, definition.type === 'tags' ? tags(event.target.value) : event.target.value)} value={fieldText(value)} /></label>;
            return <label key={definition.key}><span>{definition.label}</span><input disabled={!canEdit} onChange={(event) => setField(definition.key, definition.type === 'number' ? (event.target.value ? Number(event.target.value) : null) : event.target.value)} type={definition.type === 'number' ? 'number' : 'text'} value={fieldText(value)} /></label>;
          })}</div><div className="project-form-footer"><span role="status">{status}</span></div></main>
        </div>}
      </div>
      <footer><span>{tab === 'visual' ? '自动检查只提示，不修改正文。SVG 导出在浏览器本地完成。' : '删除前会列出全部已知关联，不会级联删除。'}</span><button onClick={onClose} type="button">返回正文</button></footer>
    </section>
    {pendingDelete ? <div aria-label="删除关联确认" aria-modal="true" className="entity-delete-dialog" role="dialog"><h2>删除“{pendingDelete.entity.title}”？</h2>{pendingDelete.references.length ? <><p>以下内容仍引用该设定，删除只会移入回收站，不会修改这些引用：</p><ul>{pendingDelete.references.map((reference) => <li key={`${reference.id}-${reference.field}`}>{reference.title}（{reference.kind} · {reference.field}）</li>)}</ul></> : <p>没有发现其他设定引用它。</p>}<div><button onClick={() => setPendingDelete(null)} type="button">取消</button><button disabled={busy} onClick={() => void confirmDelete()} type="button">确认移入回收站</button></div></div> : null}
  </div>;
}
