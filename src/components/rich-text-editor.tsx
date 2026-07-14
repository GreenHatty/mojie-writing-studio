'use client';

import Placeholder from '@tiptap/extension-placeholder';
import { Extension, type JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import { validateSuggestionApplication, type EditorSelectionSnapshot } from '../lib/collaboration';

type RichTextEditorProps = {
  chapterKey: string;
  content: string | JSONContent;
  onChange: (html: string, plainText: string, canonicalContent: JSONContent) => void;
  highlightTerms?: string[];
};

type InsertTextEvent = CustomEvent<{ text: string }>;
type ApplySuggestionResult = { applied: boolean; reason?: string };
type ApplySuggestionEvent = CustomEvent<{
  chapterId: string;
  from: number;
  to: number;
  originalText: string;
  replacementText: string;
  result: ApplySuggestionResult;
}>;

function chapterIdFromKey(chapterKey: string): string {
  return chapterKey.replace(/-\d+$/u, '');
}

function dispatchEditorContext(chapterKey: string, editor: NonNullable<ReturnType<typeof useEditor>>): void {
  const chapterId = chapterIdFromKey(chapterKey);
  const selection = editor.state.selection;
  const from = selection.from;
  const to = selection.to;
  const text = editor.state.doc.textBetween(from, to, '\n');
  const depth = Math.max(0, selection.$from.depth);
  const paragraphStart = depth ? selection.$from.start(depth) : 0;
  const detail: EditorSelectionSnapshot = {
    chapterId,
    from,
    to,
    paragraphKey: `${chapterId}:${paragraphStart}`,
    text
  };
  window.dispatchEvent(new CustomEvent<EditorSelectionSnapshot>('mojie:editor-context', { detail }));
}

const entityHighlightKey = new PluginKey<{ terms: string[]; decorations: DecorationSet }>('entity-mentions');

function buildEntityDecorations(document: Parameters<typeof DecorationSet.create>[0], terms: string[]): DecorationSet {
  const decorations: Decoration[] = [];
  const uniqueTerms = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))].sort((left, right) => right.length - left.length).slice(0, 200);
  document.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    for (const term of uniqueTerms) {
      let offset = 0;
      while ((offset = node.text.indexOf(term, offset)) >= 0) {
        decorations.push(Decoration.inline(position + offset, position + offset + term.length, { class: 'entity-mention-highlight', 'data-entity-term': term }));
        offset += term.length;
      }
    }
  });
  return DecorationSet.create(document, decorations);
}

const EntityMentions = Extension.create({
  name: 'entityMentions',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: entityHighlightKey,
      state: {
        init: (_configuration, state) => ({ terms: [] as string[], decorations: DecorationSet.empty }),
        apply(transaction, previous) {
          const meta = transaction.getMeta(entityHighlightKey) as { terms?: string[] } | undefined;
          const terms = meta?.terms ?? previous.terms;
          return transaction.docChanged || meta ? { terms, decorations: buildEntityDecorations(transaction.doc, terms) } : previous;
        }
      },
      props: { decorations: (state) => entityHighlightKey.getState(state)?.decorations ?? null }
    })];
  }
});

export function RichTextEditor({ chapterKey, content, onChange, highlightTerms = [] }: RichTextEditorProps) {
  const currentChapterKey = useRef(chapterKey);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }
      }),
      Placeholder.configure({ placeholder: '从这一行开始写。' }),
      EntityMentions
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose-editor',
        'aria-label': '正文内容'
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.getHTML(), activeEditor.getText(), activeEditor.getJSON());
      dispatchEditorContext(currentChapterKey.current, activeEditor);
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      dispatchEditorContext(currentChapterKey.current, activeEditor);
    }
  });

  useEffect(() => {
    if (!editor || currentChapterKey.current === chapterKey) return;
    currentChapterKey.current = chapterKey;
    editor.commands.setContent(content, { emitUpdate: false });
    dispatchEditorContext(chapterKey, editor);
  }, [chapterKey, content, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(entityHighlightKey, { terms: highlightTerms }));
  }, [editor, highlightTerms]);

  useEffect(() => {
    if (!editor) return;
    dispatchEditorContext(chapterKey, editor);
    const insertText = (event: Event) => {
      const detail = (event as InsertTextEvent).detail;
      if (!detail?.text) return;
      editor.chain().focus().insertContent(detail.text).run();
    };
    const applySuggestion = (event: Event) => {
      const detail = (event as ApplySuggestionEvent).detail;
      if (!detail || detail.chapterId !== chapterIdFromKey(currentChapterKey.current)) return;
      const currentText = editor.state.doc.textBetween(detail.from, detail.to, '\n');
      const validation = validateSuggestionApplication(currentText, {
        text: detail.originalText,
        replacementText: detail.replacementText
      });
      detail.result.applied = validation.applied;
      detail.result.reason = validation.reason;
      if (!validation.applied) return;
      editor.chain().focus().insertContentAt({ from: detail.from, to: detail.to }, detail.replacementText).run();
      dispatchEditorContext(currentChapterKey.current, editor);
    };
    window.addEventListener('mojie:insert-text', insertText);
    window.addEventListener('mojie:apply-suggestion', applySuggestion);
    return () => {
      window.removeEventListener('mojie:insert-text', insertText);
      window.removeEventListener('mojie:apply-suggestion', applySuggestion);
    };
  }, [chapterKey, editor]);

  if (!editor) return <div className="editor-loading">正在准备编辑器…</div>;

  return (
    <div className="rich-editor-shell">
      <div aria-label="编辑工具" className="editor-toolbar" role="toolbar">
        <button aria-label="加粗" className={editor.isActive('bold') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleBold().run()} type="button">B</button>
        <button aria-label="斜体" className={editor.isActive('italic') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleItalic().run()} type="button">I</button>
        <button aria-label="删除线" className={editor.isActive('strike') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleStrike().run()} type="button">S</button>
        <span className="toolbar-divider" />
        <button aria-label="二级标题" className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} type="button">H2</button>
        <button aria-label="三级标题" className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} type="button">H3</button>
        <button aria-label="引用" className={editor.isActive('blockquote') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleBlockquote().run()} type="button">❝</button>
        <button aria-label="插入分隔线" onClick={() => editor.chain().focus().setHorizontalRule().run()} type="button">—</button>
        <span className="toolbar-divider" />
        <button aria-label="清除格式" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} type="button">Tx</button>
        <button aria-label="撤销" onClick={() => editor.chain().focus().undo().run()} type="button">↶</button>
        <button aria-label="重做" onClick={() => editor.chain().focus().redo().run()} type="button">↷</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
