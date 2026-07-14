'use client';

import { useEffect, useMemo, useState } from 'react';
import type { UserDraftStore } from '../lib/offline/draft-store';
import { buildPlanningCard, type PlanningCard, type WritingTemplate } from '../lib/templates';
import type { InspectTextOptions } from '../lib/text-tools';
import type { CoreWorkDirectory } from '../lib/core-api';
import { CoreFilePanel } from './core-file-panel';
import { LessonsPanel } from './lessons-panel';
import type { Phrase, QuickPhraseStore } from './quick-phrases';
import { TemplateLibrary } from './template-library';
import { ToolsPanel } from './tools-panel';

type DrawerTab = 'templates' | 'planning' | 'checks' | 'lessons' | 'files';
type ToolSettings = { sensitiveWords: string[]; whitelist: string[]; overusedWords: string[] };
const DEFAULT_TOOL_SETTINGS: ToolSettings = { sensitiveWords: ['自杀', '赌博'], whitelist: [], overusedWords: ['然后', '突然', '不由得'] };

function parseTerms(value: string): string[] {
  return [...new Set(value.split(/[\n,，、]/u).map((item) => item.trim()).filter(Boolean))].slice(0, 500);
}

export function CoreAuthoringDrawer({ directory, userId, csrf, text, draftStore, onClose, onImported }: { directory: CoreWorkDirectory; userId: string; csrf: string; text: string; draftStore: UserDraftStore; onClose(): void; onImported(workId: string, chapterId?: string): Promise<void> | void }) {
  const [tab, setTab] = useState<DrawerTab>('templates');
  const [planningCard, setPlanningCard] = useState<PlanningCard | null>(null);
  const [toolSettings, setToolSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      draftStore.getSetting<PlanningCard>(`planning-card:${directory.id}`),
      draftStore.getSetting<ToolSettings>('writing-tool-settings')
    ]).then(([card, settings]) => {
      if (!active) return;
      if (card) setPlanningCard(card);
      if (settings) setToolSettings({ ...DEFAULT_TOOL_SETTINGS, ...settings });
    }).catch(() => { if (active) setStatus('本机写作工具设置暂时无法读取。'); });
    return () => { active = false; };
  }, [directory.id, draftStore]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const inspectionOptions = useMemo<InspectTextOptions>(() => ({
    sensitiveWords: toolSettings.sensitiveWords.map((term) => ({ term, platform: '用户词典', severity: 'review' as const })),
    whitelist: toolSettings.whitelist,
    overusedWords: toolSettings.overusedWords
  }), [toolSettings]);

  const phraseStore = useMemo<QuickPhraseStore>(() => ({
    load: () => draftStore.getSetting<Phrase[]>('quick-phrases'),
    async save(phrases) { await draftStore.saveSetting('quick-phrases', phrases); }
  }), [draftStore]);

  async function useTemplate(template: WritingTemplate) {
    const card = buildPlanningCard(template, template.elements);
    setPlanningCard(card); setTab('planning');
    try {
      await draftStore.saveSetting(`planning-card:${directory.id}`, card);
      setStatus(`已为当前作品建立“${template.name}”策划卡；没有生成正文。`);
    } catch {
      setStatus('策划卡已保留在当前页面，但本机加密保存失败，请稍后重试。');
    }
  }

  async function savePlanning(card = planningCard) {
    if (!card) return;
    try {
      await draftStore.saveSetting(`planning-card:${directory.id}`, card);
      setStatus('策划卡已保存到当前账号的本机加密空间。');
    } catch {
      setStatus('策划卡保存失败，当前页面内容仍保留，请重试。');
    }
  }

  async function saveToolSettings(next = toolSettings) {
    try {
      await draftStore.saveSetting('writing-tool-settings', next);
      setStatus('检查词典已保存到当前账号的本机加密空间。');
    } catch {
      setStatus('检查词典保存失败，当前页面设置仍保留，请重试。');
    }
  }

  return <div aria-label="写作工具箱" aria-modal="true" className="authoring-drawer-backdrop" role="dialog">
    <section className="authoring-drawer">
      <header><div><p className="eyebrow">当前作品 · {directory.title}</p><h1>写作工具箱</h1></div><button aria-label="关闭写作工具箱" onClick={onClose} type="button">×</button></header>
      <nav aria-label="工具箱栏目">
        {([['templates', '模板'], ['planning', '策划卡'], ['checks', '检查与工具'], ['lessons', '写作课堂'], ['files', '文件与备份']] as Array<[DrawerTab, string]>).map(([id, label]) => <button aria-current={tab === id ? 'page' : undefined} key={id} onClick={() => setTab(id)} type="button">{label}</button>)}
      </nav>
      <div className="authoring-drawer-body">
        {tab === 'templates' ? <TemplateLibrary onUseTemplate={(template) => void useTemplate(template)} /> : null}
        {tab === 'planning' ? planningCard ? <section className="planning-card-editor"><div className="panel-section-heading"><div><p className="eyebrow">{planningCard.templateName}</p><h2>可编辑策划卡</h2></div><button onClick={() => void savePlanning()} type="button">保存策划卡</button></div><p>这些字段是大纲骨架，不会自动写入正文。</p>{planningCard.sections.map((section, index) => <label key={section.key}><span>{section.title}</span><small>{section.prompt}</small><textarea onBlur={() => void savePlanning()} onChange={(event) => setPlanningCard((current) => current ? { ...current, sections: current.sections.map((item, currentIndex) => currentIndex === index ? { ...item, value: event.target.value } : item) } : current)} placeholder="填写你的设定" value={section.value} /></label>)}</section> : <div className="context-empty">先从“模板”选择一份结构，系统会建立可编辑策划卡，不生成完整正文。</div> : null}
        {tab === 'checks' ? <section className="core-checks-workspace"><details><summary>用户词典与白名单</summary><div className="dictionary-grid"><label><span>自定义敏感词（每行一个）</span><textarea onBlur={() => void saveToolSettings()} onChange={(event) => setToolSettings((current) => ({ ...current, sensitiveWords: parseTerms(event.target.value) }))} value={toolSettings.sensitiveWords.join('\n')} /></label><label><span>检查白名单（每行一个）</span><textarea onBlur={() => void saveToolSettings()} onChange={(event) => setToolSettings((current) => ({ ...current, whitelist: parseTerms(event.target.value) }))} value={toolSettings.whitelist.join('\n')} /></label><label><span>高频关注词（每行一个）</span><textarea onBlur={() => void saveToolSettings()} onChange={(event) => setToolSettings((current) => ({ ...current, overusedWords: parseTerms(event.target.value) }))} value={toolSettings.overusedWords.join('\n')} /></label></div></details><ToolsPanel inspectionOptions={inspectionOptions} phraseStore={phraseStore} text={text} /></section> : null}
        {tab === 'lessons' ? <LessonsPanel /> : null}
        {tab === 'files' ? <CoreFilePanel csrf={csrf} directory={directory} onImported={onImported} userId={userId} /> : null}
      </div>
      <footer><span role="status">{status}</span><button onClick={onClose} type="button">返回正文</button></footer>
    </section>
  </div>;
}
