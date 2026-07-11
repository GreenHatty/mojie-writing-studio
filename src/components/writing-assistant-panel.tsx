'use client';

import { useMemo, useState } from 'react';
import {
  analyzeChapterRhythm,
  buildScenePlan,
  createNovelBlurb,
  extractForeshadowingCandidates,
  generateEndingHooks,
  tightenChineseText
} from '../lib/writing-assistant';

type WritingAssistantPanelProps = {
  text: string;
};

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function WritingAssistantPanel({ text }: WritingAssistantPanelProps) {
  const analysis = useMemo(() => analyzeChapterRhythm(text), [text]);
  const foreshadowing = useMemo(() => extractForeshadowingCandidates(text), [text]);
  const tightened = useMemo(() => tightenChineseText(text), [text]);
  const [scene, setScene] = useState({ viewpoint: '', goal: '', conflict: '', reveal: '', consequence: '' });
  const [blurb, setBlurb] = useState({ protagonist: '', identity: '', goal: '', obstacle: '', mechanism: '', stakes: '' });
  const [hiddenInformation, setHiddenInformation] = useState('真正的敌人已经提前一步');
  const [status, setStatus] = useState('');
  const scenePlan = useMemo(() => buildScenePlan(scene), [scene]);
  const blurbText = useMemo(() => createNovelBlurb(blurb), [blurb]);
  const endingSentence = useMemo(() => text.split(/(?<=[。！？!?])\s*/u).filter(Boolean).at(-1) || '', [text]);
  const hooks = useMemo(() => generateEndingHooks(endingSentence, hiddenInformation), [endingSentence, hiddenInformation]);

  async function copy(value: string, label: string) {
    try {
      await copyText(value);
      setStatus(`${label}已复制，不会自动覆盖正文。`);
    } catch {
      setStatus('剪贴板权限不可用，请手动复制。');
    }
  }

  return (
    <section className="writing-assistant-panel">
      <div className="panel-section-heading"><div><p className="eyebrow">多功能写作辅助</p><h2>章节诊断与创作工作台</h2></div></div>

      <div className="rhythm-grid">
        <div><strong>{analysis.characterCount}</strong><span>有效字数</span></div>
        <div><strong>{analysis.averageSentenceLength}</strong><span>平均句长</span></div>
        <div><strong>{Math.round(analysis.dialogueRatio * 100)}%</strong><span>对话占比</span></div>
        <div><strong>{analysis.longSentenceCount}</strong><span>长句数量</span></div>
        <div><strong>{analysis.sceneBreakCount}</strong><span>转场标记</span></div>
        <div data-level={analysis.endingHook.level}><strong>{analysis.endingHook.level === 'strong' ? '强' : analysis.endingHook.level === 'medium' ? '中' : '弱'}</strong><span>结尾钩子</span></div>
      </div>
      <div className="assistant-suggestions">
        <strong>{analysis.endingHook.reason}</strong>
        {analysis.suggestions.length ? <ul>{analysis.suggestions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>当前章节节奏指标未发现明显失衡。</p>}
      </div>

      <details>
        <summary>场景八拍规划器</summary>
        <div className="assistant-form-grid">
          <label><span>视角人物</span><input onChange={(event) => setScene((value) => ({ ...value, viewpoint: event.target.value }))} value={scene.viewpoint} /></label>
          <label><span>本场景目标</span><input onChange={(event) => setScene((value) => ({ ...value, goal: event.target.value }))} value={scene.goal} /></label>
          <label><span>核心阻碍</span><input onChange={(event) => setScene((value) => ({ ...value, conflict: event.target.value }))} value={scene.conflict} /></label>
          <label><span>关键信息揭示</span><input onChange={(event) => setScene((value) => ({ ...value, reveal: event.target.value }))} value={scene.reveal} /></label>
          <label className="wide"><span>离场后果/下一章钩子</span><input onChange={(event) => setScene((value) => ({ ...value, consequence: event.target.value }))} value={scene.consequence} /></label>
        </div>
        <ol className="scene-plan-list">{scenePlan.map((beat) => <li key={beat}>{beat}</li>)}</ol>
        <button onClick={() => void copy(scenePlan.join('\n'), '场景规划')} type="button">复制场景规划</button>
      </details>

      <details>
        <summary>章节结尾钩子生成器</summary>
        <label className="assistant-wide-label"><span>准备揭示但尚未完全说明的信息</span><input onChange={(event) => setHiddenInformation(event.target.value)} value={hiddenInformation} /></label>
        <ul className="hook-list">{hooks.map((hook) => <li key={hook}><span>{hook}</span><button onClick={() => void copy(hook, '结尾钩子')} type="button">复制</button></li>)}</ul>
      </details>

      <details>
        <summary>作品简介生成器</summary>
        <div className="assistant-form-grid">
          <label><span>主角</span><input onChange={(event) => setBlurb((value) => ({ ...value, protagonist: event.target.value }))} value={blurb.protagonist} /></label>
          <label><span>身份</span><input onChange={(event) => setBlurb((value) => ({ ...value, identity: event.target.value }))} value={blurb.identity} /></label>
          <label><span>核心目标</span><input onChange={(event) => setBlurb((value) => ({ ...value, goal: event.target.value }))} value={blurb.goal} /></label>
          <label><span>主要阻碍</span><input onChange={(event) => setBlurb((value) => ({ ...value, obstacle: event.target.value }))} value={blurb.obstacle} /></label>
          <label><span>金手指/核心机制</span><input onChange={(event) => setBlurb((value) => ({ ...value, mechanism: event.target.value }))} value={blurb.mechanism} /></label>
          <label><span>失败代价</span><input onChange={(event) => setBlurb((value) => ({ ...value, stakes: event.target.value }))} value={blurb.stakes} /></label>
        </div>
        <textarea className="assistant-output" readOnly value={blurbText} />
        <button onClick={() => void copy(blurbText, '作品简介')} type="button">复制简介</button>
      </details>

      <details>
        <summary>保守精简预览</summary>
        <p>仅移除“不由得”“慢慢地”等常见冗余连接，不会自动替换正文。</p>
        <textarea className="assistant-output is-large" readOnly value={tightened || '当前章节暂无正文。'} />
        <button disabled={!text} onClick={() => void copy(tightened, '精简预览')} type="button">复制精简版本</button>
      </details>

      <details>
        <summary>潜在伏笔候选</summary>
        {foreshadowing.length ? <ul className="foreshadowing-list">{foreshadowing.map((item) => <li key={item}>{item}</li>)}</ul> : <p>未识别到明显的秘密、约定、未知信息或异常物件句。</p>}
      </details>
      <p className="assistant-status" role="status">{status}</p>
    </section>
  );
}
