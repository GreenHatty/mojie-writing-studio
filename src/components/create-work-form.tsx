'use client';

import { useState } from 'react';
import type { WorkKind } from '../lib/repository';

type CreateWorkFormProps = {
  busy?: boolean;
  onCreate: (input: { title: string; kind: WorkKind }) => void;
};

export function CreateWorkForm({ busy = false, onCreate }: CreateWorkFormProps) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<WorkKind>('long');

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({ title, kind });
  }

  return (
    <form className="create-work-form" onSubmit={submit}>
      <label>
        <span>作品名称</span>
        <input
          aria-label="作品名称"
          autoFocus
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="给这本作品起个名字"
          value={title}
        />
      </label>
      <label>
        <span>作品类型</span>
        <select aria-label="作品类型" onChange={(event) => setKind(event.target.value as WorkKind)} value={kind}>
          <option value="long">长篇小说</option>
          <option value="short">短篇小说</option>
          <option value="essay">随笔</option>
        </select>
      </label>
      <button disabled={busy} type="submit">
        {busy ? '正在创建…' : '创建并开始写作'}
      </button>
    </form>
  );
}
