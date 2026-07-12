'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateNames, type NameCategory } from '../lib/name-generator';
import { findRepeatedPhrases, normalizeChinesePunctuation, type IssueSeverity, type TextIssue } from '../lib/text-tools';
import { inspectTextWithoutBlocking } from '../lib/text-worker-client';
import { countWritingCharacters } from '../lib/writing';
import { CalculatorPanel } from './calculator-panel';
import { FocusSprint } from './focus-sprint';
import { QuickPhrases } from './quick-phrases';
import { WritingAssistantPanel } from './writing-assistant-panel';

type ToolsPanelProps = {
  text: string;
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  error: '明确错误',
  warning: '高概率问题',
  suggestion: '风格建议',
  review: '需要核实'
};

const INSPECTION_OPTIONS = {
  sensitiveWords: [
    { term: '自杀', platform: '通用', severity: 'review' as const },
    { term: '赌博', platform: '通用', severity: 'review' as const }
  ],
  overusedWords: ['然后', '突然', '不由得']
};

const NAME_CATEGORIES: NameCategory[] = [
  '现代中文姓名',
  '古代中文姓名',
  '宗门名',
  '城池名',
  '山川名',
  '功法名',
  '武器名',
  '丹药名',
  '组织名',
  '科幻代号'
];

export function ToolsPanel({ text }: ToolsPanelProps) {
  const [category, setCategory] = useState<NameCategory>('现代中文姓名');
  const [seed, setSeed] = useState(1);
  const [showNormalized, setShowNormalized] = useState(false);
  const [issues, setIssues] = useState<TextIssue[]>([]);
  const [checking, setChecking] = useState(false);
  const [inspectionMode, setInspectionMode] = useState<'worker' | 'inline'>('inline');

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    const delay = window.setTimeout(() => {
      void inspectTextWithoutBlocking(text, INSPECTION_OPTIONS).then((result) => {
        if (cancelled) return;
        setIssues(result.issues);
        setInspectionMode(result.mode);
        setChecking(false);
      }).catch(() => {
        if (!cancelled) setChecking(false);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(delay);
    };
  }, [text]);

  const repeatedPhrases = useMemo(
    () => findRepeatedPhrases(text, { minimumLength: 6, maximumLength: 12 }).slice(0, 8),
    [text]
  );
  const names = useMemo(() => generateNames({ category, count: 8, seed }), [category, seed]);
  const normalized = useMemo(() => normalizeChinesePunctuation(text), [text]);
  const wordCount = useMemo(() => countWritingCharacters(text), [text]);

  return (
    <section className="tools-panel">
      <WritingAssistantPanel text={text} />

      <div className="panel-section-heading">
        <div>
          <p className="eyebrow">文本检查</p>
          <h2>{checking ? '后台检查中…' : issues.length ? `${issues.length}项待检查` : '暂未发现问题'}</h2>
          <small>{inspectionMode === 'worker' ? '长文本已在后台线程处理' : '当前内容使用即时检查'}</small>
        </div>
        <button onClick={() => setShowNormalized((value) => !value)} type="button">
          {showNormalized ? '收起标点预览' : '标点规范预览'}
        </button>
      </div>
      {showNormalized ? (
        <div className="normalization-preview">
          <p>以下内容仅用于预览，不会自动覆盖正文。</p>
          <pre>{normalized || '当前章节暂无正文。'}</pre>
        </div>
      ) : null}
      {issues.length ? (
        <ul className="issue-list">
          {issues.slice(0, 30).map((issue) => (
            <li data-severity={issue.severity} key={issue.id}>
              <div>
                <strong>{SEVERITY_LABEL[issue.severity]}</strong>
                <span>{issue.message}</span>
              </div>
              <p>{issue.excerpt}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="context-empty">检查只提供建议，不会修改正文。</div>
      )}

      <section className="repetition-panel">
        <div className="panel-section-heading">
          <div>
            <p className="eyebrow">重复语句</p>
            <h2>{repeatedPhrases.length ? '高频相似片段' : '未发现明显重复'}</h2>
          </div>
        </div>
        {repeatedPhrases.length ? (
          <ul>
            {repeatedPhrases.map((match) => (
              <li key={`${match.phrase}-${match.occurrences[0]?.start ?? 0}`}>
                <strong>{match.phrase}</strong>
                <span>出现 {match.occurrences.length} 次</span>
              </li>
            ))}
          </ul>
        ) : <p>人物名、地名等专有词可在设定的“词典”中记录，后续高级检查可设为白名单。</p>}
      </section>

      <div className="name-generator">
        <div className="panel-section-heading">
          <div>
            <p className="eyebrow">随机取名</p>
            <h2>候选名称</h2>
          </div>
          <button onClick={() => setSeed((value) => value + 1)} type="button">换一批</button>
        </div>
        <label>
          <span>类别</span>
          <select onChange={(event) => setCategory(event.target.value as NameCategory)} value={category}>
            {NAME_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <ul className="name-list">
          {names.map((item) => (
            <li key={item.value}>
              <button
                aria-label={`复制名称：${item.value}`}
                onClick={() => void navigator.clipboard?.writeText(item.value)}
                title={item.meaning}
                type="button"
              >
                <strong>{item.value}</strong>
                <small>{item.meaning}</small>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <QuickPhrases />
      <CalculatorPanel />
      <FocusSprint currentWordCount={wordCount} />
    </section>
  );
}
