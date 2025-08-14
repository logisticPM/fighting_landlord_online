export enum CombinationType {
  Single = 'single',
  Pair = 'pair',
  Triple = 'triple',
  TripleSingle = 'triple_single',
  TriplePair = 'triple_pair',
  Straight = 'straight',
  StraightPair = 'straight_pair',
  Bomb = 'bomb',
  Rocket = 'rocket',
  Invalid = 'invalid'
}

export type Combination = {
  type: CombinationType;
  power: number; // 比较大小的主值
  cards: number[]; // 实际牌列表（实体 id）
  lengthHint?: number; // 直/连对长度
}

// 将实体 id 转换为斗地主数值：3..10=3..10, J=11, Q=12, K=13, A=14, 2=15, 小王=16, 大王=17
export function entityToValue(id: number): number {
  if (id === 53) return 16;
  if (id === 54) return 17;
  return (id % 13) + 3;
}

function groupCount(values: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

function isStraight(values: number[]): boolean {
  if (values.length < 5) return false;
  const uniq = Array.from(new Set(values)).sort((a, b) => a - b);
  if (uniq.length !== values.length) return false;
  if (uniq.some(v => v >= 15)) return false; // 不含 2 和王
  for (let i = 1; i < uniq.length; i++) if (uniq[i] !== uniq[i - 1] + 1) return false;
  return true;
}

function isPairStraight(values: number[]): boolean {
  if (values.length < 6 || values.length % 2 !== 0) return false;
  const g = groupCount(values);
  const uniq = Array.from(g.keys()).sort((a, b) => a - b);
  if (uniq.some(v => v >= 15)) return false;
  for (const v of uniq) if (g.get(v)! !== 2) return false;
  for (let i = 1; i < uniq.length; i++) if (uniq[i] !== uniq[i - 1] + 1) return false;
  return true;
}

export function analyzeCombination(cards: number[]): Combination {
  if (!cards || cards.length === 0) return { type: CombinationType.Invalid, power: 0, cards: [] };
  const values = cards.map(entityToValue).sort((a, b) => a - b);
  const cnt = cards.length;

  // Rocket
  if (cnt === 2 && values.includes(16) && values.includes(17)) {
    return { type: CombinationType.Rocket, power: 1000, cards };
  }

  // Bomb
  if (cnt === 4) {
    const g = groupCount(values);
    if (g.size === 1) return { type: CombinationType.Bomb, power: 100 + values[0], cards };
  }

  // Basic by count
  if (cnt === 1) return { type: CombinationType.Single, power: values[0], cards };
  if (cnt === 2) {
    const g = groupCount(values);
    if (g.size === 1) return { type: CombinationType.Pair, power: values[0], cards };
  }
  if (cnt === 3) {
    const g = groupCount(values);
    if (g.size === 1) return { type: CombinationType.Triple, power: values[0], cards };
  }
  if (cnt === 4) {
    const g = groupCount(values);
    if (g.size === 2) {
      const uniq = Array.from(g.keys());
      const counts = uniq.map(v => g.get(v)!);
      if (counts.includes(3) && counts.includes(1)) {
        const tripleVal = uniq[counts.indexOf(3)];
        return { type: CombinationType.TripleSingle, power: tripleVal, cards };
      }
    }
  }
  if (cnt === 5) {
    if (isStraight(values)) return { type: CombinationType.Straight, power: Math.max(...values), cards, lengthHint: 5 };
    const g = groupCount(values);
    if (g.size === 2) {
      const uniq = Array.from(g.keys());
      const counts = uniq.map(v => g.get(v)!);
      if (counts.includes(3) && counts.includes(2)) {
        const tripleVal = uniq[counts.indexOf(3)];
        return { type: CombinationType.TriplePair, power: tripleVal, cards };
      }
    }
  }

  // Straights length >=5
  if (cnt >= 5 && isStraight(values)) return { type: CombinationType.Straight, power: Math.max(...values), cards, lengthHint: cnt };
  // Pair straights length >=6 and even
  if (cnt >= 6 && isPairStraight(values)) return { type: CombinationType.StraightPair, power: Math.max(...values), cards, lengthHint: cnt / 2 };

  return { type: CombinationType.Invalid, power: 0, cards };
}

export function canBeat(a: Combination, b: Combination | null): boolean {
  if (!b) return a.type !== CombinationType.Invalid;
  if (a.type === CombinationType.Rocket) return true;
  if (b.type === CombinationType.Rocket) return false;
  if (a.type === CombinationType.Bomb && b.type !== CombinationType.Bomb) return true;
  if (a.type !== CombinationType.Bomb && b.type === CombinationType.Bomb) return false;
  if (a.type !== b.type) return false;
  // 同型规则：直/连对长度必须一致
  if (a.type === CombinationType.Straight || a.type === CombinationType.StraightPair) {
    if ((a.lengthHint ?? 0) !== (b.lengthHint ?? 0)) return false;
  }
  return (a.power > b.power);
}


