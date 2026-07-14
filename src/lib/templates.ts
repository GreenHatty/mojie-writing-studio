export type TemplatePlatform = '起点' | '番茄' | '通用';
export type TemplateAudience = '男频' | '女频' | '不限';
export type TemplateLength = '长篇' | '中短篇' | '短故事';
export type TemplateHeat = '上升' | '稳定' | '观察' | '衰减';

export type WritingTemplate = {
  id: string;
  name: string;
  platform: TemplatePlatform;
  audience: TemplateAudience;
  length: TemplateLength;
  genre: string;
  elements: string[];
  definition: string;
  readingExpectation: string;
  storyFormula: string;
  initialSituation: string;
  coreDesire: string;
  externalGoal: string;
  internalFlaw: string;
  coreConflict: string;
  specialMechanism: string;
  mechanismLimits: string;
  resistance: string;
  minimumWorldbuilding: string[];
  firstChapter: string[];
  firstThreeChapters: string[];
  firstTenChapters: string[];
  firstTwentyThousandWords: string[];
  firstVolume: string[];
  midgameEscalation: string[];
  endgameEscalation: string[];
  romancePlacement: string;
  emotionalPayoffs: string[];
  chapterEndings: string[];
  titlePattern: string[];
  blurbPattern: string[];
  compatibleTags: string[];
  commonMistakes: string[];
  homogenizationRisks: string[];
  innovationDirections: string[];
  selfCheck: string[];
  lastReviewedAt: string;
  sourceType: string;
  heatStatus: TemplateHeat;
  editorNotes: string;
};

export type TemplateFilter = {
  platform?: TemplatePlatform;
  audience?: TemplateAudience;
  length?: TemplateLength;
  genre?: string;
  elements?: string[];
  query?: string;
};

export type PlanningCard = {
  templateId: string;
  templateName: string;
  selectedElements: string[];
  sections: Array<{ key: string; title: string; prompt: string; value: string }>;
  generatedProse?: never;
};

type TemplateSeed = {
  genre: string;
  audience: TemplateAudience;
  platform?: TemplatePlatform;
  length?: TemplateLength;
  elements?: string[];
  expectation?: string;
  mechanism?: string;
  conflict?: string;
  heat?: TemplateHeat;
};

const REVIEW_DATE = '2026-07-11';

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function makeTemplate(seed: TemplateSeed): WritingTemplate {
  const platform = seed.platform ?? '通用';
  const length = seed.length ?? '长篇';
  const elements = [...new Set(seed.elements ?? [])];
  const blueprint = blueprintForGenre(seed.genre, length, elements);
  const expectation = seed.expectation ?? blueprint.promise;
  const mechanism = seed.mechanism ?? blueprint.mechanism;
  const conflict = seed.conflict ?? blueprint.conflict;

  return {
    id: `${slug(platform)}-${slug(seed.audience)}-${slug(length)}-${slug(seed.genre)}`,
    name: `${platform}·${seed.genre}${length === '短故事' ? '短故事' : '创作模板'}`,
    platform,
    audience: seed.audience,
    length,
    genre: seed.genre,
    elements,
    definition: `${seed.genre}不是标签拼盘：以“${blueprint.promise}”为读者契约，每个阶段都必须用可观察的选择与结果兑现。`,
    readingExpectation: expectation,
    storyFormula: blueprint.formula,
    initialSituation: blueprint.opening[0] ?? '以可观察的损失开场。',
    coreDesire: `把“${blueprint.promise}”落到主角要守住、得到或证明的一件具体事。`,
    externalGoal: blueprint.volumeArc[0] ?? '完成第一阶段可核验目标。',
    internalFlaw: `让主角在“${blueprint.conflict}”中反复做出有代价的错误选择，并通过事件修正。`,
    coreConflict: conflict,
    specialMechanism: mechanism,
    mechanismLimits: blueprint.limitation,
    resistance: blueprint.conflict,
    minimumWorldbuilding: blueprint.world,
    firstChapter: blueprint.opening,
    firstThreeChapters: [blueprint.opening[1] ?? '验证题材机制', blueprint.opening[2] ?? '作出第一次选择', `兑现一次“${blueprint.payoffs[0]}”`, `建立${seed.genre}的持续矛盾`],
    firstTenChapters: [blueprint.volumeArc[0] ?? '完成阶段目标', blueprint.volumeArc[1] ?? '建立关系网', `至少兑现两次“${blueprint.payoffs.join(' / ')}”`, '埋下第一卷可回收线索'],
    firstTwentyThousandWords: [`让读者能复述：${blueprint.promise}`, `证明推进机制：${mechanism}`, `展示限制：${blueprint.limitation}`, '形成一条可追踪的因果链而非事件清单'],
    firstVolume: blueprint.volumeArc,
    midgameEscalation: [`把“${blueprint.conflict}”从个人层推到组织层`, `让既有机制遭遇新限制：${blueprint.limitation}`, '使早期关系因利益变化重新站队'],
    endgameEscalation: [`让终局同时检验：${blueprint.promise}`, '回收开篇的规则、选择与代价', '用主角最终选择证明人物弧光，而非突然加力量'],
    romancePlacement: seed.audience === '女频' ? '感情线应与主线互相改变选择，不作为独立装饰。' : '按题材需要配置，不能拖慢核心升级与行动线。',
    emotionalPayoffs: blueprint.payoffs,
    chapterEndings: [`${seed.genre}规则出现新例外`, '已知证据获得新意义', '人物作出不可撤回的题材选择', '阶段目标完成但专属代价显现'],
    titlePattern: [`身份或处境＋${seed.genre}核心机制`, '反差结果＋明确题材词', '具体目标＋异常规则'],
    blurbPattern: ['一句异常处境', '一句主角行动方式', '一句独特机制或限制', '一句最大悬念'],
    compatibleTags: [...elements, seed.genre, seed.audience],
    commonMistakes: blueprint.pitfalls,
    homogenizationRisks: [`只复制${seed.genre}热门书名和开场句式`, `把${elements.join('、') || '流行元素'}当装饰而不让它改变决策`, '主角目标、资源路径和对手结构完全沿用同类作品'],
    innovationDirections: [`把主角放进${seed.genre}中少见但可查证的职业或地域`, `改变“${mechanism}”的资源伦理`, `让“${blueprint.limitation}”同时制约人物缺陷`, '用真实行业、生活或地方细节建立不可替代性'],
    selfCheck: [`开篇是否实际执行：${blueprint.opening.join('；')}`, `十章内是否兑现：${blueprint.payoffs.join('；')}`, `限制“${blueprint.limitation}”是否真的造成损失`, `第一卷是否完成：${blueprint.volumeArc.join('；')}`],
    lastReviewedAt: REVIEW_DATE,
    sourceType: '公开平台分类、征文方向与通用叙事方法的原创整理',
    heatStatus: seed.heat ?? '稳定',
    editorNotes: '模板只提供结构方法，不生成对具体作品的仿写内容。'
  };
}

