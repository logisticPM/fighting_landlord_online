import { analyzeCombination, canBeat, entityToValue, CombinationType, Combination } from '../rules/Combination';

describe('斗地主规则测试 (Dou Dizhu Rules Test)', () => {
  
  describe('卡牌数值映射测试 (Card Value Mapping)', () => {
    it('should correctly map card values according to Dou Dizhu rules', () => {
      // 测试数字牌 3-10
      expect(entityToValue(3)).toBe(3);   // 3♣
      expect(entityToValue(4)).toBe(4);   // 4♣
      expect(entityToValue(10)).toBe(10); // 10♣
      
      // 测试人头牌 J, Q, K
      expect(entityToValue(11)).toBe(11); // J♣
      expect(entityToValue(12)).toBe(12); // Q♣
      expect(entityToValue(13)).toBe(13); // K♣
      
      // 测试 A 和 2 (最重要的测试)
      expect(entityToValue(1)).toBe(14);  // A♣ - 应该是14
      expect(entityToValue(2)).toBe(15);  // 2♣ - 应该是15
      
      // 测试其他花色的相同排列
      expect(entityToValue(14)).toBe(14); // A♥
      expect(entityToValue(15)).toBe(15); // 2♥
      expect(entityToValue(25)).toBe(12); // Q♥
      expect(entityToValue(26)).toBe(13); // K♥
      
      // 测试王牌
      expect(entityToValue(53)).toBe(16); // 小王
      expect(entityToValue(54)).toBe(17); // 大王
    });

    it('should maintain correct card order: 3 < 4 < ... < J < Q < K < A < 2 < 小王 < 大王', () => {
      const cards = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, 53, 54]; // 3,4,5,6,7,8,9,10,J,Q,K,A,2,小王,大王
      const values = cards.map(entityToValue);
      const expectedValues = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
      expect(values).toEqual(expectedValues);
    });
  });

  describe('单张牌型测试 (Single Card Tests)', () => {
    it('should correctly identify single cards', () => {
      const single3 = analyzeCombination([3]);
      expect(single3.type).toBe(CombinationType.Single);
      expect(single3.power).toBe(3);

      const singleA = analyzeCombination([1]); // A♣
      expect(singleA.type).toBe(CombinationType.Single);
      expect(singleA.power).toBe(14);

      const single2 = analyzeCombination([2]); // 2♣
      expect(single2.type).toBe(CombinationType.Single);
      expect(single2.power).toBe(15);
    });

    it('should correctly compare single cards', () => {
      // A(14) 应该能压 Q(12)
      const Q = analyzeCombination([12]); // Q♣
      const A = analyzeCombination([1]);  // A♣
      expect(canBeat(A, Q)).toBe(true);

      // K(13) 应该能压 Q(12)
      const K = analyzeCombination([13]); // K♣
      expect(canBeat(K, Q)).toBe(true);

      // 2(15) 应该能压 A(14)
      const two = analyzeCombination([2]); // 2♣
      expect(canBeat(two, A)).toBe(true);

      // 小王(16) 应该能压 2(15)
      const smallJoker = analyzeCombination([53]);
      expect(canBeat(smallJoker, two)).toBe(true);

      // 大王(17) 应该能压小王(16)
      const bigJoker = analyzeCombination([54]);
      expect(canBeat(bigJoker, smallJoker)).toBe(true);
    });
  });

  describe('对子测试 (Pair Tests)', () => {
    it('should correctly identify pairs', () => {
      const pair3 = analyzeCombination([3, 16]); // 3♣3♥
      expect(pair3.type).toBe(CombinationType.Pair);
      expect(pair3.power).toBe(3);

      const pairA = analyzeCombination([1, 14]); // A♣A♥
      expect(pairA.type).toBe(CombinationType.Pair);
      expect(pairA.power).toBe(14);
    });

    it('should correctly compare pairs', () => {
      const pairQ = analyzeCombination([12, 25]); // Q♣Q♥
      const pairA = analyzeCombination([1, 14]);  // A♣A♥
      expect(canBeat(pairA, pairQ)).toBe(true);
    });
  });

  describe('三张测试 (Triple Tests)', () => {
    it('should correctly identify triples', () => {
      const triple5 = analyzeCombination([5, 18, 31]); // 5♣5♥5♠
      expect(triple5.type).toBe(CombinationType.Triple);
      expect(triple5.power).toBe(5);
    });

    it('should correctly identify triple with single', () => {
      const tripleSingle = analyzeCombination([5, 18, 31, 7]); // 555 + 7
      expect(tripleSingle.type).toBe(CombinationType.TripleSingle);
      expect(tripleSingle.power).toBe(5);
    });

    it('should correctly identify triple with pair', () => {
      const triplePair = analyzeCombination([5, 18, 31, 7, 20]); // 555 + 77
      expect(triplePair.type).toBe(CombinationType.TriplePair);
      expect(triplePair.power).toBe(5);
    });
  });

  describe('顺子测试 (Straight Tests)', () => {
    it('should correctly identify valid straights', () => {
      // 正常顺子：3-4-5-6-7
      const straight = analyzeCombination([3, 4, 5, 6, 7]);
      expect(straight.type).toBe(CombinationType.Straight);
      expect(straight.power).toBe(7);

      // 长顺子：10-J-Q-K-A
      const longStraight = analyzeCombination([10, 11, 12, 13, 1]); // 10,J,Q,K,A
      expect(longStraight.type).toBe(CombinationType.Straight);
      expect(longStraight.power).toBe(14); // A是最大的
    });

    it('should reject invalid straights with 2 or jokers', () => {
      // 不能有2参与的顺子
      const invalidWith2 = analyzeCombination([13, 1, 2, 3, 4]); // K-A-2-3-4
      expect(invalidWith2.type).toBe(CombinationType.Invalid);

      // 不能有王参与的顺子
      const invalidWithJoker = analyzeCombination([11, 12, 13, 1, 53]); // J-Q-K-A-小王
      expect(invalidWithJoker.type).toBe(CombinationType.Invalid);
    });

    it('should require minimum 5 cards for straight', () => {
      const tooShort = analyzeCombination([3, 4, 5, 6]); // 只有4张
      expect(tooShort.type).toBe(CombinationType.Invalid);
    });
  });

  describe('连对测试 (Straight Pair Tests)', () => {
    it('should correctly identify straight pairs', () => {
      // 连对：33-44-55
      const straightPair = analyzeCombination([3, 16, 4, 17, 5, 18]); // 3♣3♥ 4♣4♥ 5♣5♠
      expect(straightPair.type).toBe(CombinationType.StraightPair);
      expect(straightPair.power).toBe(5);
    });

    it('should reject straight pairs with 2 or jokers', () => {
      // 连对不能包含2
      const invalidStraightPair = analyzeCombination([13, 26, 1, 14, 2, 15]); // KK-AA-22
      expect(invalidStraightPair.type).toBe(CombinationType.Invalid);
    });
  });

  describe('炸弹测试 (Bomb Tests)', () => {
    it('should correctly identify bombs', () => {
      const bomb5 = analyzeCombination([5, 18, 31, 44]); // 5♣5♥5♠5♦
      expect(bomb5.type).toBe(CombinationType.Bomb);
      expect(bomb5.power).toBe(5);

      const bombA = analyzeCombination([1, 14, 27, 40]); // A♣A♥A♠A♦
      expect(bombA.type).toBe(CombinationType.Bomb);
      expect(bombA.power).toBe(14);
    });

    it('should correctly identify rocket (joker pair)', () => {
      const rocket = analyzeCombination([53, 54]); // 小王大王
      expect(rocket.type).toBe(CombinationType.Rocket);
      expect(rocket.power).toBe(100); // 火箭有特殊的power值
    });

    it('bombs should beat regular combinations', () => {
      const bomb = analyzeCombination([5, 18, 31, 44]); // 炸弹
      const triple = analyzeCombination([1, 14, 27]); // 三张A

      expect(canBeat(bomb, triple)).toBe(true);
    });

    it('rockets should beat bombs', () => {
      const rocket = analyzeCombination([53, 54]); // 火箭
      const bomb = analyzeCombination([2, 15, 28, 41]); // 2的炸弹

      expect(canBeat(rocket, bomb)).toBe(true);
    });

    it('higher bombs should beat lower bombs', () => {
      const lowBomb = analyzeCombination([3, 16, 29, 42]); // 3炸弹
      const highBomb = analyzeCombination([1, 14, 27, 40]); // A炸弹

      expect(canBeat(highBomb, lowBomb)).toBe(true);
    });
  });

  describe('四带二测试 (Four With Attachments)', () => {
    it('should correctly identify four with two singles', () => {
      const fourSingle = analyzeCombination([5, 18, 31, 44, 7, 9]); // 5555 + 7 + 9
      expect(fourSingle.type).toBe(CombinationType.FourSingle);
      expect(fourSingle.power).toBe(5);
    });

    it('should correctly identify four with two pairs', () => {
      const fourPair = analyzeCombination([5, 18, 31, 44, 7, 20, 9, 22]); // 5555 + 77 + 99
      expect(fourPair.type).toBe(CombinationType.FourPair);
      expect(fourPair.power).toBe(5);
    });
  });

  describe('飞机测试 (Plane Tests)', () => {
    it('should correctly identify planes (consecutive triples)', () => {
      // 飞机：333-444
      const plane = analyzeCombination([3, 16, 29, 4, 17, 30]); // 3♣3♥3♠ 4♣4♥4♠
      expect(plane.type).toBe(CombinationType.Plane);
      expect(plane.power).toBe(4); // 以最大的三张为准
    });

    it('should correctly identify plane with singles', () => {
      // 飞机带单：333-444 + 5 + 6
      const planeSingle = analyzeCombination([3, 16, 29, 4, 17, 30, 5, 6]);
      expect(planeSingle.type).toBe(CombinationType.PlaneSingle);
      expect(planeSingle.power).toBe(4);
    });

    it('should correctly identify plane with pairs', () => {
      // 飞机带对：333-444 + 55 + 66
      const planePair = analyzeCombination([3, 16, 29, 4, 17, 30, 5, 18, 6, 19]);
      expect(planePair.type).toBe(CombinationType.PlanePair);
      expect(planePair.power).toBe(4);
    });
  });

  describe('相同牌型对比测试 (Same Type Comparison)', () => {
    it('should only allow beating with same type (except bombs)', () => {
      const single = analyzeCombination([5]);
      const pair = analyzeCombination([6, 19]);
      
      // 不同牌型不能互相压制
      expect(canBeat(pair, single)).toBe(false);
      expect(canBeat(single, pair)).toBe(false);
    });

    it('should require same length for straights', () => {
      const shortStraight = analyzeCombination([3, 4, 5, 6, 7]); // 5张顺子
      const longStraight = analyzeCombination([3, 4, 5, 6, 7, 8]); // 6张顺子
      
      // 不同长度的顺子不能互相压制
      expect(canBeat(longStraight, shortStraight)).toBe(false);
    });
  });

  describe('边界情况测试 (Edge Cases)', () => {
    it('should reject empty card arrays', () => {
      const empty = analyzeCombination([]);
      expect(empty.type).toBe(CombinationType.Invalid);
    });

    it('should reject invalid card IDs', () => {
      const invalid = analyzeCombination([0]); // 无效ID
      expect(invalid.type).toBe(CombinationType.Invalid);
    });

    it('should reject mixed invalid combinations', () => {
      const mixed = analyzeCombination([3, 4, 5]); // 3张不同的牌，既不是顺子也不是其他牌型
      expect(mixed.type).toBe(CombinationType.Invalid);
    });
  });

  describe('实际游戏场景测试 (Real Game Scenarios)', () => {
    it('scenario: A beats Q (the original bug)', () => {
      const Q = analyzeCombination([12]); // Q♣
      const A = analyzeCombination([1]);  // A♣
      
      expect(Q.power).toBe(12);
      expect(A.power).toBe(14);
      expect(canBeat(A, Q)).toBe(true);
    });

    it('scenario: typical progression 3 -> 4 -> 5 -> ... -> K -> A -> 2', () => {
      const cards = [3, 4, 5, 10, 11, 12, 13, 1, 2]; // 3,4,5,10,J,Q,K,A,2
      
      for (let i = 1; i < cards.length; i++) {
        const lower = analyzeCombination([cards[i-1]]);
        const higher = analyzeCombination([cards[i]]);
        expect(canBeat(higher, lower)).toBe(true);
      }
    });

    it('scenario: bomb beats everything except higher bomb/rocket', () => {
      const bomb = analyzeCombination([5, 18, 31, 44]); // 5炸弹
      const straight = analyzeCombination([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // 10张顺子
      const triple = analyzeCombination([1, 14, 27]); // 三张A
      const pair2 = analyzeCombination([2, 15]); // 对2
      
      expect(canBeat(bomb, straight)).toBe(true);
      expect(canBeat(bomb, triple)).toBe(true);
      expect(canBeat(bomb, pair2)).toBe(true);
    });
  });
});
