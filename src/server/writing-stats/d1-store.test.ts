import { describe, expect, it } from 'vitest';
import { createD1WritingStatsStore } from './d1-store';

describe('writing stats store', () => {
  it('calculates today and a contiguous writing streak without exposing another user', async () => {
    const database = {
      prepare() { return { bind() { return { all: async () => ({ results: [
        { date: '2026-07-13', added_characters: 600 },
        { date: '2026-07-12', added_characters: 20 },
        { date: '2026-07-10', added_characters: 999 }
      ] }) }; } }; }
    } as unknown as D1Database;
    await expect(createD1WritingStatsStore(database, () => new Date('2026-07-13T10:00:00Z')).get('writer')).resolves.toEqual({ date: '2026-07-13', addedCharacters: 600, streakDays: 2 });
  });
});
