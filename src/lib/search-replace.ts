export type SearchOptions = {
  caseSensitive?: boolean;
  regularExpression?: boolean;
  maximumMatches?: number;
};

export type TextMatch = {
  start: number;
  end: number;
  value: string;
  context: string;
};

function createPattern(query: string, options: SearchOptions, global = true): RegExp {
  if (!query) throw new Error('查找内容不能为空');
  const source = options.regularExpression ? query : query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  try {
    return new RegExp(source, `${global ? 'g' : ''}u${options.caseSensitive ? '' : 'i'}`);
  } catch {
    throw new Error('正则表达式无效');
  }
}

export function findTextMatches(text: string, query: string, options: SearchOptions = {}): TextMatch[] {
  const pattern = createPattern(query, options);
  const maximumMatches = Math.max(1, options.maximumMatches ?? 500);
  const matches: TextMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    if (!value) {
      pattern.lastIndex += 1;
      continue;
    }
    const start = match.index ?? 0;
    const end = start + value.length;
    matches.push({
      start,
      end,
      value,
      context: text.slice(Math.max(0, start - 24), Math.min(text.length, end + 36))
    });
    if (matches.length >= maximumMatches) break;
  }
  return matches;
}

export function replaceText(
  text: string,
  query: string,
  replacement: string,
  options: SearchOptions = {}
): { text: string; replacements: number } {
  const matches = findTextMatches(text, query, options);
  if (!matches.length) return { text, replacements: 0 };
  const pattern = createPattern(query, options);
  return {
    text: text.replace(pattern, replacement),
    replacements: matches.length
  };
}

export function replaceTextPreservingHtml(
  html: string,
  query: string,
  replacement: string,
  options: SearchOptions = {}
): { html: string; replacements: number } {
  const segments = html.split(/(<[^>]+>)/gu);
  let replacements = 0;
  const next = segments.map((segment) => {
    if (segment.startsWith('<') && segment.endsWith('>')) return segment;
    const result = replaceText(segment, query, replacement, options);
    replacements += result.replacements;
    return result.text;
  });
  return { html: next.join(''), replacements };
}