const SEEDS: TemplateSeed[] = [
  { genre: '高武', audience: '男频', platform: '通用', elements: ['武道', '升级', '责任'] },
  { genre: '修仙', audience: '男频', platform: '通用', elements: ['长生', '资源', '道途'] },
  { genre: '种田流', audience: '不限', platform: '通用', elements: ['生产周期', '经营', '家园'] },
  { genre: '系统文', audience: '不限', platform: '通用', elements: ['任务', '反馈', '限制'] },
  { genre: '穿越', audience: '不限', platform: '通用', elements: ['文明差异', '适应', '新身份'] },
  { genre: '重生', audience: '不限', platform: '通用', elements: ['旧记忆', '改命', '蝴蝶效应'] },
  { genre: '脑洞', audience: '不限', platform: '番茄', elements: ['异常规则', '反常识', '连锁影响'] },
  { genre: '同人', audience: '不限', platform: '通用', elements: ['原作空白', '规则尊重', '原创视角'] },
  { genre: '权谋', audience: '不限', platform: '通用', elements: ['制度', '筹码', '多方博弈'] },
  { genre: '都市高武', audience: '男频', platform: '番茄', elements: ['系统', '群像', '全民觉醒'], expectation: '高密度成长反馈、战斗升级与群体关系推进', mechanism: '可量化但有限制的成长系统与团队协作', heat: '上升' },
  { genre: '都市高武', audience: '男频', platform: '起点', elements: ['无系统', '学院成长', '群像'], expectation: '严谨力量体系、学院竞争与长期世界升级', mechanism: '训练、资源争夺和认知突破共同驱动成长', heat: '上升' },
  { genre: '东方玄幻', audience: '男频', platform: '起点', elements: ['升级', '宗门', '世界谜团'] },
  { genre: '异世大陆', audience: '男频', elements: ['穿越', '冒险', '文明差异'] },
  { genre: '王朝争霸', audience: '男频', elements: ['战争', '谋略', '群像'] },
  { genre: '凡人流', audience: '男频', platform: '起点', elements: ['修仙', '谨慎', '资源经营'], expectation: '低起点、可信积累和高风险修行', mechanism: '有限资源、功法选择与风险判断' },
  { genre: '古典仙侠', audience: '男频', elements: ['剑修', '问道', '因果'] },
  { genre: '修仙家族', audience: '男频', elements: ['家族经营', '种田', '代际成长'] },
  { genre: '修仙种田', audience: '男频', elements: ['种田', '经营', '慢热'] },
  { genre: '诡异修仙', audience: '男频', elements: ['诡异', '规则', '克制'] },
  { genre: '御兽', audience: '男频', elements: ['宠兽', '进化', '伙伴'] },
  { genre: '灵气复苏', audience: '男频', elements: ['都市', '灾变', '觉醒'] },
  { genre: '全民觉醒', audience: '男频', elements: ['职业', '副本', '学院'] },
  { genre: '幕后流', audience: '男频', elements: ['马甲', '势力经营', '信息差'], expectation: '读者掌握真相、角色误判与布局兑现', mechanism: '多身份行动、组织资源和信息控制' },
  { genre: '苟道流', audience: '男频', elements: ['谨慎', '长生', '反套路'] },
  { genre: '反派流', audience: '男频', elements: ['身份反差', '博弈', '改命'] },
  { genre: '模拟器流', audience: '男频', elements: ['模拟', '多周目', '信息积累'] },
  { genre: '神豪', audience: '男频', platform: '番茄', elements: ['系统', '都市', '消费反馈'] },
  { genre: '商战创业', audience: '男频', elements: ['商业', '职场', '时代机会'] },
  { genre: '文娱创作', audience: '男频', elements: ['娱乐圈', '作品经营', '幕后'] },
  { genre: '学霸科技', audience: '男频', elements: ['科研', '强国', '成长'] },
  { genre: '乡村经营', audience: '男频', elements: ['种田', '美食', '直播'] },
  { genre: '历史穿越', audience: '男频', platform: '起点', elements: ['穿越', '制度', '战争'] },
  { genre: '架空历史', audience: '男频', elements: ['权谋', '争霸', '制度建设'] },
  { genre: '科技兴国', audience: '男频', elements: ['工业', '群像', '家国'] },
  { genre: '末日生存', audience: '男频', elements: ['灾变', '物资', '基地'] },
  { genre: '星际文明', audience: '男频', elements: ['星舰', '文明', '战争'] },
  { genre: '赛博朋克', audience: '不限', elements: ['科技', '资本', '身份'] },
  { genre: '无限流', audience: '男频', elements: ['副本', '团队', '规则'] },
  { genre: '诸天流', audience: '男频', elements: ['多世界', '成长', '改写遗憾'] },
  { genre: '规则怪谈', audience: '不限', platform: '番茄', elements: ['规则', '悬疑', '直播'] },
  { genre: '民俗悬疑', audience: '不限', elements: ['地域民俗', '调查', '禁忌'] },
  { genre: '推理破案', audience: '不限', elements: ['案件', '证据', '群像'] },
  { genre: '游戏制作', audience: '男频', elements: ['创业', '玩家反馈', '文娱'] },
  { genre: '领主经营', audience: '男频', elements: ['建设', '战争', '资源'] },
  { genre: '综漫', audience: '男频', elements: ['同人', '多作品世界', '成长'] },
  { genre: '古言种田', audience: '女频', elements: ['种田', '家长里短', '经营'] },
  { genre: '宫斗', audience: '女频', elements: ['权谋', '生存', '女性群像'] },
  { genre: '宅斗', audience: '女频', elements: ['家族', '利益', '成长'] },
  { genre: '古代权谋', audience: '女频', elements: ['朝堂', '女强', '群像'] },
  { genre: '重生复仇', audience: '女频', elements: ['重生', '改命', '信息差'] },
  { genre: '逃荒', audience: '女频', elements: ['生存', '家族', '种田'] },
  { genre: '流放', audience: '女频', elements: ['经营', '逆境', '群像'] },
  { genre: '古言甜宠', audience: '女频', elements: ['甜宠', '先婚后爱', '成长'] },
  { genre: '古言虐恋', audience: '女频', elements: ['虐恋', '权力差', '追妻火葬场'] },
  { genre: '现言甜宠', audience: '女频', platform: '番茄', elements: ['甜宠', '都市', '双向成长'], expectation: '高频情感确认、生活细节和关系安全感', mechanism: '共同事件推动了解与信任，而非纯误会拉扯', heat: '上升' },
  { genre: '豪门总裁', audience: '女频', elements: ['豪门', '契约', '身份差'] },
  { genre: '先婚后爱', audience: '女频', elements: ['婚恋', '日常', '关系变化'] },
  { genre: '破镜重圆', audience: '女频', elements: ['旧爱', '误解重审', '成长'] },
  { genre: '娱乐圈', audience: '女频', elements: ['事业线', '舆论', '感情'] },
  { genre: '马甲文', audience: '女频', elements: ['身份反差', '掉马', '女强'] },
  { genre: '女性成长', audience: '女频', elements: ['事业', '家庭', '自我建立'] },
  { genre: '年代文', audience: '女频', elements: ['年代', '家庭', '经营'] },
  { genre: '真假千金', audience: '女频', elements: ['身份', '家庭关系', '成长'] },
  { genre: '仙侠言情', audience: '女频', elements: ['仙侠', '宿命', '成长'] },
  { genre: '兽世', audience: '女频', elements: ['异世界', '生存', '族群'] },
  { genre: '无限流言情', audience: '女频', elements: ['副本', '悬疑', '关系推进'] },
  { genre: '快穿', audience: '女频', elements: ['系统', '单元世界', '成长'] },
  { genre: '穿书', audience: '女频', elements: ['穿书', '改命', '反套路'] },
  { genre: '恶毒女配', audience: '女频', elements: ['穿书', '自救', '反标签'] },
  { genre: '读心', audience: '女频', elements: ['读心', '信息差', '轻喜'] },
  { genre: '弹幕', audience: '女频', elements: ['弹幕', '预知', '群像'] },
  { genre: '男频脑洞', audience: '男频', platform: '番茄', length: '短故事', elements: ['脑洞', '反转', '强钩子'], heat: '上升' },
  { genre: '女频脑洞', audience: '女频', platform: '番茄', length: '短故事', elements: ['脑洞', '情绪', '反转'], heat: '上升' },
  { genre: '悬疑惊悚', audience: '不限', platform: '番茄', length: '短故事', elements: ['悬疑', '惊悚', '反转'] },
  { genre: '青春虐恋', audience: '女频', platform: '番茄', length: '短故事', elements: ['青春', '遗憾', '情绪峰值'] },
  { genre: '宫斗宅斗', audience: '女频', platform: '番茄', length: '短故事', elements: ['宫斗', '宅斗', '反转'] },
  { genre: '民国旧影', audience: '女频', platform: '番茄', length: '短故事', elements: ['民国', '宿命', '遗憾'] },
  { genre: '都市日常', audience: '不限', platform: '番茄', length: '短故事', elements: ['日常', '现实', '情绪'] }
];

