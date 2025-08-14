import { analyzeCombination, canBeat, entityToValue, Combination, CombinationType } from './Combination';

/**
 * 手牌分析器 - 检查玩家手牌中是否有能够压制指定牌型的组合
 */
export class HandAnalyzer {
  
  /**
   * 检查手牌是否有能够压制目标牌型的组合
   */
  static canHandBeat(hand: number[], targetCombination: Combination): boolean {
    if (!hand || hand.length === 0) return false;
    if (!targetCombination || targetCombination.type === CombinationType.Invalid) return true;

    // 火箭可以压制一切，检查是否有大小王
    if (hand.includes(53) && hand.includes(54)) {
      return true; // 有火箭
    }

    // 检查是否有炸弹可以压制非炸弹牌型
    if (targetCombination.type !== CombinationType.Bomb && targetCombination.type !== CombinationType.Rocket) {
      if (this.hasBombs(hand).length > 0) {
        return true; // 有炸弹可以压制普通牌型
      }
    }

    // 根据目标牌型检查相应的可能组合
    switch (targetCombination.type) {
      case CombinationType.Single:
        return this.canBeatSingle(hand, targetCombination);
      case CombinationType.Pair:
        return this.canBeatPair(hand, targetCombination);
      case CombinationType.Triple:
        return this.canBeatTriple(hand, targetCombination);
      case CombinationType.TripleSingle:
        return this.canBeatTripleSingle(hand, targetCombination);
      case CombinationType.TriplePair:
        return this.canBeatTriplePair(hand, targetCombination);
      case CombinationType.Straight:
        return this.canBeatStraight(hand, targetCombination);
      case CombinationType.StraightPair:
        return this.canBeatStraightPair(hand, targetCombination);
      case CombinationType.Bomb:
        return this.canBeatBomb(hand, targetCombination);
      case CombinationType.FourSingle:
        return this.canBeatFourSingle(hand, targetCombination);
      case CombinationType.FourPair:
        return this.canBeatFourPair(hand, targetCombination);
      case CombinationType.Plane:
      case CombinationType.PlaneSingle:
      case CombinationType.PlanePair:
        return this.canBeatPlane(hand, targetCombination);
      case CombinationType.Rocket:
        return false; // 火箭无敌，无法压制
      default:
        return false;
    }
  }

  /**
   * 检查是否能压制单张
   */
  private static canBeatSingle(hand: number[], target: Combination): boolean {
    const handValues = hand.map(entityToValue);
    return handValues.some(value => value > target.power);
  }

