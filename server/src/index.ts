import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

type PlayerId = string;

type Entity = number;

enum CombinationType {
  Invalid = 'invalid',
  Single = 'single',
  Pair = 'pair',
  Triple = 'triple',
  TripleSingle = 'triple_single',
  TriplePair = 'triple_pair',
  Straight = 'straight',
  StraightPair = 'straight_pair',
  Bomb = 'bomb',
  Rocket = 'rocket',
}

interface PlayerState {
  id: PlayerId;
  seat: number;
  hand: Entity[];
  socketId: string;
}

interface RoomState {
  id: string;
  players: PlayerState[];
  landlordSeat: number | null;
  bottomCards: Entity[];
  currentSeat: number;
  lastPlay: Entity[];
  lastPlayOwnerSeat: number | null;
  started: boolean;
  passCount: number;
  bidding: boolean;
  currentBid: number; // 0..3
  biddingSeat: number; // whose turn to bid
  provisionalLandlordSeat: number | null;
}

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Basic health and root endpoints for platform smoke checks
app.get('/', (_req, res) => res.status(200).send('OK'));
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

const PORT = Number(process.env.PORT) || 5179;

const rooms: Map<string, RoomState> = new Map();

function createDeck(): Entity[] {
  const deck: Entity[] = [];
  for (let i = 1; i <= 54; i++) deck.push(i);
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deal(deck: Entity[]): { hands: Entity[][]; bottom: Entity[] } {
  const shuffled = shuffle([...deck]);
  const hands: Entity[][] = [[], [], []];
  for (let i = 0; i < 51; i++) hands[i % 3].push(shuffled[i]);
  const bottom = shuffled.slice(51);
  return { hands, bottom };
}

function analyzePlay(cards: Entity[]): { type: CombinationType; power: number } {
  if (!cards || cards.length === 0) return { type: CombinationType.Invalid, power: 0 };
  const count = cards.length;
  const values = cards.map((c) => (c % 13) + 3).sort((a, b) => a - b);

  if (count === 2 && cards.includes(53) && cards.includes(54)) return { type: CombinationType.Rocket, power: 100 };
  if (count === 4 && values[0] === values[3]) return { type: CombinationType.Bomb, power: values[0] + 50 };
  if (count === 3 && values[0] === values[2]) return { type: CombinationType.Triple, power: values[0] };
  if (count === 2 && values[0] === values[1]) return { type: CombinationType.Pair, power: values[0] };
  if (count === 4) {
    const map = new Map<number, number>();
    values.forEach((v) => map.set(v, (map.get(v) || 0) + 1));
    if ([...map.values()].includes(3)) {
      const tripleVal = [...map.entries()].find((e) => e[1] === 3)![0];
      return { type: CombinationType.TripleSingle, power: tripleVal };
    }
  }
  if (count === 5) {
    const map = new Map<number, number>();
    values.forEach((v) => map.set(v, (map.get(v) || 0) + 1));
    const has3 = [...map.values()].includes(3);
    const has2 = [...map.values()].includes(2);
    if (has3 && has2) {
      const tripleVal = [...map.entries()].find((e) => e[1] === 3)![0];
      return { type: CombinationType.TriplePair, power: tripleVal };
    }
  }
  if (count >= 5) {
    const set = Array.from(new Set(values));
    if (set.length === count) {
      // Only allow regular straights without 2/jokers
      if (set.every((v) => v < 15)) {
        let consecutive = true;
        for (let i = 1; i < set.length; i++) { if (set[i] !== set[i - 1] + 1) { consecutive = false; break; } }
        if (consecutive) return { type: CombinationType.Straight, power: set[set.length - 1] };
      }
    }
  }
  // Straight pairs (连对): at least 3 consecutive pairs, exclude 2/jokers
  if (count >= 6 && count % 2 === 0) {
    const map = new Map<number, number>();
    values.forEach((v) => map.set(v, (map.get(v) || 0) + 1));
    const keys = Array.from(map.keys()).sort((a, b) => a - b);
    if (keys.every((v) => v < 15) && keys.every((k) => map.get(k) === 2)) {
      let consecutive = true;
      for (let i = 1; i < keys.length; i++) { if (keys[i] !== keys[i - 1] + 1) { consecutive = false; break; } }
      if (consecutive) return { type: CombinationType.StraightPair, power: keys[keys.length - 1] };
    }
  }
  if (count === 1) return { type: CombinationType.Single, power: values[0] };
  return { type: CombinationType.Invalid, power: 0 };
}

function canBeat(
  curr: { type: CombinationType; power: number },
  last: { type: CombinationType; power: number } | null,
  currCount?: number,
  lastCount?: number
): boolean {
  if (!last) return curr.type !== CombinationType.Invalid;
  if (curr.type === CombinationType.Rocket) return true;
  if (curr.type === CombinationType.Bomb) {
    if (last.type === CombinationType.Rocket) return false;
    if (last.type === CombinationType.Bomb) return curr.power > last.power;
    return true;
  }
  if (curr.type !== last.type) return false;
  // When comparing straights/straight pairs, enforce same length if counts provided
  if ((curr.type === CombinationType.Straight || curr.type === CombinationType.StraightPair) && currCount !== undefined && lastCount !== undefined && currCount !== lastCount) return false;
  return curr.power > last.power;
}

function ensureRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      players: [],
      landlordSeat: null,
      bottomCards: [],
      currentSeat: 0,
      lastPlay: [],
      lastPlayOwnerSeat: null,
      started: false,
      passCount: 0,
      bidding: false,
      currentBid: 0,
      biddingSeat: 0,
      provisionalLandlordSeat: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

function snapshot(room: RoomState, forSocket: string) {
  return {
    id: room.id,
    started: room.started,
    bidding: room.bidding,
    currentBid: room.currentBid,
    biddingSeat: room.biddingSeat,
    landlordSeat: room.landlordSeat,
    bottomCount: room.bottomCards.length,
    bottom: room.started ? room.bottomCards : [],
    currentSeat: room.currentSeat,
    lastPlay: room.lastPlay,
    lastPlayOwnerSeat: room.lastPlayOwnerSeat,
    players: room.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      handCount: p.hand.length,
      hand: p.socketId === forSocket ? p.hand : [],
    })),
  };
}

