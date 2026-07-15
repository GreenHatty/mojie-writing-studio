export type WebficFormattingMode = 'standard' | 'mobile';

export type WebficFormattingResult = {
  text: string;
  sourceParagraphs: number;
  formattedParagraphs: number;
  changed: boolean;
};

const HEADING = /^(?:第.{1,18}[章节卷回部篇]|卷[一二三四五六七八九十百千万\d]+|楔子|序章|尾声|番外)(?:\s|$)/u;
const DIALOGUE = /^(?:[“「『《〈]|—{2}|\.{3}|…{2})/u;

function sentencesOf(paragraph: string): string[] {
  const matches = paragraph.match(/[^。！？!?…]+(?:[。！？!?]+|…{2,})|[^。！？!?…]+$/gu);
  return (matches ?? [paragraph]).map((item) => item.trim()).filter(Boolean);
}

function splitParagraph(paragraph: string, mode: WebficFormattingMode): string[] {
  const normalized = paragraph.replace(/[\t\u00a0]+/gu, ' ').replace(/ {2,}/gu, ' ').trim();
  if (!normalized || HEADING.test(normalized) || DIALOGUE.test(normalized)) return normalized ? [normalized] : [];

  const sentences = sentencesOf(normalized);
  const maximumSentences = mode === 'mobile' ? 2 : 3;
  const targetCharacters = mode === 'mobile' ? 68 : 118;
  if (sentences.length <= maximumSentences && normalized.length <= targetCharacters) return [normalized];
  const result: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const wouldOverflow = current.length > 0 && (current.length >= maximumSentences || currentLength + sentence.length > targetCharacters);
    if (wouldOverflow) {
      result.push(current.join(''));
      current = [];
      currentLength = 0;
    }
    current.push(sentence);
    currentLength += sentence.length;
  }
  if (current.length) result.push(current.join(''));
  return result;
}

/**
 * Conservative web-fiction layout: collapse accidental blank runs and split only
 * overlong narration at existing Chinese sentence boundaries. It never invents,
 * rewrites or reorders prose, and leaves headings/dialogue-first paragraphs alone.
 */
export function formatWebficText(source: string, mode: WebficFormattingMode): WebficFormattingResult {
  const normalized = source.replace(/\r\n?/gu, '\n').replace(/[ \t]+\n/gu, '\n').trim();
  if (!normalized) return { text: '', sourceParagraphs: 0, formattedParagraphs: 0, changed: source.length > 0 };
  const sourceParagraphs = normalized.split(/\n+/u).map((item) => item.trim()).filter(Boolean);
  const formatted = sourceParagraphs.flatMap((paragraph) => splitParagraph(paragraph, mode));
  // Canonical conversion treats every line as one paragraph; use a single
  // separator so formatting does not insert visible empty paragraphs.
  const text = formatted.join('\n');
  return { text, sourceParagraphs: sourceParagraphs.length, formattedParagraphs: formatted.length, changed: text !== source };
}
