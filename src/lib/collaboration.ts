export type EditorSelectionSnapshot = {
  chapterId: string;
  from: number;
  to: number;
  paragraphKey: string;
  text: string;
};

export type TextSuggestion = EditorSelectionSnapshot & {
  id: string;
  replacementText: string;
};

export type SuggestionApplication = {
  applied: boolean;
  reason?: 'empty-selection' | 'stale-anchor' | 'unchanged';
};

export function normalizeSelectionSnapshot(input: Partial<EditorSelectionSnapshot>): EditorSelectionSnapshot {
  const from = Math.max(0, Math.trunc(Number(input.from) || 0));
  const to = Math.max(from, Math.trunc(Number(input.to) || from));
  return {
    chapterId: String(input.chapterId || '').trim(),
    from,
    to,
    paragraphKey: String(input.paragraphKey || '').trim().slice(0, 240),
    text: String(input.text || '').slice(0, 8_000)
  };
}

export function validateSuggestionApplication(currentText: string, suggestion: Pick<TextSuggestion, 'text' | 'replacementText'>): SuggestionApplication {
  if (!suggestion.text) return { applied: false, reason: 'empty-selection' };
  if (currentText !== suggestion.text) return { applied: false, reason: 'stale-anchor' };
  if (suggestion.replacementText === suggestion.text) return { applied: false, reason: 'unchanged' };
  return { applied: true };
}

export function selectionPreview(text: string, maximum = 120): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized;
}
