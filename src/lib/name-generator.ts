export type NameCategory =
  | '现代中文姓名'
  | '古代中文姓名'
  | '宗门名'
  | '城池名'
  | '山川名'
  | '功法名'
  | '武器名'
  | '丹药名'
  | '组织名'
  | '科幻代号';

export type GeneratedName = {
  value: string;
  meaning: string;
  category: NameCategory;
};

export type GenerateNameOptions = {
  category: NameCategory;
  count?: number;
  seed?: number;
  avoid?: string[];
  avoidRareCharacters?: boolean;
};

const SURNAMES = ['顾', '林', '沈', '陆', '江', '苏', '谢', '周', '许', '程', '裴', '萧', '温', '秦', '季', '宋'];
const MODERN_GIVEN = ['言', '知夏', '清禾', '屿川', '嘉宁', '星野', '予安', '景行', '念初', '昭月', '南乔', '闻溪'];
const ANCIENT_GIVEN = ['怀瑾', '长渊', '砚舟', '昭宁', '清晏', '玄度', '云舒', '景珩', '知微', '若蘅', '无咎', '明夷'];
const LAND_PREFIXES = ['青云', '太玄', '长生', '无相', '归墟', '星罗', '紫霄', '万象', '沧澜', '扶光', '玄都', '凌霄'];
const SECT_SUFFIXES = ['宗', '门', '宫', '谷', '阁', '山庄'];
const CITY_SUFFIXES = ['城', '府', '关', '州', '京', '堡'];
const LAND_SUFFIXES = ['山', '岭', '川', '泽', '海', '原'];
const TECHNIQUE_SUFFIXES = ['诀', '经', '录', '法', '篇', '真解'];
const WEAPON_SUFFIXES = ['剑', '刀', '枪', '弓', '镜', '印'];
const PILL_SUFFIXES = ['丹', '散', '丸', '露', '液'];
const ORG_SUFFIXES = ['会', '盟', '局', '司', '社', '议会'];
const CODE_PREFIXES = ['NX', 'AURORA', 'ORBIT', 'ECHO', 'VOID', 'SOL'];

function createRandom(seed: number): () => number {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function buildCandidate(category: NameCategory, random: () => number): GeneratedName {
  switch (category) {
    case '现代中文姓名': {
      const surname = pick(SURNAMES, random);
      const given = pick(MODERN_GIVEN, random);
      return { value: `${surname}${given}`, meaning: `${given}取意清朗、安定与成长`, category };
    }
    case '古代中文姓名': {
      const surname = pick(SURNAMES, random);
      const given = pick(ANCIENT_GIVEN, random);
      return { value: `${surname}${given}`, meaning: `${given}带有古典意象与人物气质暗示`, category };
    }
    case '宗门名': {
      const prefix = pick(LAND_PREFIXES, random);
      const suffix = pick(SECT_SUFFIXES, random);
      return { value: `${prefix}${suffix}`, meaning: `突出${prefix}意象，适合宗门或隐世势力`, category };
    }
    case '城池名': {
      const prefix = pick(LAND_PREFIXES, random);
      return { value: `${prefix}${pick(CITY_SUFFIXES, random)}`, meaning: `可作为重要城池、关隘或州府`, category };
    }
    case '山川名': {
      const prefix = pick(LAND_PREFIXES, random);
      return { value: `${prefix}${pick(LAND_SUFFIXES, random)}`, meaning: `适合地图中的自然地貌与秘境`, category };
    }
    case '功法名': {
      const prefix = pick(LAND_PREFIXES, random);
      return { value: `${prefix}${pick(TECHNIQUE_SUFFIXES, random)}`, meaning: `突出功法的世界观来源与层级感`, category };
    }
    case '武器名': {
      const prefix = pick(['逐月', '照胆', '沉星', '问心', '断潮', '烬雪'], random);
      return { value: `${prefix}${pick(WEAPON_SUFFIXES, random)}`, meaning: `名称自带动作感和视觉意象`, category };
    }
    case '丹药名': {
      const prefix = pick(['回春', '凝神', '洗髓', '破境', '养魂', '避尘'], random);
      return { value: `${prefix}${pick(PILL_SUFFIXES, random)}`, meaning: `名称直接提示药效，便于读者理解`, category };
    }
    case '组织名': {
      const prefix = pick(['观星', '巡夜', '天衡', '白塔', '九曜', '远航'], random);
      return { value: `${prefix}${pick(ORG_SUFFIXES, random)}`, meaning: `适合官方、民间或跨地域组织`, category };
    }
    case '科幻代号': {
      const prefix = pick(CODE_PREFIXES, random);
      const number = String(Math.floor(random() * 900) + 100);
      return { value: `${prefix}-${number}`, meaning: `适合作战单位、实验项目或星舰代号`, category };
    }
  }
}

export function generateNames(options: GenerateNameOptions): GeneratedName[] {
  const count = Math.max(1, Math.min(options.count ?? 10, 50));
  const random = createRandom(options.seed ?? Date.now());
  const avoid = new Set(options.avoid ?? []);
  const results = new Map<string, GeneratedName>();
  const maxAttempts = Math.max(100, count * 30);

  for (let attempt = 0; attempt < maxAttempts && results.size < count; attempt += 1) {
    const candidate = buildCandidate(options.category, random);
    if (avoid.has(candidate.value)) continue;
    if (options.avoidRareCharacters && /[^\u4e00-\u9fa5A-Z0-9-]/u.test(candidate.value)) continue;
    results.set(candidate.value, candidate);
  }

  return [...results.values()].slice(0, count);
}
