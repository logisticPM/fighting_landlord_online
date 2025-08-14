import React, { useEffect, useMemo, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { PixiBoard } from './PixiBoard';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:5179';

type Entity = number;

type Snapshot = {
  id: string;
  started: boolean;
  bidding?: boolean;
  currentBid?: number;
  biddingSeat?: number;
  landlordSeat: number | null;
  bottomCount: number;
  bottom?: number[];
  currentSeat: number;
  lastPlay: Entity[];
  lastPlayOwnerSeat: number | null;
  players: { id: string; seat: number; handCount: number; hand: Entity[] }[];
};

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [seat, setSeat] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bidState, setBidState] = useState<{ biddingSeat: number; currentBid: number; secondsRemaining?: number } | null>(null);

  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['websocket'] });
    setSocket(s);
    s.on('room:update', (sn: Snapshot) => setSnap(sn));
    s.on('game:started', (sn: Snapshot) => setSnap(sn));
    s.on('game:update', (sn: Snapshot) => setSnap(sn));
    s.on('bidding:started', (st: { biddingSeat: number; currentBid: number; secondsRemaining?: number }) => setBidState(st));
    s.on('bidding:state', (st: { biddingSeat: number; currentBid: number; secondsRemaining?: number }) => setBidState(st));
    s.on('bidding:ended', (_: any) => setBidState(null));
    s.on('game:ended', (payload: any) => alert(`Winner seat: ${payload.winnerSeat}`));
    return () => {
      try { s.disconnect(); } catch { /* noop */ }
    };
  }, []);

  const joinRoom = () => {
    if (!socket) return;
    socket.emit('room:join', { roomId }, (ret: any) => {
      if (ret?.ok) {
        setSeat(ret.seat);
        setRoomId(ret.roomId);
      } else alert(ret?.error || 'join failed');
    });
  };

  const myHand = useMemo(() => {
    if (!snap || seat === null) return [] as Entity[];
    const me = snap.players.find((p) => p.seat === seat);
    return me?.hand || [];
  }, [snap, seat]);

  const play = (cards: Entity[]) => {
    if (!socket || !roomId || cards.length === 0) return;
    socket.emit('play:cards', { roomId, cards }, (ret: any) => {
      if (!ret?.ok) alert(ret?.error || 'invalid play');
    });
  };

  const pass = () => {
    if (!socket || !roomId) return;
    socket.emit('play:pass', { roomId }, (ret: any) => {
      if (!ret?.ok) alert(ret?.error || 'cannot pass');
    });
  };

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h2>Landlord Online</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input placeholder="Room ID (blank to create)" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
        <button onClick={joinRoom}>Join</button>
        {seat !== null && <span>Seat: {seat}</span>}
      </div>

      {snap && (
        <div style={{ marginTop: 12 }}>
          <div>Room: {snap.id} | Started: {String(snap.started)} | Turn Seat: {snap.currentSeat}</div>
          <div>Landlord Seat: {snap.landlordSeat} | Bottom: {snap.bottomCount}</div>
          <div>Last Play: {snap.lastPlay?.join(', ') || '-'}</div>
        </div>
      )}

      {/* Bidding UI */}
      {snap && bidState && (
        <div style={{ marginTop: 12, padding: 8, background: '#fff', display: 'inline-block', border: '1px solid #ccc' }}>
          <div>Bid turn: Seat {bidState.biddingSeat} | Current bid: {bidState.currentBid} | Time: {bidState.secondsRemaining ?? 10}s</div>
          {seat === bidState.biddingSeat && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {[0,1,2,3].map(v => (
                <button key={v} onClick={() => socket?.emit('bidding:bid', { roomId, amount: v }, () => {})} disabled={v<= (bidState?.currentBid ?? 0) && v!==0}>{v===0?'Pass':`Bid ${v}`}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {snap && seat !== null && (
        <div style={{ marginTop: 16 }}>
          <PixiBoard snap={snap} mySeat={seat} selected={selected} onSelectedChange={setSelected} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => play(Array.from(selected))} disabled={selected.size === 0}>Play selected</button>
            <button onClick={() => play(myHand.slice(0, 1))} disabled={myHand.length === 0}>Play first card</button>
            <button onClick={() => pass()}>Pass</button>
            <button onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        </div>
      )}
    </div>
  );
};
