type Token =
  | { type: 'number'; value: number }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'left' }
  | { type: 'right' };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const character = source[cursor]!;
    if (/\s/u.test(character)) {
      cursor += 1;
      continue;
    }
    if (/[0-9.]/u.test(character)) {
      const match = source.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)/u);
      if (!match) throw new Error('无效数字');
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new Error('无效数字');
      tokens.push({ type: 'number', value });
      cursor += match[0].length;
      continue;
    }
    if (character === '(') tokens.push({ type: 'left' });
    else if (character === ')') tokens.push({ type: 'right' });
    else if (character === '+' || character === '-' || character === '*' || character === '/' || character === '^') {
      tokens.push({ type: 'operator', value: character });
    } else {
      throw new Error(`无效字符“${character}”`);
    }
    cursor += 1;
  }

  return tokens;
}

class Parser {
  private cursor = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    if (!this.tokens.length) throw new Error('表达式不能为空');
    const value = this.parseAddition();
    if (this.cursor !== this.tokens.length) throw new Error('无效表达式');
    if (!Number.isFinite(value)) throw new Error('计算结果超出范围');
    return value;
  }

  private current(): Token | undefined {
    return this.tokens[this.cursor];
  }

  private consume(): Token {
    const token = this.tokens[this.cursor];
    if (!token) throw new Error('无效表达式');
    this.cursor += 1;
    return token;
  }

  private parseAddition(): number {
    let value = this.parseMultiplication();
    while (this.current()?.type === 'operator' && (this.current() as { value: string }).value.match(/^[+-]$/u)) {
      const operator = (this.consume() as { type: 'operator'; value: '+' | '-' }).value;
      const right = this.parseMultiplication();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  private parseMultiplication(): number {
    let value = this.parsePower();
    while (this.current()?.type === 'operator' && (this.current() as { value: string }).value.match(/^[*/]$/u)) {
      const operator = (this.consume() as { type: 'operator'; value: '*' | '/' }).value;
      const right = this.parsePower();
      if (operator === '/' && right === 0) throw new Error('不能除以零');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }

  private parsePower(): number {
    const left = this.parseUnary();
    const token = this.current();
    if (token?.type === 'operator' && token.value === '^') {
      this.consume();
      return left ** this.parsePower();
    }
    return left;
  }

  private parseUnary(): number {
    const token = this.current();
    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      this.consume();
      const value = this.parseUnary();
      return token.value === '-' ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.consume();
    if (token.type === 'number') return token.value;
    if (token.type === 'left') {
      const value = this.parseAddition();
      if (this.consume().type !== 'right') throw new Error('括号未闭合');
      return value;
    }
    throw new Error('无效表达式');
  }
}

export function evaluateExpression(source: string): number {
  return new Parser(tokenize(source)).parse();
}

export function calculateTravel(input: { distance: number; speed: number; restPercent?: number }): {
  movingHours: number;
  totalHours: number;
} {
  if (!Number.isFinite(input.distance) || input.distance < 0) throw new Error('距离必须是非负数');
  if (!Number.isFinite(input.speed) || input.speed <= 0) throw new Error('速度必须大于零');
  const restPercent = input.restPercent ?? 0;
  if (!Number.isFinite(restPercent) || restPercent < 0) throw new Error('休息比例不能为负数');
  const movingHours = input.distance / input.speed;
  return { movingHours, totalHours: movingHours * (1 + restPercent / 100) };
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number.isNaN(date.getTime())) throw new Error('日期无效');
  return date;
}

export function calculateAge(birthDate: string, storyDate: string): number {
  const birth = parseDate(birthDate);
  const story = parseDate(storyDate);
  if (story < birth) throw new Error('故事日期不能早于出生日期');
  let age = story.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    story.getUTCMonth() < birth.getUTCMonth() ||
    (story.getUTCMonth() === birth.getUTCMonth() && story.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function calculateCompoundGrowth(initial: number, rate: number, periods: number): number {
  if (![initial, rate, periods].every(Number.isFinite)) throw new Error('参数必须是有效数字');
  if (periods < 0) throw new Error('周期不能为负数');
  return initial * (1 + rate) ** periods;
}

export function probabilityAtLeastOne(singleProbability: number, attempts: number): number {
  if (!Number.isFinite(singleProbability) || singleProbability < 0 || singleProbability > 1) {
    throw new Error('单次概率必须在0到1之间');
  }
  if (!Number.isInteger(attempts) || attempts < 0) throw new Error('次数必须是非负整数');
  return 1 - (1 - singleProbability) ** attempts;
}
