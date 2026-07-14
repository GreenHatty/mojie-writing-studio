'use client';

import { useEffect, useState } from 'react';

export type Phrase = { id: string; shortcut: string; text: string };
export type QuickPhraseStore = { load(): Promise<Phrase[] | null>; save(phrases: Phrase[]): Promise<void> };

const STORAGE_KEY = 'mojie:quick-phrases:v1';
const DEFAULT_PHRASES: Phrase[] = [
  { id: 'default-time', shortcut: '/次日', text: '次日清晨，' },
  { id: 'default-scene', shortcut: '/转场', text: '\n***\n' },
  { id: 'default-system', shortcut: '/系统', text: '【系统提示：】' }
];

function readPhrases(): Phrase[] {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return DEFAULT_PHRASES;
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_PHRASES;
    return parsed.filter((item): item is Phrase => Boolean(
      item && typeof item === 'object' &&
      typeof (item as Phrase).id === 'string' &&
      typeof (item as Phrase).shortcut === 'string' &&
      typeof (item as Phrase).text === 'string'
    ));
  } catch {
    return DEFAULT_PHRASES;
  }
}

export function QuickPhrases({ store }: { store?: QuickPhraseStore } = {}) {
  const [phrases, setPhrases] = useState<Phrase[]>(DEFAULT_PHRASES);
  const [shortcut, setShortcut] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    let active = true;
    if (!store) { setPhrases(readPhrases()); return () => { active = false; }; }
    void store.load().then((value) => { if (active && value) setPhrases(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [store]);

  function persist(next: Phrase[]) {
    setPhrases(next);
    if (store) { void store.save(next).catch(() => undefined); return; }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Local storage is optional; the current session still works.
    }
  }

  function addPhrase() {
    const cleanText = text.trim();
    const cleanShortcut = shortcut.trim();
    if (!cleanText || !cleanShortcut) return;
    const next = [
      ...phrases.filter((phrase) => phrase.shortcut !== cleanShortcut),
      { id: crypto.randomUUID(), shortcut: cleanShortcut, text: cleanText }
    ];
    persist(next);
    setShortcut('');
    setText('');
  }

  function insertPhrase(phrase: Phrase) {
    window.dispatchEvent(new CustomEvent('mojie:insert-text', { detail: { text: phrase.text } }));
  }

  return (
    <section className="quick-phrases">
      <div className="panel-section-heading">
        <div>
          <p className="eyebrow">快捷录入</p>
          <h2>短语与时间表达</h2>
        </div>
      </div>
      <div className="phrase-form">
        <input aria-label="快捷词缩写" onChange={(event) => setShortcut(event.target.value)} placeholder="如 /次日" value={shortcut} />
        <textarea aria-label="快捷词内容" onChange={(event) => setText(event.target.value)} placeholder="要插入正文的内容" value={text} />
        <button disabled={!shortcut.trim() || !text.trim()} onClick={addPhrase} type="button">保存快捷词</button>
      </div>
      <ul>
        {phrases.map((phrase) => (
          <li key={phrase.id}>
            <button onClick={() => insertPhrase(phrase)} title={phrase.text} type="button">
              <strong>{phrase.shortcut}</strong>
              <span>{phrase.text}</span>
            </button>
            <button aria-label={`删除快捷词：${phrase.shortcut}`} onClick={() => persist(phrases.filter((item) => item.id !== phrase.id))} type="button">×</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
