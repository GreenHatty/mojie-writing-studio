'use client';

import { useState } from 'react';
import { WRITING_LESSONS } from '../lib/lessons';

export function LessonsPanel() {
  const [selectedId, setSelectedId] = useState(WRITING_LESSONS[0]?.id ?? '');
  const selected = WRITING_LESSONS.find((lesson) => lesson.id === selectedId) ?? WRITING_LESSONS[0];

  if (!selected) return <div className="context-empty">暂无课程。</div>;

  return (
    <section className="lessons-panel">
      <label>
        <span>写作课程</span>
        <select onChange={(event) => setSelectedId(event.target.value)} value={selected.id}>
          {WRITING_LESSONS.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
          ))}
        </select>
      </label>
      <article>
        <header>
          <div>
            <p className="eyebrow">{selected.difficulty} · {selected.genres.join(' / ')}</p>
            <h2>{selected.title}</h2>
          </div>
        </header>
        <p>{selected.summary}</p>
        <dl>
          <div><dt>常见错误</dt><dd>{selected.mistake}</dd></div>
          <div><dt>修改方式</dt><dd>{selected.revision}</dd></div>
          <div><dt>检查清单</dt><dd>{selected.checklist.join('；')}</dd></div>
          <div><dt>练习</dt><dd>{selected.exercise}</dd></div>
        </dl>
      </article>
    </section>
  );
}
