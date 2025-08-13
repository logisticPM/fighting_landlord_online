export type Entity = number; // 1..54

const suits = ['clubs', 'hearts', 'spades', 'diamonds'] as const;
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export function idToSuitRank(id: Entity): { suit?: (typeof suits)[number]; rank?: (typeof ranks)[number] } {
  if (id === 53 || id === 54) return {};
  const idx = id - 1;
  const suit = suits[Math.floor(idx / 13) % 4];
  const rank = ranks[idx % 13];
  return { suit, rank };
}

export function idToTextureKey(id: Entity): string {
  if (id === 53) return 'sjoker.png';
  if (id === 54) return 'joker.png';
  const { suit, rank } = idToSuitRank(id);
  if (!suit || !rank) return 'cardback.png';
  const suitMap: Record<string, string> = { clubs: 'Clovers', hearts: 'Hearts', spades: 'Pikes', diamonds: 'Tiles' };
  const rankMap: Record<string, string> = { A: 'A', K: 'King', Q: 'Queen', J: 'Jack', '10': '10', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2' };
  return `${suitMap[suit]}_${rankMap[rank]}_white.png`;
}


