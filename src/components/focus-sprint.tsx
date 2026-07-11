'use client';

import { useEffect, useMemo, useState } from 'react';

type FocusSprintProps = {
  currentWordCount: number;
};

type SprintState = 'idle' | 'active' | 'completed' | 'exited';

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function FocusSprint({ currentWordCount }: FocusSprintProps) {
  const [minutes, setMinutes] = useState(25);
  const [targetWords, setTargetWords] = useState(500);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [startWordCount, setStartWordCount] = useState(currentWordCount);
  const [state, setState] = useState<SprintState>('idle');
  const addedWords = Math.max(0, currentWordCount - startWordCount);
  const wordProgress = targetWords > 0 ? Math.min(100, Math.round((addedWords / targetWords) * 100)) : 0;

  useEffect(() => {
    if (state !== 'active') return;
    if (targetWords > 0 && addedWords >= targetWords) {
      setState('completed');
      return;
    }
    if (remainingSeconds <= 0) {
      setState('completed');
      return;
    }
    const timer = window.setInterval(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [addedWords, remainingSeconds, state, targetWords]);

  const statusText = useMemo(() => {
    if (state === 'completed') return '本次写作冲刺已完成。';
    if (state === 'exited') return '已安全退出，正文和草稿不会受影响。';
    if (state === 'active') return `已新增 ${addedWords} 字，目标 ${targetWords} 字。`;
    return '可按时间、字数或双目标开始；浏览器无法绝对阻止关闭页面。';
  }, [addedWords, state, targetWords]);

  async function start() {
    setStartWordCount(currentWordCount);
    setRemainingSeconds(Math.max(1, minutes) * 60);
    setState('active');
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen is optional; the sprint still works without it.
    }
  }

  async function exit() {
    setState('exited');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Exiting fullscreen is best effort.
    }
  }

  return (
    <section className="focus-sprint">
      <div className="panel-section-heading">
        <div>
          <p className="eyebrow">小黑屋 / 写作冲刺</p>
          <h2>{state === 'active' ? formatTime(remainingSeconds) : '专注目标'}</h2>
        </div>
        {state === 'active' ? <button onClick={() => void exit()} type="button">紧急退出</button> : null}
      </div>
      {state !== 'active' ? (
        <div className="sprint-inputs">
          <label><span>分钟</span><input min={1} onChange={(event) => setMinutes(Math.max(1, Number(event.target.value) || 1))} type="number" value={minutes} /></label>
          <label><span>新增字数</span><input min={0} onChange={(event) => setTargetWords(Math.max(0, Number(event.target.value) || 0))} type="number" value={targetWords} /></label>
          <button onClick={() => void start()} type="button">开始冲刺</button>
        </div>
      ) : (
        <div className="sprint-progress">
          <progress max={100} value={wordProgress} />
          <span>{wordProgress}%</span>
        </div>
      )}
      <p>{statusText}</p>
    </section>
  );
}
