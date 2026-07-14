export type ProfileSettingsDto = {
  theme: 'paper' | 'warm' | 'gray' | 'dark';
  fontSize: number;
  lineHeight: number;
  editorWidth: 'narrow' | 'comfortable' | 'wide';
  leftColumnWidth: number;
  rightColumnWidth: number;
  updatedAt: string;
};

const DEFAULTS: Omit<ProfileSettingsDto, 'updatedAt'> = {
  theme: 'paper',
  fontSize: 18,
  lineHeight: 1.9,
  editorWidth: 'comfortable',
  leftColumnWidth: 280,
  rightColumnWidth: 320
};

type SettingsRow = {
  theme: ProfileSettingsDto['theme'];
  font_size: number;
  line_height: number;
  editor_width: ProfileSettingsDto['editorWidth'];
  left_column_width: number;
  right_column_width: number;
  updated_at: string;
};

function map(row: SettingsRow): ProfileSettingsDto {
  return {
    theme: row.theme,
    fontSize: Number(row.font_size),
    lineHeight: Number(row.line_height),
    editorWidth: row.editor_width,
    leftColumnWidth: Number(row.left_column_width),
    rightColumnWidth: Number(row.right_column_width),
    updatedAt: row.updated_at
  };
}

export function defaultProfileSettings(now = new Date().toISOString()): ProfileSettingsDto {
  return { ...DEFAULTS, updatedAt: now };
}

export function createD1ProfileSettingsStore(database: D1Database) {
  return {
    async get(userId: string): Promise<ProfileSettingsDto> {
      const row = await database.prepare('SELECT theme, font_size, line_height, editor_width, left_column_width, right_column_width, updated_at FROM profile_settings WHERE user_id = ?')
        .bind(userId).first<SettingsRow>();
      return row ? map(row) : defaultProfileSettings();
    },
    async put(userId: string, input: Omit<ProfileSettingsDto, 'updatedAt'>): Promise<ProfileSettingsDto> {
      const updatedAt = new Date().toISOString();
      await database.prepare(`INSERT INTO profile_settings (user_id, theme, font_size, line_height, editor_width, left_column_width, right_column_width, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, font_size = excluded.font_size, line_height = excluded.line_height, editor_width = excluded.editor_width, left_column_width = excluded.left_column_width, right_column_width = excluded.right_column_width, updated_at = excluded.updated_at`)
        .bind(userId, input.theme, input.fontSize, input.lineHeight, input.editorWidth, input.leftColumnWidth, input.rightColumnWidth, updatedAt).run();
      return { ...input, updatedAt };
    }
  };
}