// Send per-socket tailored snapshot so each player sees their own hand
function broadcastSnapshot(room: RoomState, event: 'room:update' | 'game:started' | 'game:update') {
  for (const p of room.players) {
    io.to(p.socketId).emit(event, snapshot(room, p.socketId));
  }
}

io.on('connection', (socket) => {
  socket.on('room:join', ({ roomId }: { roomId?: string }, cb?: (ret: any) => void) => {
    const id = roomId && roomId.length > 0 ? roomId : uuidv4().slice(0, 6);
    const room = ensureRoom(id);
    if (room.players.length >= 3) return cb?.({ ok: false, error: 'Room full' });

    const seat = room.players.length;
    const player: PlayerState = { id: uuidv4(), seat, hand: [], socketId: socket.id };
    room.players.push(player);
    socket.join(id);
    cb?.({ ok: true, roomId: id, seat });

    broadcastSnapshot(room, 'room:update');

    if (room.players.length === 3) {
      const deck = createDeck();
      const { hands, bottom } = deal(deck);
      // Start bidding phase
      room.bidding = true;
      room.currentBid = 0;
      room.biddingSeat = Math.floor(Math.random() * 3);
      room.provisionalLandlordSeat = null;
      room.bottomCards = bottom;
      for (let i = 0; i < 3; i++) room.players[i].hand = hands[i];
      io.to(id).emit('bidding:started', { biddingSeat: room.biddingSeat, currentBid: room.currentBid });
    }
  });

  socket.on('play:cards', ({ roomId, cards }: { roomId: string; cards: Entity[] }, cb?: (ret: any) => void) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ ok: false, error: 'No room' });
    if (room.bidding) return cb?.({ ok: false, error: 'Bidding not finished' });
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return cb?.({ ok: false, error: 'No player' });
    if (room.currentSeat !== player.seat) return cb?.({ ok: false, error: 'Not your turn' });

    if (!cards.every((c) => player.hand.includes(c))) return cb?.({ ok: false, error: 'Cards not in hand' });

    const curr = analyzePlay(cards);
    const last = room.lastPlay.length > 0 ? analyzePlay(room.lastPlay) : null;
    if (!canBeat(curr, last, cards.length, room.lastPlay.length)) return cb?.({ ok: false, error: 'Invalid play' });

    player.hand = player.hand.filter((c) => !cards.includes(c));
    room.lastPlay = cards;
    room.lastPlayOwnerSeat = player.seat;
    room.currentSeat = (room.currentSeat + 1) % 3;
    room.passCount = 0;

    broadcastSnapshot(room, 'game:update');
    cb?.({ ok: true });

    if (player.hand.length === 0) {
      io.to(roomId).emit('game:ended', { winnerSeat: player.seat });
      rooms.delete(roomId);
    }
  });

  socket.on('play:pass', ({ roomId }: { roomId: string }, cb?: (ret: any) => void) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ ok: false, error: 'No room' });
    if (room.bidding) return cb?.({ ok: false, error: 'Bidding not finished' });
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return cb?.({ ok: false, error: 'No player' });
    if (room.currentSeat !== player.seat) return cb?.({ ok: false, error: 'Not your turn' });

    if (room.lastPlay.length === 0 || room.lastPlayOwnerSeat === player.seat) {
      return cb?.({ ok: false, error: 'Cannot pass: you start the round or you played last' });
    }
    room.passCount++;
    room.currentSeat = (room.currentSeat + 1) % 3;
    if (room.passCount >= 2 && room.currentSeat === room.lastPlayOwnerSeat) {
      room.lastPlay = [];
      room.lastPlayOwnerSeat = null;
      room.passCount = 0;
    }
    broadcastSnapshot(room, 'game:update');
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const idx = room.players.findIndex((p) => p.socketId === socket.id);
      if (idx >= 0) {
        const roomId = room.id;
        room.players.splice(idx, 1);
        broadcastSnapshot(room, 'room:update');
        if (room.players.length === 0) rooms.delete(roomId);
        break;
      }
    }
  });

  // Bidding APIs
  socket.on('bidding:bid', ({ roomId, amount }: { roomId: string; amount: number }, cb?: (ret: any) => void) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ ok: false, error: 'No room' });
    if (!room.bidding) return cb?.({ ok: false, error: 'Not in bidding phase' });
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return cb?.({ ok: false, error: 'No player' });
    if (room.biddingSeat !== player.seat) return cb?.({ ok: false, error: 'Not your bid turn' });

    // amount: 0=pass, 1..3 bid value
    if (amount > room.currentBid) {
      room.currentBid = Math.min(amount, 3);
      room.provisionalLandlordSeat = player.seat;
    }

    // advance seat or finish
    if (room.currentBid === 3) {
      // max bid reached -> start game
      startPlaying(room);
      io.to(room.id).emit('bidding:ended', { landlordSeat: room.landlordSeat, currentBid: room.currentBid });
      broadcastSnapshot(room, 'game:started');
      return cb?.({ ok: true });
    }

    // move to next
    room.biddingSeat = (room.biddingSeat + 1) % 3;

    // If we have looped back and no one bid (>0), random landlord
    const everyoneBidOnce = room.biddingSeat === 0; // rough heuristic for 3 players starting seat 0
    if (everyoneBidOnce && room.currentBid === 0) {
      room.provisionalLandlordSeat = Math.floor(Math.random() * 3);
    }

    // If we are back to provisional landlord -> start
    if (room.provisionalLandlordSeat !== null && room.biddingSeat === room.provisionalLandlordSeat) {
      startPlaying(room);
      io.to(room.id).emit('bidding:ended', { landlordSeat: room.landlordSeat, currentBid: room.currentBid });
      broadcastSnapshot(room, 'game:started');
      return cb?.({ ok: true });
    }

    io.to(room.id).emit('bidding:state', { biddingSeat: room.biddingSeat, currentBid: room.currentBid, provisional: room.provisionalLandlordSeat });
    cb?.({ ok: true });
  });
});

server.listen(PORT, () => console.log(`Landlord online server listening on :${PORT}`));

// Helpers
function startPlaying(room: RoomState) {
  room.bidding = false;
  room.started = true;
  room.landlordSeat = room.provisionalLandlordSeat ?? 0;
  // Give bottom cards to landlord
  const landlord = room.players[room.landlordSeat];
  landlord.hand.push(...room.bottomCards);
  room.currentSeat = room.landlordSeat;
  room.lastPlay = [];
  room.lastPlayOwnerSeat = null;
  room.passCount = 0;
}
