export type WritingStatsDto = { date: string; addedCharacters: number; streakDays: number };

function isoDate(value: Date): string { return value.toISOString().slice(0, 10); }
function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return isoDate(date);
}

export function createD1WritingStatsStore(database: D1Database, now = () => new Date()) {
  return {
    async get(userId: string): Promise<WritingStatsDto> {
      const date = isoDate(now());
      const rows = await database.prepare('SELECT date, added_characters FROM writing_sessions WHERE user_id = ? AND added_characters > 0 ORDER BY date DESC LIMIT 366')
        .bind(userId).all<{ date: string; added_characters: number }>();
      const activeDates = new Set(rows.results.map((row) => row.date));
      let cursor = date;
      let streakDays = 0;
      while (activeDates.has(cursor)) { streakDays += 1; cursor = previousDate(cursor); }
      const today = rows.results.find((row) => row.date === date);
      return { date, addedCharacters: Number(today?.added_characters ?? 0), streakDays };
    }
  };
}