  /**
   * 检查是否能压制对子
   */
  private static canBeatPair(hand: number[], target: Combination): boolean {
    const valueCount = this.getValueCount(hand);
    for (const [value, count] of valueCount.entries()) {
      if (count >= 2 && value > target.power) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查是否能压制三张
   */
  private static canBeatTriple(hand: number[], target: Combination): boolean {
    const valueCount = this.getValueCount(hand);
    for (const [value, count] of valueCount.entries()) {
      if (count >= 3 && value > target.power) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查是否能压制三带一
   */
  private static canBeatTripleSingle(hand: number[], target: Combination): boolean {
    const valueCount = this.getValueCount(hand);
    
    // 需要至少4张牌才能组成三带一
    if (hand.length < 4) return false;

    for (const [value, count] of valueCount.entries()) {
      if (count >= 3 && value > target.power) {
        // 检查是否还有其他单张可以搭配
        const remainingCards = hand.length - 3;
        if (remainingCards >= 1) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 检查是否能压制三带二
   */
  private static canBeatTriplePair(hand: number[], target: Combination): boolean {
    const valueCount = this.getValueCount(hand);
    
    // 需要至少5张牌才能组成三带二
    if (hand.length < 5) return false;

    for (const [value, count] of valueCount.entries()) {
      if (count >= 3 && value > target.power) {
        // 检查是否还有对子可以搭配
        for (const [pairValue, pairCount] of valueCount.entries()) {
          if (pairValue !== value && pairCount >= 2) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 检查是否能压制顺子
   */
  private static canBeatStraight(hand: number[], target: Combination): boolean {
    const targetLength = target.lengthHint || 5;
    const possibleStraights = this.findStraights(hand, targetLength);
    
    return possibleStraights.some(straight => {
      const combination = analyzeCombination(straight);
      return canBeat(combination, target);
    });
  }

  /**
   * 检查是否能压制连对
   */
  private static canBeatStraightPair(hand: number[], target: Combination): boolean {
    const targetLength = target.lengthHint || 6;
    const possibleStraightPairs = this.findStraightPairs(hand, targetLength);
    
    return possibleStraightPairs.some(straightPair => {
      const combination = analyzeCombination(straightPair);
      return canBeat(combination, target);
    });
  }

  /**
   * 检查是否能压制炸弹
   */
  private static canBeatBomb(hand: number[], target: Combination): boolean {
    // 火箭可以压制任何炸弹
    if (hand.includes(53) && hand.includes(54)) {
      return true;
    }

    // 检查是否有更大的炸弹
    const bombs = this.hasBombs(hand);
    return bombs.some(bombValue => bombValue > target.power);
  }

  /**
   * 检查是否能压制四带二单
   */
  private static canBeatFourSingle(hand: number[], target: Combination): boolean {
    const valueCount = this.getValueCount(hand);
    
    if (hand.length < 6) return false;

    for (const [value, count] of valueCount.entries()) {
      if (count >= 4 && value > target.power) {
        // 检查是否还有至少2张单牌
        const remainingCards = hand.length - 4;
        if (remainingCards >= 2) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 检查是否能压制四带二对
   */
  private static canBeatFourPair(hand: number[], target: Combination): boolean {
    const valueCount = this.getValueCount(hand);
    
    if (hand.length < 8) return false;

    for (const [value, count] of valueCount.entries()) {
      if (count >= 4 && value > target.power) {
        // 检查是否还有至少2个对子
        let pairCount = 0;
        for (const [pairValue, pairCountVal] of valueCount.entries()) {
          if (pairValue !== value && pairCountVal >= 2) {
            pairCount++;
          }
        }
        if (pairCount >= 2) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 检查是否能压制飞机类牌型（简化实现）
   */
  private static canBeatPlane(hand: number[], target: Combination): boolean {
    // 飞机类牌型比较复杂，这里使用简化实现
    // 实际实现需要考虑连续三张的数量和带牌情况
    const valueCount = this.getValueCount(hand);
    const targetTriples = target.planeTriples || 2;
    
    // 检查是否有足够的连续三张
    let consecutiveTriples = 0;
    let maxTripleValue = 0;
    
    const sortedValues = Array.from(valueCount.keys()).sort((a, b) => a - b);
    
    for (let i = 0; i < sortedValues.length; i++) {
      const value = sortedValues[i];
      if (valueCount.get(value)! >= 3) {
        if (i > 0 && sortedValues[i-1] === value - 1) {
          consecutiveTriples++;
        } else {
          consecutiveTriples = 1;
        }
        
        if (consecutiveTriples >= targetTriples) {
          maxTripleValue = value;
        }
      } else {
        consecutiveTriples = 0;
      }
    }
    
    return maxTripleValue > target.power;
  }

  /**
   * 获取手牌中的值计数映射
   */
  private static getValueCount(hand: number[]): Map<number, number> {
    const valueCount = new Map<number, number>();
    for (const card of hand) {
      const value = entityToValue(card);
      valueCount.set(value, (valueCount.get(value) || 0) + 1);
    }
    return valueCount;
  }

  /**
   * 查找手牌中的炸弹
   */
  private static hasBombs(hand: number[]): number[] {
    const valueCount = this.getValueCount(hand);
    const bombs: number[] = [];
    
    for (const [value, count] of valueCount.entries()) {
      if (count >= 4) {
        bombs.push(value);
      }
    }
    
    return bombs.sort((a, b) => a - b);
  }

  /**
   * 查找可能的顺子组合（简化实现）
   */
  private static findStraights(hand: number[], length: number): number[][] {
    const straights: number[][] = [];
    const valueCount = this.getValueCount(hand);
    const values = Array.from(valueCount.keys()).sort((a, b) => a - b);
    
    // 简化：只查找基本顺子，不含2和王
    const validValues = values.filter(v => v >= 3 && v <= 14);
    
    for (let start = 0; start <= validValues.length - length; start++) {
      let isConsecutive = true;
      const straightCards: number[] = [];
      
      for (let i = 0; i < length; i++) {
        const expectedValue = validValues[start] + i;
        if (!validValues.includes(expectedValue) || valueCount.get(expectedValue)! < 1) {
          isConsecutive = false;
          break;
        }
        // 找到对应的实际卡牌ID
        const cardId = hand.find(card => entityToValue(card) === expectedValue);
        if (cardId) {
          straightCards.push(cardId);
        }
      }
      
      if (isConsecutive && straightCards.length === length) {
        straights.push(straightCards);
      }
    }
    
    return straights;
  }

  /**
   * 查找可能的连对组合（简化实现）
   */
  private static findStraightPairs(hand: number[], length: number): number[][] {
    const straightPairs: number[][] = [];
    const valueCount = this.getValueCount(hand);
    const values = Array.from(valueCount.keys()).sort((a, b) => a - b);
    
    const pairLength = length / 2;
    const validValues = values.filter(v => v >= 3 && v <= 14 && valueCount.get(v)! >= 2);
    
    for (let start = 0; start <= validValues.length - pairLength; start++) {
      let isConsecutive = true;
      const straightPairCards: number[] = [];
      
      for (let i = 0; i < pairLength; i++) {
        const expectedValue = validValues[start] + i;
        if (!validValues.includes(expectedValue) || valueCount.get(expectedValue)! < 2) {
          isConsecutive = false;
          break;
        }
        // 找到对应的实际卡牌ID（需要2张）
        const cardsOfValue = hand.filter(card => entityToValue(card) === expectedValue);
        if (cardsOfValue.length >= 2) {
          straightPairCards.push(...cardsOfValue.slice(0, 2));
        }
      }
      
      if (isConsecutive && straightPairCards.length === length) {
        straightPairs.push(straightPairCards);
      }
    }
    
    return straightPairs;
  }

  /**
   * 获取简单的出牌建议
   */
  static getPlaySuggestion(hand: number[], lastCombination: Combination | null): {
    canPlay: boolean;
    suggestion: string;
    recommendedCards?: number[];
  } {
    if (!lastCombination || lastCombination.type === CombinationType.Invalid) {
      return {
        canPlay: true,
        suggestion: "你可以出任意牌型"
      };
    }

    const canPlay = this.canHandBeat(hand, lastCombination);
    
    if (!canPlay) {
      return {
        canPlay: false,
        suggestion: "建议Pass - 手牌中没有能够压制的牌型"
      };
    }

    // 简单的推荐逻辑
    if (lastCombination.type === CombinationType.Single) {
      const betterSingles = hand.filter(card => entityToValue(card) > lastCombination.power);
      if (betterSingles.length > 0) {
        const minBetter = betterSingles.reduce((min, card) => 
          entityToValue(card) < entityToValue(min) ? card : min
        );
        return {
          canPlay: true,
          suggestion: `可以出更大的单张`,
          recommendedCards: [minBetter]
        };
      }
    }

    return {
      canPlay: true,
      suggestion: "可以出牌压制"
    };
  }
}
