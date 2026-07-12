const PAIRS = [['“', '”'], ['‘', '’'], ['（', '）'], ['【', '】'], ['《', '》'], ['「', '」'], ['『', '』']];

function issueId(code, start, value) {
  return `${code}:${start}:${value}`;
}

function excerptAround(text, start, end) {
  return text.slice(Math.max(0, start - 12), Math.min(text.length, end + 12));
}

function pushOccurrences(issues, text, term, issue) {
  if (!term) return;
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(term, cursor);
    if (start < 0) break;
    const end = start + term.length;
    issues.push({ ...issue, id: issueId(issue.code, start, term), start, end, excerpt: excerptAround(text, start, end) });
    cursor = Math.max(end, start + 1);
  }
}

function inspectText(text, options = {}) {
  const issues = [];
  const whitelist = new Set(options.whitelist || []);

  for (const match of text.matchAll(/([。！？?!，,；;：:])\1+/gu)) {
    const value = match[0];
    const start = match.index || 0;
    issues.push({
      id: issueId('duplicate-punctuation', start, value), code: 'duplicate-punctuation',
      message: `发现连续重复标点“${value}”`, severity: 'error', start, end: start + value.length,
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
      id: issueId('unclosed-pair', start, `${opening}${closing}`), code: 'unclosed-pair',
      message: missingClosing ? `“${opening}”缺少对应的“${closing}”` : `“${closing}”缺少对应的“${opening}”`,
      severity: 'error', start, end: start + marker.length, excerpt: excerptAround(text, start, start + marker.length)
    });
  }

  for (const rule of options.sensitiveWords || []) {
    if (!rule.term || whitelist.has(rule.term)) continue;
    pushOccurrences(issues, text, rule.term, {
      code: 'sensitive-word', message: `“${rule.term}”需要按${rule.platform}规则人工复核`,
      severity: rule.severity, platform: rule.platform
    });
  }

  for (const word of options.overusedWords || []) {
    if (!word || whitelist.has(word)) continue;
    pushOccurrences(issues, text, `${word}${word}`, {
      code: 'repeated-word', message: `“${word}”疑似连续重复`, severity: 'warning'
    });
  }

  const threshold = Math.max(30, options.longSentenceThreshold || 90);
  let sentenceStart = 0;
  for (const match of text.matchAll(/[。！？!?\n]/gu)) {
    const end = (match.index || 0) + match[0].length;
    if (end - sentenceStart > threshold) {
      issues.push({
        id: issueId('long-sentence', sentenceStart, String(end)), code: 'long-sentence',
        message: `句子超过${threshold}个字符，建议检查可读性`, severity: 'suggestion',
        start: sentenceStart, end, excerpt: excerptAround(text, sentenceStart, end)
      });
    }
    sentenceStart = end;
  }

  for (const match of text.matchAll(/[,:;?!]/gu)) {
    const start = match.index || 0;
    issues.push({
      id: issueId('ascii-punctuation', start, match[0]), code: 'ascii-punctuation',
      message: `正文中包含半角标点“${match[0]}”`, severity: 'suggestion', start, end: start + 1,
      excerpt: excerptAround(text, start, start + 1)
    });
  }
  return issues.sort((left, right) => left.start - right.start || left.severity.localeCompare(right.severity));
}

self.addEventListener('message', (event) => {
  const { id, text, options } = event.data || {};
  try {
    self.postMessage({ id, issues: inspectText(String(text || ''), options || {}) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : '后台检查失败' });
  }
});