export const WRITING_TEMPLATES: WritingTemplate[] = SEEDS.map(makeTemplate).map((template) => {
  if (template.length !== '短故事') return template;
  return {
    ...template,
    firstChapter: ['前300字出现冲突', '交代人物关系与损失', '给出不可忽略的问题'],
    firstThreeChapters: ['第一段建立钩子', '三分之一处第一次反转', '中段利用信息差升级', '结尾完成最终反转并保留余味'],
    firstTenChapters: ['短故事不按十章规划：控制3至8个关键场景'],
    firstTwentyThousandWords: ['控制主要人物数量', '每个场景都改变信息或关系', '删除无法推动结局的支线'],
    firstVolume: ['完成单篇闭环', '结尾回扣开场意象或问题'],
    editorNotes: '短故事模板强调冲突位置、信息差和情绪回收；不自动生成完整正文。'
  };
});

export function filterTemplates(templates: WritingTemplate[], filter: TemplateFilter): WritingTemplate[] {
  const query = filter.query?.trim().toLocaleLowerCase('zh-CN');
  return templates.filter((template) => {
    if (filter.platform && template.platform !== filter.platform) return false;
    if (filter.audience && template.audience !== filter.audience) return false;
    if (filter.length && template.length !== filter.length) return false;
    if (filter.genre && template.genre !== filter.genre) return false;
    if (filter.elements?.length && !filter.elements.every((element) => template.elements.includes(element))) return false;
    if (query) {
      const haystack = [template.name, template.genre, template.definition, ...template.elements, ...template.compatibleTags]
        .join('\n')
        .toLocaleLowerCase('zh-CN');
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function buildPlanningCard(template: WritingTemplate, selectedElements: string[] = []): PlanningCard {
  return {
    templateId: template.id,
    templateName: template.name,
    selectedElements: [...new Set(selectedElements)],
    sections: [
      { key: 'premise', title: '一句话故事', prompt: template.storyFormula, value: '' },
      { key: 'protagonist', title: '主角与核心欲望', prompt: `${template.initialSituation}\n${template.coreDesire}`, value: '' },
      { key: 'conflict', title: '核心矛盾与限制', prompt: `${template.coreConflict}\n${template.mechanismLimits}`, value: '' },
      { key: 'world', title: '最低必要世界观', prompt: template.minimumWorldbuilding.join('；'), value: '' },
      { key: 'firstChapter', title: '第一章任务', prompt: template.firstChapter.join('；'), value: '' },
      { key: 'firstThree', title: '前三章任务', prompt: template.firstThreeChapters.join('；'), value: '' },
      { key: 'firstVolume', title: '第一卷任务', prompt: template.firstVolume.join('；'), value: '' },
      { key: 'innovation', title: '微创新', prompt: template.innovationDirections.join('；'), value: '' }
    ]
  };
}
import { blueprintForGenre } from './genre-blueprints';
