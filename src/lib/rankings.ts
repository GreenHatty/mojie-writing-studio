export type RankingPlatform = '起点' | '番茄';

export type RankingItem = {
  id: string;
  date: string;
  platform: RankingPlatform;
  listName: string;
  category: string;
  rank: number;
  title: string;
  author: string;
  tags: string[];
  status: string;
  publicWordCount: number;
  blurb: string;
  publicUrl: string;
  importedAt: string;
  sourceStatus: 'manual-import';
};

export type SellingPointAnalysis = {
  titleStructure: string;
  blurbHook: string;
  protagonistIdentity: string;
  openingPredicament: string;
  coreMechanism: string;
  coreEmotion: string;
  tagCombination: string;
  firstThreeChapterTasks: string[];
  learnableStructure: string[];
  avoidCopying: string;
  confidence: '低' | '中' | '较高';
  disclaimer: string;
};

const CSV_HEADERS: Record<string, keyof Omit<RankingItem, 'id' | 'importedAt' | 'sourceStatus' | 'tags' | 'rank' | 'publicWordCount'>> = {
  日期: 'date',
  平台: 'platform',
  榜单: 'listName',
  分类: 'category',
  作品名: 'title',
  作者: 'author',
  状态: 'status',
  简介: 'blurb',
  链接: 'publicUrl'
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function asPlatform(value: unknown): RankingPlatform {
  if (value === '起点' || value === '番茄') return value;
  throw new Error('平台必须是“起点”或“番茄”');
}

function normalizeDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('日期格式必须为YYYY-MM-DD');
  return value;
}

function asText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少${label}`);
  return value.trim();
}

function asOptionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRank(value: unknown): number {
  const rank = Number(value);
  if (!Number.isInteger(rank) || rank < 1) throw new Error('排名必须是正整数');
  return rank;
}

function asWordCount(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeItem(value: unknown, importedAt: string): RankingItem {
  if (!value || typeof value !== 'object') throw new Error('榜单项目格式无效');
  const item = value as Record<string, unknown>;
  const tags = Array.isArray(item.tags)
    ? item.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
    : typeof item.tags === 'string'
      ? item.tags.split(/[|、;,，]/u).map((tag) => tag.trim()).filter(Boolean)
      : [];
  const title = asText(item.title, '作品名');
  const author = asText(item.author, '作者');
  const listName = asText(item.listName, '榜单名称');
  const date = normalizeDate(item.date);
  const platform = asPlatform(item.platform);
  const rank = asRank(item.rank);
  return {
    id: `${date}:${platform}:${listName}:${rank}:${title}`,
    date,
    platform,
    listName,
    category: asOptionalText(item.category) || '未分类',
    rank,
    title,
    author,
    tags,
    status: asOptionalText(item.status) || '未知',
    publicWordCount: asWordCount(item.publicWordCount),
    blurb: asOptionalText(item.blurb),
    publicUrl: asOptionalText(item.publicUrl),
    importedAt,
    sourceStatus: 'manual-import'
  };
}

function rowsFromCsv(source: string): Record<string, unknown>[] {
  const lines = source.replace(/\r\n?/gu, '\n').split('\n').filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV至少需要表头和一行数据');
  const headers = parseCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header === '排名') record.rank = values[index];
      else if (header === '标签') record.tags = values[index];
      else if (header === '字数') record.publicWordCount = values[index];
      else {
        const key = CSV_HEADERS[header];
        if (key) record[key] = values[index];
      }
    });
    return record;
  });
}

export function parseRankingImport(source: string, format: 'csv' | 'json'): RankingItem[] {
  const importedAt = new Date().toISOString();
  let rows: unknown[];
  if (format === 'csv') rows = rowsFromCsv(source);
  else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error('JSON解析失败');
    }
    if (!Array.isArray(parsed)) throw new Error('JSON榜单必须是数组');
    rows = parsed;
  }
  const normalized = rows.map((row) => normalizeItem(row, importedAt));
  const groups = new Map<string, RankingItem[]>();
  for (const item of normalized) {
    const key = `${item.date}:${item.platform}:${item.listName}:${item.category}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => group.sort((left, right) => left.rank - right.rank).slice(0, 10));
}

function includesAny(value: string, words: string[]): string[] {
  return words.filter((word) => value.includes(word));
}

export function analyzeSellingPoints(item: RankingItem): SellingPointAnalysis {
  const metadata = `${item.title}\n${item.tags.join(' ')}\n${item.blurb}`;
  const titleSignals = includesAny(item.title, ['开局', '重生', '穿越', '系统', '我在', '成为', '觉醒', '退婚', '离婚']);
  const mechanismSignals = includesAny(metadata, ['系统', '读心', '弹幕', '模拟', '签到', '空间', '异能', '直播', '御兽', '重生', '穿越']);
  const identitySignals = includesAny(metadata, ['学生', '医生', '皇帝', '王妃', '女配', '反派', '宗主', '领主', '主播', '警察', '律师', '厨师']);
  const predicamentSignals = includesAny(item.blurb, ['必须', '只剩', '倒计时', '危机', '流放', '逃荒', '末日', '退婚', '破产', '失去']);
  const emotionSignals = includesAny(metadata, ['逆袭', '复仇', '甜宠', '治愈', '成长', '救赎', '爽', '虐恋', '守护']);
  const confidence: SellingPointAnalysis['confidence'] = item.blurb.length >= 80 && item.tags.length >= 2 ? '较高' : item.blurb.length >= 30 ? '中' : '低';

  return {
    titleStructure: titleSignals.length ? `书名直接使用“${titleSignals.join('、')}”传递开局、身份或机制` : '书名主要依靠题材意象或人物处境传递预期',
    blurbHook: item.blurb ? item.blurb.slice(0, 80) : '公开简介不足，无法可靠判断具体钩子',
    protagonistIdentity: identitySignals.length ? identitySignals.join('、') : '公开元数据未明确展示',
    openingPredicament: predicamentSignals.length ? `简介包含“${predicamentSignals.join('、')}”等压力词` : '公开元数据未明确展示具体开局困境',
    coreMechanism: mechanismSignals.length ? mechanismSignals.join('＋') : '更可能由人物目标、资源差或信息差驱动',
    coreEmotion: emotionSignals.length ? emotionSignals.join('、') : '需结合正文与读者反馈人工判断',
    tagCombination: item.tags.length ? item.tags.join('＋') : `${item.category}单一分类`,
    firstThreeChapterTasks: ['快速兑现书名承诺', '说明核心机制及限制', '让主角主动选择并获得第一次反馈'],
    learnableStructure: ['学习题材承诺的表达方式', '学习书名与简介的信息密度', '学习标签组合，不复制具体人物和事件链'],
    avoidCopying: '不得复制该作品的具体人物、句式、情节顺序、世界规则或正文内容。',
    confidence,
    disclaimer: '本结果仅依据公开书名、标签和简介进行结构性推测，不代表平台或作者官方解释。'
  };
}
