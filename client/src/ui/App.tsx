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
  turnSecondsRemaining?: number;
};

export const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [seat, setSeat] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bidState, setBidState] = useState<{ biddingSeat: number; currentBid: number; secondsRemaining?: number } | null>(null);
  const [turnSeconds, setTurnSeconds] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['websocket'] });
    setSocket(s);
    
    // Connection status handlers
    s.on('connect', () => {
      setIsConnecting(false);
      setConnectionError(null);
    });
    
    s.on('disconnect', () => {
      setIsConnecting(true);
      setConnectionError('Connection lost. Attempting to reconnect...');
    });
    
    s.on('connect_error', (error) => {
      setIsConnecting(false);
      setConnectionError(`Connection failed: ${error.message}`);
    });
    
    // Game event handlers
    s.on('room:update', (sn: Snapshot) => setSnap(sn));
    s.on('game:started', (sn: Snapshot) => {
      console.log('Game started! Landlord seat:', sn.landlordSeat);
      setSnap(sn);
      // Force re-render after game starts to ensure correct avatar display
      setTimeout(() => setSnap({...sn}), 50);
    });
    s.on('game:update', (sn: Snapshot) => setSnap(sn));
    s.on('bidding:started', (st: { biddingSeat: number; currentBid: number; secondsRemaining?: number }) => setBidState(st));
    s.on('bidding:state', (st: { biddingSeat: number; currentBid: number; secondsRemaining?: number }) => setBidState(st));
    s.on('bidding:ended', (_: any) => setBidState(null));
    s.on('game:ended', (payload: any) => alert(`Winner seat: ${payload.winnerSeat}`));
    s.on('game:redeal', (payload: any) => {
      alert(payload.message || 'All players passed. Redealing cards...');
      setSelected(new Set()); // Clear any selection
    });
    
    return () => {
      try { s.disconnect(); } catch { /* noop */ }
    };
  }, []);

  // After seat is assigned, proactively request a personalized snapshot once to avoid race
  useEffect(() => {
    if (!socket || seat === null || !roomId) return;
    try {
      socket.emit('room:snapshot', { roomId }, (ret: any) => {
        if (ret?.ok && ret.snap) setSnap(ret.snap as Snapshot);
      });
    } catch {}
  }, [socket, seat, roomId]);

  // Local ticking countdown for turn timer
  useEffect(() => {
    if (!snap || typeof snap.turnSecondsRemaining !== 'number') {
      setTurnSeconds(null);
      return;
    }
    setTurnSeconds(snap.turnSecondsRemaining);
    const t = setInterval(() => setTurnSeconds(v => v === null ? null : Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [snap?.turnSecondsRemaining]);

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
      if (!ret?.ok) {
        alert(ret?.error || 'invalid play');
      } else {
        setSelected(new Set()); // Clear selection after successful play
      }
    });
  };

  const pass = () => {
    if (!socket || !roomId) return;
    socket.emit('play:pass', { roomId }, (ret: any) => {
      if (!ret?.ok) alert(ret?.error || 'cannot pass');
    });
  };

  // Show connection status overlay if needed
  if (isConnecting) {
    return (
      <div className="game-root">
        <div className="connection-overlay">
          <div className="connection-message">
            <span className="loading-icon">🔄</span>
            <span>Connecting to server...</span>
          </div>
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="game-root">
        <div className="connection-overlay error">
          <div className="connection-message">
            <span className="error-icon">⚠️</span>
            <span>{connectionError}</span>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-root">
      {/* Pixi board */}
      {snap && seat !== null && (
        <PixiBoard 
          snap={snap} 
          mySeat={seat} 
          selected={selected} 
          onSelectedChange={setSelected}
          bidState={bidState}
          onBid={(amount: number) => {
            if (!socket || !roomId) return;
            socket.emit('bidding:bid', { roomId, amount }, (ret: any) => {
              if (!ret?.ok) alert(ret?.error || 'Bid failed');
            });
          }}
        />
      )}

      {/* React HUD overlay */}
      <div className="react-ui-container">
        {/* Top bar: room + state */}
        {snap && (
          <div className="game-info">
            <span>Room: {snap.id}</span>
            <span className={`turn-indicator ${snap.currentSeat === seat ? 'my-turn' : 'other-turn'}`}>
              {snap.currentSeat === seat ? '🎯 Your Turn' : `🔄 Player ${snap.currentSeat}'s Turn`}
            </span>
            <span>Landlord: {snap.landlordSeat !== null ? `Player ${snap.landlordSeat}` : '-'}</span>
            <span>Cards Left: {snap.bottomCount}</span>
            {typeof turnSeconds === 'number' && <span className="timer">⏱️ {turnSeconds}s</span>}
          </div>
        )}



        {/* Central turn indicator */}
        {snap && snap.started && (
          <div className="central-turn-indicator">
            <div className={`turn-display ${snap.currentSeat === seat ? 'my-turn-highlight' : 'other-turn-highlight'}`}>
              {snap.currentSeat === seat ? (
                <div className="my-turn-text">
                  <span className="turn-icon">🎮</span>
                  <span className="turn-message">Your Turn to Play!</span>
                  {typeof turnSeconds === 'number' && <span className="countdown">{turnSeconds}s left</span>}
                </div>
              ) : (
                <div className="other-turn-text">
                  <span className="turn-icon">⏳</span>
                  <span className="turn-message">Player {snap.currentSeat} is playing...</span>
                  {typeof turnSeconds === 'number' && <span className="countdown">{turnSeconds}s left</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom controls similar to single-player */}
        {snap && seat !== null && (
          <div className="bottom-controls">
            {snap.started ? (
              <div className="playing-controls">
                {/* 出牌建议显示 */}
                {snap.playSuggestion && snap.currentSeat === seat && (
                  <div className={`play-suggestion ${snap.playSuggestion.canPlay ? 'can-play' : 'should-pass'}`}>
                    <span className="suggestion-icon">
                      {snap.playSuggestion.canPlay ? '💡' : '🚫'}
                    </span>
                    <span className="suggestion-text">{snap.playSuggestion.suggestion}</span>
                  </div>
                )}
                <div className="player-action-buttons">
                  <button 
                    className="play-btn" 
                    onClick={() => play(Array.from(selected))} 
                    disabled={selected.size === 0 || snap.currentSeat !== seat}
                  >
                    Play
                  </button>
                  <button 
                    className="pass-btn" 
                    onClick={() => pass()} 
                    disabled={snap.currentSeat !== seat || (snap.lastPlay.length === 0 || snap.lastPlayOwnerSeat === seat)}
                  >
                    Pass
                  </button>
                  <button onClick={() => setSelected(new Set())}>Clear</button>
                </div>
                {snap.currentSeat !== seat && (
                  <div className="waiting-indicator">Waiting for player {snap.currentSeat}...</div>
                )}
              </div>
            ) : (
              bidState ? (
                <div className="waiting-bidding">Turn: Seat {bidState.biddingSeat} | Current Bid: {bidState.currentBid} | Time: {bidState.secondsRemaining ?? 10}s</div>
              ) : null
            )}
          </div>
        )}

        {/* Join controls when not in a seat */}
        {seat === null && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input placeholder="Room ID (blank to create)" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
              <button onClick={joinRoom}>Join</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
