'use client';

import { useMemo, useState } from 'react';
import {
  WRITING_TEMPLATES,
  filterTemplates,
  type WritingTemplate,
  type TemplateAudience,
  type TemplateLength,
  type TemplatePlatform
} from '../lib/templates';
import { HelpTip } from './help-tip';

const ALL = '全部';

export function TemplateLibrary({ onUseTemplate }: { onUseTemplate?: (template: WritingTemplate) => void } = {}) {
  const [platform, setPlatform] = useState<TemplatePlatform | typeof ALL>(ALL);
  const [audience, setAudience] = useState<TemplateAudience | typeof ALL>(ALL);
  const [length, setLength] = useState<TemplateLength | typeof ALL>(ALL);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const templates = useMemo(
    () =>
      filterTemplates(WRITING_TEMPLATES, {
        platform: platform === ALL ? undefined : platform,
        audience: audience === ALL ? undefined : audience,
        length: length === ALL ? undefined : length,
        query
      }),
    [platform, audience, length, query]
  );

  return (
    <section className="template-library">
      <div className="template-filters">
        <label>
          <span>搜索</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="题材、元素或标签" value={query} />
        </label>
        <label>
          <span>平台</span>
          <select onChange={(event) => setPlatform(event.target.value as TemplatePlatform | typeof ALL)} value={platform}>
            <option>{ALL}</option>
            <option>起点</option>
            <option>番茄</option>
            <option>通用</option>
          </select>
        </label>
        <label>
          <span>读者</span>
          <select onChange={(event) => setAudience(event.target.value as TemplateAudience | typeof ALL)} value={audience}>
            <option>{ALL}</option>
            <option>男频</option>
            <option>女频</option>
            <option>不限</option>
          </select>
        </label>
        <label>
          <span>篇幅</span>
          <select onChange={(event) => setLength(event.target.value as TemplateLength | typeof ALL)} value={length}>
            <option>{ALL}</option>
            <option>长篇</option>
            <option>中短篇</option>
            <option>短故事</option>
          </select>
        </label>
      </div>
      <p className="template-count">共 {templates.length} 份原创结构模板。模板只提供方法，不生成对具体作品的仿写。</p>
      <div className="template-list">
        {templates.map((template) => {
          const expanded = expandedId === template.id;
          return (
            <article className="template-card" key={template.id}>
              <button aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : template.id)} type="button">
                <div>
                  <span>{template.platform} · {template.audience} · {template.length}</span>
                  <h2>{template.genre}</h2>
                  <p>{template.readingExpectation}</p>
                </div>
                <strong>{expanded ? '收起' : '查看'}</strong>
              </button>
              {expanded ? (
                <div className="template-detail">
                  <dl>
                    <div><dt>题材承诺</dt><dd>{template.definition}</dd></div>
                    <div><dt>一句话公式</dt><dd>{template.storyFormula}</dd></div>
                    <div><dt>故事发动机</dt><dd>{template.specialMechanism}</dd></div>
                    <div><dt>限制与代价</dt><dd>{template.mechanismLimits}</dd></div>
                    <div><dt>最低必要世界观</dt><dd>{template.minimumWorldbuilding.join('；')}</dd></div>
                    <div><dt>第一章</dt><dd>{template.firstChapter.join('；')}</dd></div>
                    <div><dt>前三章</dt><dd>{template.firstThreeChapters.join('；')}</dd></div>
                    <div><dt>前十章</dt><dd>{template.firstTenChapters.join('；')}</dd></div>
                    <div><dt>第一卷</dt><dd>{template.firstVolume.join('；')}</dd></div>
                    <div><dt>本题材情绪兑现</dt><dd>{template.emotionalPayoffs.join('；')}</dd></div>
                    <div><dt>常见问题</dt><dd>{template.commonMistakes.join('；')}</dd></div>
                    <div><dt>微创新</dt><dd>{template.innovationDirections.join('；')}</dd></div>
                  </dl>
                  <section className="template-success-example">
                    <header><div><span>从承诺到微创新的完整示例</span><h3>{template.successExample.caseTitle}</h3></div><HelpTip text="这是为当前题材原创整理的策划示范，用来展示模板怎样落到故事工程；不是对现有小说的仿写。" /></header>
                    <ol>
                      <li><strong>1. 题材承诺</strong><p>{template.successExample.genrePromise}</p></li>
                      <li><strong>2. 开篇验证</strong><p>{template.successExample.openingProof}</p></li>
                      <li><strong>3. 主角行动</strong><p>{template.successExample.protagonistAction}</p></li>
                      <li><strong>4. 机制与代价</strong><p>{template.successExample.mechanismAndCost}</p></li>
                      <li><strong>5. 第一阶段</strong><p>{template.successExample.firstArc}</p></li>
                      <li><strong>6. 爽点兑现</strong><p>{template.successExample.payoffProof}</p></li>
                      <li><strong>7. 微创新</strong><p>{template.successExample.microInnovation}</p></li>
                    </ol>
                    <p className="template-example-verdict"><strong>为什么成立：</strong>{template.successExample.whyItWorks}</p>
                  </section>
                  <footer>
                    <span>审核日期：{template.lastReviewedAt}</span>
                    <span>热度状态：{template.heatStatus}</span>
                    {onUseTemplate ? <button onClick={() => onUseTemplate(template)} type="button">用于当前作品</button> : null}
                  </footer>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
