'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';

type RichTextEditorProps = {
  chapterKey: string;
  content: string;
  onChange: (html: string, plainText: string) => void;
};

export function RichTextEditor({ chapterKey, content, onChange }: RichTextEditorProps) {
  const currentChapterKey = useRef(chapterKey);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }
      }),
      Placeholder.configure({ placeholder: '从这一行开始写。' })
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose-editor',
        'aria-label': '正文内容'
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.getHTML(), activeEditor.getText());
    }
  });

  useEffect(() => {
    if (!editor || currentChapterKey.current === chapterKey) return;
    currentChapterKey.current = chapterKey;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [chapterKey, content, editor]);

  if (!editor) return <div className="editor-loading">正在准备编辑器…</div>;

  return (
    <div className="rich-editor-shell">
      <div aria-label="编辑工具" className="editor-toolbar" role="toolbar">
        <button
          aria-label="加粗"
          className={editor.isActive('bold') ? 'is-active' : ''}
          onClick={() => editor.chain().focus().toggleBold().run()}
          type="button"
        >
          B
        </button>
        <button
          aria-label="斜体"
          className={editor.isActive('italic') ? 'is-active' : ''}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          type="button"
        >
          I
        </button>
        <button
          aria-label="二级标题"
          className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          type="button"
        >
          H
        </button>
        <span className="toolbar-divider" />
        <button aria-label="撤销" onClick={() => editor.chain().focus().undo().run()} type="button">↶</button>
        <button aria-label="重做" onClick={() => editor.chain().focus().redo().run()} type="button">↷</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
