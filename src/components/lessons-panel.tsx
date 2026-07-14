'use client';

import { useState } from 'react';
import { WRITING_LESSONS } from '../lib/lessons';
import { lessonClinic } from '../lib/lesson-clinics';

export function LessonsPanel() {
  const [selectedId, setSelectedId] = useState(WRITING_LESSONS[0]?.id ?? '');
  const selected = WRITING_LESSONS.find((lesson) => lesson.id === selectedId) ?? WRITING_LESSONS[0];

  if (!selected) return <div className="context-empty">暂无课程。</div>;

  const clinic = lessonClinic(selected);

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
        <p className="lesson-outcome"><strong>学完能做到：</strong>{clinic.outcome}</p>
        <section><h3>操作步骤</h3><ol>{clinic.procedure.map((item) => <li key={item}>{item}</li>)}</ol></section>
        <section className="lesson-diagnosis"><h3>先诊断自己的稿子</h3><ul>{clinic.diagnosis.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="lesson-example"><h3>带批注的改写示范</h3><div><strong>修改前</strong><p>{clinic.before}</p></div><div><strong>修改后</strong><p>{clinic.after}</p></div><p><strong>为什么有效：</strong>{clinic.whyItWorks}</p></section>
        <section className="lesson-assignment"><h3>直接用于当前作品</h3><p>{clinic.assignment}</p><strong>完成标准</strong><ul>{clinic.acceptance.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </article>
    </section>
  );
}
