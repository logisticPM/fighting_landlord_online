import { v4 as uuidv4 } from 'uuid';

export type Entity = number; // 1..54

type Player = { id: string; seat: number; hand: Entity[]; connectionId: string };
type Room = {
  id: string;
  players: Player[];
  landlordSeat: number | null;
  bottomCards: Entity[];
  currentSeat: number;
  lastPlay: Entity[];
  lastPlayOwnerSeat: number | null;
  started: boolean;
};

const rooms = new Map<string, Room>();

function createDeck(): Entity[] { const d: Entity[] = []; for (let i = 1; i <= 54; i++) d.push(i); return d; }
function shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function deal(deck: Entity[]): { hands: Entity[][]; bottom: Entity[] } {
  const s = shuffle([...deck]);
  const hands: Entity[][] = [[], [], []];
  for (let i = 0; i < 51; i++) hands[i % 3].push(s[i]);
  return { hands, bottom: s.slice(51) };
}

export function ensureRoomAndAddPlayer(roomId: string | undefined, _userId: string | undefined, connectionId: string) {
  const id = roomId && roomId.length > 0 ? roomId : uuidv4().slice(0, 6);
  let room = rooms.get(id);
  if (!room) {
    room = { id, players: [], landlordSeat: null, bottomCards: [], currentSeat: 0, lastPlay: [], lastPlayOwnerSeat: null, started: false };
    rooms.set(id, room);
  }
  if (room.players.length >= 3) throw new Error('Room full');
  const seat = room.players.length;
  room.players.push({ id: uuidv4(), seat, hand: [], connectionId });

  if (room.players.length === 3) {
    const deck = createDeck();
    const { hands, bottom } = deal(deck);
    room.started = true;
    room.landlordSeat = Math.floor(Math.random() * 3);
    room.bottomCards = bottom;
    for (let i = 0; i < 3; i++) room.players[i].hand = hands[i];
    room.players[room.landlordSeat].hand.push(...bottom);
    room.currentSeat = room.landlordSeat;
    room.lastPlay = [];
    room.lastPlayOwnerSeat = null;
  }

  return { id, seat };
}

export function snapshot(roomId: string, forConnectionId: string) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('No room');
  return {
    id: room.id,
    started: room.started,
    landlordSeat: room.landlordSeat,
    bottomCount: room.bottomCards.length,
    currentSeat: room.currentSeat,
    lastPlay: room.lastPlay,
    lastPlayOwnerSeat: room.lastPlayOwnerSeat,
    players: room.players.map((p) => ({ id: p.id, seat: p.seat, handCount: p.hand.length, hand: p.connectionId === forConnectionId ? p.hand : [] }))
  };
}

enum CombinationType { Invalid='invalid', Single='single', Pair='pair', Triple='triple', TripleSingle='triple_single', TriplePair='triple_pair', Bomb='bomb', Rocket='rocket' }
function analyzePlay(cards: Entity[]): { type: CombinationType; power: number } {
  if (!cards || cards.length === 0) return { type: CombinationType.Invalid, power: 0 };
  const c = cards.length;
  const v = cards.map((x) => (x % 13) + 3).sort((a, b) => a - b);
  if (c === 2 && cards.includes(53) && cards.includes(54)) return { type: CombinationType.Rocket, power: 100 };
  if (c === 4 && v[0] === v[3]) return { type: CombinationType.Bomb, power: v[0] + 50 };
  if (c === 3 && v[0] === v[2]) return { type: CombinationType.Triple, power: v[0] };
  if (c === 2 && v[0] === v[1]) return { type: CombinationType.Pair, power: v[0] };
  if (c === 4) { const m = new Map<number, number>(); v.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); if ([...m.values()].includes(3)) { const t = [...m.entries()].find((e) => e[1] === 3)![0]; return { type: CombinationType.TripleSingle, power: t }; } }
  if (c === 1) return { type: CombinationType.Single, power: v[0] };
  return { type: CombinationType.Invalid, power: 0 };
}
function canBeat(curr: { type: CombinationType; power: number }, last: { type: CombinationType; power: number } | null): boolean {
  if (!last) return curr.type !== CombinationType.Invalid;
  if (curr.type === CombinationType.Rocket) return true;
  if (curr.type === CombinationType.Bomb) { if (last.type === CombinationType.Rocket) return false; if (last.type === CombinationType.Bomb) return curr.power > last.power; return true; }
  if (curr.type !== last.type) return false;
  return curr.power > last.power;
}

export async function playCards(roomId: string, connectionId: string, cards: Entity[]) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('No room');
  const player = room.players.find((p) => p.connectionId === connectionId);
  if (!player) throw new Error('No player');
  if (room.currentSeat !== player.seat) throw new Error('Not your turn');
  if (!cards.every((c) => player.hand.includes(c))) throw new Error('Cards not in hand');

  const curr = analyzePlay(cards);
  const last = room.lastPlay.length > 0 ? analyzePlay(room.lastPlay) : null;
  if (!canBeat(curr, last)) throw new Error('Invalid play');

  player.hand = player.hand.filter((x) => !cards.includes(x));
  room.lastPlay = cards;
  room.lastPlayOwnerSeat = player.seat;
  room.currentSeat = (room.currentSeat + 1) % 3;

  if (player.hand.length === 0) {
    // 简化：房间结束后重置
    rooms.delete(roomId);
  }
}

export async function passTurn(roomId: string, connectionId: string) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('No room');
  const player = room.players.find((p) => p.connectionId === connectionId);
  if (!player) throw new Error('No player');
  if (room.currentSeat !== player.seat) throw new Error('Not your turn');
  room.currentSeat = (room.currentSeat + 1) % 3;
}


