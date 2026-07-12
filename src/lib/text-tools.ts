export type IssueSeverity = 'error' | 'warning' | 'suggestion' | 'review';

export type SensitiveWordRule = {
  term: string;
  platform: string;
  severity: IssueSeverity;
};

export type TextIssue = {
  id: string;
  code:
    | 'duplicate-punctuation'
    | 'unclosed-pair'
    | 'sensitive-word'
    | 'repeated-word'
    | 'long-sentence'
    | 'ascii-punctuation';
  message: string;
  severity: IssueSeverity;
  start: number;
  end: number;
  excerpt: string;
  platform?: string;
};

export type RepeatedPhrase = {
  phrase: string;
  occurrences: Array<{ start: number; end: number }>;
};

export type InspectTextOptions = {
  sensitiveWords?: SensitiveWordRule[];
  whitelist?: string[];
  overusedWords?: string[];
  longSentenceThreshold?: number;
};

export type RepeatedPhraseOptions = {
  minimumLength?: number;
  maximumLength?: number;
  ignoredTerms?: string[];
};

const PAIRS: Array<[string, string]> = [
  ['“', '”'],
  ['‘', '’'],
  ['（', '）'],
  ['【', '】'],
  ['《', '》'],
  ['「', '」'],
  ['『', '』']
];

function issueId(code: TextIssue['code'], start: number, value: string): string {
  return `${code}:${start}:${value}`;
}

function excerptAround(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 12), Math.min(text.length, end + 12));
}

function pushAllOccurrences(
  issues: TextIssue[],
  text: string,
  term: string,
  issue: Omit<TextIssue, 'id' | 'start' | 'end' | 'excerpt'>
): void {
  if (!term) return;
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(term, cursor);
    if (start < 0) break;
    const end = start + term.length;
    issues.push({
      ...issue,
      id: issueId(issue.code, start, term),
      start,
      end,
      excerpt: excerptAround(text, start, end)
    });
    cursor = Math.max(end, start + 1);
  }
}

export function normalizeChinesePunctuation(text: string): string {
  let quoteOpen = true;
  return text
    .replace(/\.{3,}/gu, '……')
    .replace(/"/gu, () => {
      const quote = quoteOpen ? '“' : '”';
      quoteOpen = !quoteOpen;
      return quote;
    })
    .replace(/,/gu, '，')
    .replace(/:/gu, '：')
    .replace(/;/gu, '；')
    .replace(/\?/gu, '？')
    .replace(/!/gu, '！');
}

function isUsablePhrase(value: string): boolean {
  if (!value.trim()) return false;
  if (/^[\p{P}\p{S}\s]+$/u.test(value)) return false;
  return !/[\r\n]/u.test(value);
}

export function findRepeatedPhrases(text: string, options: RepeatedPhraseOptions = {}): RepeatedPhrase[] {
  const minimumLength = Math.max(2, options.minimumLength ?? 6);
  const maximumLength = Math.max(minimumLength, Math.min(options.maximumLength ?? 12, 24));
  const ignoredTerms = new Set(options.ignoredTerms ?? []);
  const matches = new Map<string, Array<{ start: number; end: number }>>();
  const scanLimit = Math.min(text.length, 50_000);

  for (let length = minimumLength; length <= maximumLength; length += 1) {
    for (let start = 0; start + length <= scanLimit; start += 1) {
      const phrase = text.slice(start, start + length);
      if (!isUsablePhrase(phrase)) continue;
      if ([...ignoredTerms].some((term) => term && phrase.includes(term))) continue;
      const current = matches.get(phrase) ?? [];
      if (current.some((item) => item.start === start)) continue;
      current.push({ start, end: start + length });
      matches.set(phrase, current);
    }
  }

  return [...matches.entries()]
    .filter(([, occurrences]) => occurrences.length >= 2)
    .map(([phrase, occurrences]) => ({ phrase, occurrences }))
    .sort((left, right) => right.phrase.length - left.phrase.length || left.occurrences[0]!.start - right.occurrences[0]!.start);
}

export function inspectText(text: string, options: InspectTextOptions = {}): TextIssue[] {
  const issues: TextIssue[] = [];
  const whitelist = new Set(options.whitelist ?? []);

  for (const match of text.matchAll(/([。！？?!，,；;：:])\1+/gu)) {
    const value = match[0];
    const start = match.index ?? 0;
    issues.push({
      id: issueId('duplicate-punctuation', start, value),
      code: 'duplicate-punctuation',
      message: `发现连续重复标点“${value}”`,
      severity: 'error',
      start,
      end: start + value.length,
      excerpt: excerptAround(text, start, start + value.length)
    });
  }

  for (const [opening, closing] of PAIRS) {
    const openingCount = [...text].filter((character) => character === opening).length;
    const closingCount = [...text].filter((character) => character === closing).length;
    if (openingCount === closingCount) continue;
    const missingClosing = openingCount > closingCount;
    const marker = missingClosing ? opening : closing;
    const start = Math.max(0, text.lastIndexOf(marker));
    issues.push({
      id: issueId('unclosed-pair', start, `${opening}${closing}`),
      code: 'unclosed-pair',
      message: missingClosing ? `“${opening}”缺少对应的“${closing}”` : `“${closing}”缺少对应的“${opening}”`,
      severity: 'error',
      start,
      end: start + marker.length,
      excerpt: excerptAround(text, start, start + marker.length)
    });
  }

  for (const rule of options.sensitiveWords ?? []) {
    if (!rule.term || whitelist.has(rule.term)) continue;
    pushAllOccurrences(issues, text, rule.term, {
      code: 'sensitive-word',
      message: `“${rule.term}”需要按${rule.platform}规则人工复核`,
      severity: rule.severity,
      platform: rule.platform
    });
  }

  for (const word of options.overusedWords ?? []) {
    if (!word || whitelist.has(word)) continue;
    pushAllOccurrences(issues, text, `${word}${word}`, {
      code: 'repeated-word',
      message: `“${word}”疑似连续重复`,
      severity: 'warning'
    });
  }

  const threshold = Math.max(30, options.longSentenceThreshold ?? 90);
  let sentenceStart = 0;
  for (const match of text.matchAll(/[。！？!?\n]/gu)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end - sentenceStart > threshold) {
      issues.push({
        id: issueId('long-sentence', sentenceStart, String(end)),
        code: 'long-sentence',
        message: `句子超过${threshold}个字符，建议检查可读性`,
        severity: 'suggestion',
        start: sentenceStart,
        end,
        excerpt: excerptAround(text, sentenceStart, end)
      });
    }
    sentenceStart = end;
  }

  for (const match of text.matchAll(/[,:;?!]/gu)) {
    const start = match.index ?? 0;
    issues.push({
      id: issueId('ascii-punctuation', start, match[0]),
      code: 'ascii-punctuation',
      message: `正文中包含半角标点“${match[0]}”`,
      severity: 'suggestion',
      start,
      end: start + 1,
      excerpt: excerptAround(text, start, start + 1)
    });
  }

  return issues.sort((left, right) => left.start - right.start || left.severity.localeCompare(right.severity));
}
