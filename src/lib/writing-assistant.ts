import { countWritingCharacters } from './writing';

export type ChapterRhythmAnalysis = {
  characterCount: number;
  paragraphCount: number;
  sentenceCount: number;
  averageSentenceLength: number;
  dialogueRatio: number;
  longSentenceCount: number;
  sceneBreakCount: number;
  endingHook: { level: 'weak' | 'medium' | 'strong'; reason: string };
  suggestions: string[];
};

function sentences(text: string): string[] {
  return text.split(/(?<=[。！？!?])\s*/u).map((item) => item.trim()).filter(Boolean);
}

function dialogueCharacters(text: string): number {
  let total = 0;
  for (const match of text.matchAll(/[“「『](.*?)[”」』]/gsu)) total += countWritingCharacters(match[1] ?? '');
  return total;
}

export function analyzeChapterRhythm(text: string): ChapterRhythmAnalysis {
  const clean = text.trim();
  const characterCount = countWritingCharacters(clean);
  const paragraphCount = clean ? clean.split(/\n+/u).filter((item) => item.trim()).length : 0;
  const sentenceList = sentences(clean);
  const sentenceCount = sentenceList.length;
  const averageSentenceLength = sentenceCount ? Number((characterCount / sentenceCount).toFixed(1)) : 0;
  const dialogueRatio = characterCount ? Number((dialogueCharacters(clean) / characterCount).toFixed(2)) : 0;
  const longSentenceCount = sentenceList.filter((sentence) => countWritingCharacters(sentence) >= 55).length;
  const sceneBreakCount = (clean.match(/(?:^|\n)\s*(?:\*{3,}|—{3,}|·{3,})\s*(?:\n|$)/gu) || []).length;
  const ending = sentenceList.at(-1) || '';
  const strongSignals = /忽然|却见|竟然|原来|不对|死去|失踪|倒计时|只剩|门外|身后|真相|秘密|来不及|就在这时/u;
  const mediumSignals = /决定|必须|答应|拒绝|明日|下一步|前往|等待/u;
  const endingHook = strongSignals.test(ending)
    ? { level: 'strong' as const, reason: '结尾包含突发变化、未知威胁或信息反转。' }
    : mediumSignals.test(ending)
      ? { level: 'medium' as const, reason: '结尾留下了明确行动或下一步任务。' }
      : { level: 'weak' as const, reason: '结尾更接近自然收束，继续阅读驱动力较弱。' };
  const suggestions: string[] = [];
  if (characterCount < 800) suggestions.push('章节较短，可检查是否已经完成一个完整场景目标与结果。');
  if (averageSentenceLength > 32) suggestions.push('平均句长偏长，可拆分动作、感受和信息说明。');
  if (longSentenceCount > Math.max(2, sentenceCount * 0.12)) suggestions.push('长句密度较高，建议优先处理超过55字的句子。');
  if (dialogueRatio < 0.08 && characterCount > 1000) suggestions.push('对话占比较低，可检查是否存在连续说明或概述。');
  if (dialogueRatio > 0.65) suggestions.push('对话占比较高，可补充必要动作、环境反馈和潜台词。');
  if (endingHook.level === 'weak') suggestions.push('可在结尾增加新问题、代价、倒计时或意外信息。');
  return { characterCount, paragraphCount, sentenceCount, averageSentenceLength, dialogueRatio, longSentenceCount, sceneBreakCount, endingHook, suggestions };
}

export type ScenePlanInput = {
  viewpoint: string;
  goal: string;
  conflict: string;
  reveal: string;
  consequence: string;
};

export function buildScenePlan(input: ScenePlanInput): string[] {
  const viewpoint = input.viewpoint.trim() || '视角人物';
  const goal = input.goal.trim() || '完成本场景目标';
  const conflict = input.conflict.trim() || '出现阻碍';
  const reveal = input.reveal.trim() || '获得新的关键信息';
  const consequence = input.consequence.trim() || '付出代价并进入下一场景';
  return [
    `入场状态：用一个具体动作展示${viewpoint}此刻最在意的事。`,
    `明确目标：${viewpoint}必须在本场景中${goal}。`,
    `首次阻碍：${conflict}，迫使${viewpoint}改变原计划。`,
    `主动选择：让${viewpoint}采取一个有风险、能体现性格的行动。`,
    `局势升级：行动带来新的损失、误会或时间压力。`,
    `信息揭示：${reveal}。`,
    `场景结果：目标部分达成或失败，但不能回到入场前状态。`,
    `离场钩子：${consequence}。`
  ];
}

export type BlurbInput = {
  protagonist: string;
  identity: string;
  goal: string;
  obstacle: string;
  mechanism: string;
  stakes: string;
};

export function createNovelBlurb(input: BlurbInput): string {
  const protagonist = input.protagonist.trim() || '主角';
  const identity = input.identity.trim() || '一个被迫卷入风暴的人';
  const goal = input.goal.trim() || '改变自己的命运';
  const obstacle = input.obstacle.trim() || '所有人都认定这件事不可能成功';
  const mechanism = input.mechanism.trim();
  const stakes = input.stakes.trim() || '一旦失败，他将失去最后的退路';
  const mechanismSentence = mechanism ? `唯一的优势，是${mechanism}。` : '';
  return `${protagonist}原本只是${identity}，却被迫面对一个无法回避的选择：${goal}。${mechanismSentence}${obstacle}。更糟的是，${stakes}。当退路被彻底封死，${protagonist}只能主动踏入局中。`;
}

export function generateEndingHooks(currentEnding: string, hiddenInformation: string): string[] {
  const ending = currentEnding.trim().replace(/[。！？!?]+$/u, '') || '他抬起头';
  const information = hiddenInformation.trim() || '真正的危险才刚刚开始';
  return [
    `${ending}。就在这时，他终于意识到：${information}。`,
    `${ending}。门外却传来一个本不该出现的声音——${information}。`,
    `${ending}。可他不知道，${information}。`,
    `${ending}。下一刻，所有人同时看向了同一个方向。${information}。`
  ];
}

export function tightenChineseText(text: string): string {
  return text
    .replace(/不由得/gu, '')
    .replace(/慢慢地(?=[抬转走看望伸])/gu, '')
    .replace(/然后(?=[，,])/gu, '')
    .replace(/，\s*，/gu, '，')
    .replace(/\s+/gu, ' ')
    .replace(/^\s+|\s+$/gu, '');
}

export function extractForeshadowingCandidates(text: string): string[] {
  const signals = /秘密|约定|曾经|那枚|那封|不知道|并未察觉|似乎|隐约|总有一天|从未告诉|本不该|真正的/u;
  return sentences(text).filter((sentence) => signals.test(sentence)).slice(0, 20);
}
