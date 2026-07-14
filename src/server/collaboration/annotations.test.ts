import { describe, expect, it } from 'vitest';
import { createAnnotationService, type AnnotationStore, type ChangeSuggestion, type ChapterComment, type PrivateChapterNote } from './annotations';

function memoryStore(): AnnotationStore {
  const notes: PrivateChapterNote[] = [];
  const comments: ChapterComment[] = [];
  const suggestions = new Map<string, ChangeSuggestion>();
  return {
    async savePrivateNote(note) { const index = notes.findIndex((item) => item.id === note.id); if (index >= 0) notes[index] = note; else notes.push(note); },
    async listPrivateNotes(workId, chapterId, authorId) { return notes.filter((note) => note.workId === workId && note.chapterId === chapterId && note.authorId === authorId); },
    async saveComment(comment) { comments.push(comment); },
    async listComments(workId, chapterId) { return comments.filter((comment) => comment.workId === workId && comment.chapterId === chapterId); },
    async saveSuggestion(suggestion) { suggestions.set(suggestion.id, suggestion); },
    async getSuggestion(id) { return suggestions.get(id) ?? null; },
    async listSuggestions(workId, chapterId) { return [...suggestions.values()].filter((suggestion) => suggestion.workId === workId && suggestion.chapterId === chapterId); }
  };
}

const access = {
  async canReadWork(userId: string) { return ['owner', 'editor', 'commenter', 'viewer'].includes(userId); },
  async canCommentWork(userId: string) { return ['owner', 'editor', 'commenter'].includes(userId); },
  async canEditWork(userId: string) { return ['owner', 'editor'].includes(userId); }
};

describe('separate annotation boundaries', () => {
  it('keeps private notes private while allowing shared comments to readers', async () => {
    const service = createAnnotationService(memoryStore(), access, () => '2026-07-13T00:00:00.000Z');
    await service.addPrivateNote({ userId: 'owner', workId: 'work-1', chapterId: 'chapter-1', body: '只给作者自己的备注' });
    await service.addComment({ userId: 'commenter', workId: 'work-1', chapterId: 'chapter-1', body: '协作批注' });
    await expect(service.listPrivateNotes({ userId: 'viewer', workId: 'work-1', chapterId: 'chapter-1' })).resolves.toEqual([]);
    await expect(service.listComments({ userId: 'viewer', workId: 'work-1', chapterId: 'chapter-1' })).resolves.toHaveLength(1);
  });

  it('lets commenters propose but only editors or owners review a change suggestion', async () => {
    const service = createAnnotationService(memoryStore(), access, () => '2026-07-13T00:00:00.000Z');
    const suggestion = await service.addSuggestion({ userId: 'commenter', workId: 'work-1', chapterId: 'chapter-1', anchorJson: '{"from":1,"to":2}', replacementContent: '建议替换文本' });
    await expect(service.reviewSuggestion({ userId: 'commenter', workId: 'work-1', suggestionId: suggestion.id, accept: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.reviewSuggestion({ userId: 'editor', workId: 'work-1', suggestionId: suggestion.id, accept: true })).resolves.toMatchObject({ status: 'ACCEPTED', handledBy: 'editor' });
  });
});
