export type PlayerLayout = { id: number; x: number; y: number; cardSpacing: number; scale: number };

export type GameData = {
  world: { width: number; height: number };
  layout: {
    landlordCards?: { startX?: number; y?: number; spacing?: number };
    landlord_cards?: { x: number; y: number; spacing: number };
    players: PlayerLayout[];
    player_played_cards?: { x: number; y: number };
  };
  card?: { width: number; height: number };
};

let cached: GameData | null = null;

export async function loadGameData(): Promise<GameData> {
  if (cached) return cached;
  const res = await fetch('/GameAssets/GameData.json');
  if (!res.ok) throw new Error('Failed to load GameData.json');
  cached = await res.json();
  return cached!;
}

export function getGameData(): GameData | null {
  return cached;
}


