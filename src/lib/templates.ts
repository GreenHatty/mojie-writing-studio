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
  const expectation = seed.expectation ?? `持续兑现“${seed.genre}”题材的核心情绪与成长反馈`;
  const mechanism = seed.mechanism ?? '由人物选择、资源差和信息差形成持续推进机制';
  const conflict = seed.conflict ?? '主角的明确目标与更强对手、规则限制及自身缺陷持续碰撞';

  return {
    id: `${slug(platform)}-${slug(seed.audience)}-${slug(length)}-${slug(seed.genre)}`,
    name: `${platform}·${seed.genre}${length === '短故事' ? '短故事' : '创作模板'}`,
    platform,
    audience: seed.audience,
    length,
    genre: seed.genre,
    elements,
    definition: `以${seed.genre}为主要类型承诺，围绕人物目标、阶段性冲突和可持续升级组织情节。`,
    readingExpectation: expectation,
    storyFormula: `处于不利位置的主角，因为${mechanism}获得行动机会，在${conflict}中持续作出有代价的选择。`,
    initialSituation: '主角处于具体且可感知的不利处境，第一章即可观察到损失或倒计时。',
    coreDesire: '主角最想守住、得到或证明的事，必须能转化为连续行动。',
    externalGoal: '第一卷可完成的明确目标，以及完成后自然打开的更大目标。',
    internalFlaw: '会导致错误选择的人格缺口，不能只写成无伤大雅的小毛病。',
    coreConflict: conflict,
    specialMechanism: mechanism,
    mechanismLimits: '能力有消耗、冷却、信息盲区或道德代价，不能替代人物决策。',
    resistance: '设置同层竞争者、规则维护者、利益集团和价值观对手四类阻力。',
    minimumWorldbuilding: ['力量或职业规则', '资源获取与交换方式', '主要势力及利益关系', '普通人的日常生活'],
    firstChapter: ['展示主角处境与欲望', '发生不可忽略的变化', '给出本章内的小目标', '用未解决的问题结束'],
    firstThreeChapters: ['交代核心机制但保留限制', '让主角主动做出第一次选择', '兑现一次小反馈', '建立可持续矛盾'],
    firstTenChapters: ['形成稳定主线', '引入关键盟友或对手', '完成一次阶段升级', '埋下第一卷核心伏笔'],
    firstTwentyThousandWords: ['证明题材承诺', '让主角获得与付出同时增长', '形成清晰关系网', '给读者一个可复述的核心卖点'],
    firstVolume: ['完成首个大目标', '回收至少一个前期伏笔', '使人物关系发生不可逆变化', '打开更高层级矛盾'],
    midgameEscalation: ['从个人问题升级到组织或制度问题', '让旧能力在新环境中失效一部分', '迫使主角承担领导或选择责任'],
    endgameEscalation: ['让终局冲突同时检验能力、关系与价值观', '回收核心伏笔', '避免只依靠突然出现的更强力量收尾'],
    romancePlacement: seed.audience === '女频' ? '感情线应与主线互相改变选择，不作为独立装饰。' : '按题材需要配置，不能拖慢核心升级与行动线。',
    emotionalPayoffs: ['能力成长', '身份变化', '关系确认或反转', '旧屈辱的有因果回收'],
    chapterEndings: ['新问题出现', '信息差揭开一层', '人物作出不可撤回的选择', '目标完成但代价显现'],
    titlePattern: [`身份或处境＋${seed.genre}核心机制`, '反差结果＋明确题材词', '具体目标＋异常规则'],
    blurbPattern: ['一句异常处境', '一句主角行动方式', '一句独特机制或限制', '一句最大悬念'],
    compatibleTags: [...elements, seed.genre, seed.audience],
    commonMistakes: ['开篇只讲设定不发生事件', '机制无成本导致冲突失效', '配角只承担递话和夸赞功能', '升级只变数字不改变问题'],
    homogenizationRisks: ['直接复刻热门书名句式', '把常见系统提示当作核心卖点', '人物目标与同类作品完全一致'],
    innovationDirections: ['替换主角职业或社会位置', '改变资源获取伦理', '让机制与人物缺陷互相制约', '使用具有地域或行业细节的场景'],
    selfCheck: ['第一章是否发生事件', '主角是否主动选择', '机制是否有限制', '十章内是否至少兑现一次承诺', '第一卷是否有可完成目标'],
    lastReviewedAt: REVIEW_DATE,
    sourceType: '公开平台分类、征文方向与通用叙事方法的原创整理',
    heatStatus: seed.heat ?? '稳定',
    editorNotes: '模板只提供结构方法，不生成对具体作品的仿写内容。'
  };
}

const SEEDS: TemplateSeed[] = [
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
