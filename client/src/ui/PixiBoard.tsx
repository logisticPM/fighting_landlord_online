import React, { useEffect, useMemo, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { spriteSheetLoader } from '../game/SpriteSheetLoader';
import { idToTextureKey, Entity } from '../game/cardMapping';

export type Snapshot = {
  id: string;
  started: boolean;
  landlordSeat: number | null;
  bottomCount: number;
  bottom?: Entity[];
  currentSeat: number;
  lastPlay: Entity[];
  lastPlayOwnerSeat: number | null;
  players: { id: string; seat: number; handCount: number; hand: Entity[] }[];
};

type Props = {
  snap: Snapshot | null;
  mySeat: number | null;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  width?: number;
  height?: number;
};

export const PixiBoard: React.FC<Props> = ({ snap, mySeat, selected, onSelectedChange, width = 1280, height = 720 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const layersRef = useRef<{ table: PIXI.Container; hands: PIXI.Container; center: PIXI.Container } | null>(null);

  useEffect(() => {
    let disposed = false;
    const bootstrap = async () => {
      await spriteSheetLoader.loadSpriteSheets();
      if (disposed) return;

      // Support both Pixi v7 (no async init) and v8 (async init)
      const hasAsyncInit = typeof (PIXI as any).Application?.prototype?.init === 'function';
      let app: any;
      if (hasAsyncInit) {
        app = new (PIXI as any).Application();
        await app.init({ width, height, background: 0xffffff, antialias: true });
      } else {
        app = new (PIXI as any).Application({ width, height, backgroundColor: 0xffffff, antialias: true });
      }
      appRef.current = app as PIXI.Application;

      const table = new PIXI.Container();
      const hands = new PIXI.Container();
      const center = new PIXI.Container();
      app.stage.addChild(table, center, hands);
      layersRef.current = { table, hands, center };

      // White background is handled by app background; keep table for future decorations

      if (containerRef.current) {
        const canvasEl: HTMLCanvasElement | undefined = (app as any).view ?? (app as any).canvas;
        // Ensure container has explicit size so canvas is visible
        try {
          (containerRef.current as HTMLDivElement).style.width = `${width}px`;
          (containerRef.current as HTMLDivElement).style.height = `${height}px`;
        } catch {}
        if (canvasEl) {
          try {
            canvasEl.style.display = 'block';
            canvasEl.style.width = `${width}px`;
            canvasEl.style.height = `${height}px`;
          } catch {}
          containerRef.current.appendChild(canvasEl);
        } else {
          // Fallback: attach renderer view if present
          const fallback = (app.renderer as any)?.view?.canvas || (app.renderer as any)?.view;
          if (fallback) containerRef.current.appendChild(fallback);
        }
      } else {
        // Extreme fallback to ensure visibility in production
        const canvasEl: HTMLCanvasElement | undefined = (app as any).view ?? (app as any).canvas;
        if (canvasEl) document.body.appendChild(canvasEl);
      }
      renderScene();
    };
    bootstrap();
    return () => {
      disposed = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myHand = useMemo(() => {
    if (!snap || mySeat === null) return [] as Entity[];
    const raw = snap.players.find((p) => p.seat === mySeat)?.hand || [];
    // Sort by Dou Dizhu order: Rocket > Bomb values; 2 > A > K ... > 3
    const rankValue: Record<string, number> = { '2': 15, 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3 };
    const getValue = (id: Entity): number => {
      if (id === 54) return 17; // big joker
      if (id === 53) return 16; // small joker
      // Map via texture key -> rank extraction
      const key = idToTextureKey(id);
      // Keys like "Hearts_Queen_white.png" or "Pikes_10_white.png"
      const match = key.match(/_(A|K|Q|J|10|9|8|7|6|5|4|3|2)_/);
      const rank = match ? match[1] : '3';
      return rankValue[rank] || 3;
    };
    return [...raw].sort((a, b) => getValue(b) - getValue(a));
  }, [snap, mySeat]);

  const renderScene = () => {
    const app = appRef.current;
    const layers = layersRef.current;
    if (!app || !layers) return;

    const { hands, center } = layers;
    hands.removeChildren();
    center.removeChildren();

    // Render my hand (bottom center)
    const spacing = 36;
    const scale = 0.9;
    const baseY = height - 220;
    const startX = (width - (myHand.length - 1) * spacing - 128 * scale) / 2;
    const cardFromKey = (key: string) => {
      const tex = PIXI.Assets.cache.get(key) || spriteSheetLoader.getTexture(key) || PIXI.Texture.WHITE;
      const sp = new PIXI.Sprite(tex);
      sp.tint = tex === PIXI.Texture.WHITE ? 0xeeeeee : 0xffffff;
      sp.width = 128; sp.height = 178;
      return sp;
    };

    myHand.forEach((id, idx) => {
      const key = idToTextureKey(id);
      const sp = cardFromKey(key);
      sp.scale.set(scale);
      const isSelected = selected.has(id);
      sp.position.set(startX + idx * spacing, baseY - (isSelected ? 28 : 0));
      sp.eventMode = 'static';
      sp.cursor = 'pointer';
      sp.on('pointertap', () => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectedChange(next);
        // re-render selection offset
        renderScene();
      });
      hands.addChild(sp);
    });

    // Render opponents as card backs (left/right)
    if (snap) {
      const backTex = PIXI.Assets.cache.get('cardback.png') || spriteSheetLoader.getTexture('cardback.png') || PIXI.Texture.WHITE;
      const opponents = snap.players.filter((p) => p.seat !== mySeat);
      opponents.forEach((p, i) => {
        const vertical = i === 0; // left first, right second
        const count = p.handCount;
        const gap = 20;
        for (let k = 0; k < count; k++) {
          const sp = new PIXI.Sprite(backTex);
          if (backTex === PIXI.Texture.WHITE) { sp.width = 128; sp.height = 178; sp.tint = 0xcccccc; }
          sp.scale.set(0.6);
          if (vertical) {
            sp.position.set(40, 120 + k * gap);
          } else {
            sp.position.set(width - 40 - sp.width, 120 + k * gap);
          }
          hands.addChild(sp);
        }
      });
    }

    // Render last play in center
    if (snap && snap.lastPlay && snap.lastPlay.length > 0) {
      const centerY = height / 2 - 90;
      const centerSpacing = 40;
      const totalWidth = (snap.lastPlay.length - 1) * centerSpacing + 128 * 0.8;
      const startX = (width - totalWidth) / 2;
      snap.lastPlay.forEach((id, idx) => {
        const key = idToTextureKey(id);
        const sp = cardFromKey(key);
        sp.scale.set(0.8);
        sp.position.set(startX + idx * centerSpacing, centerY);
        center.addChild(sp);
      });
    }

    // Render bottom cards at top center (face up)
    if (snap && Array.isArray((snap as any).bottom) && (snap as any).bottom.length > 0) {
      const list = (snap as any).bottom as Entity[];
      const s = 0.7;
      const spacing2 = 36;
      const totalWidth = (list.length - 1) * spacing2 + 128 * s;
      const startX = (width - totalWidth) / 2;
      const y = 80;
      list.forEach((id, idx) => {
        const sp = cardFromKey(idToTextureKey(id));
        sp.scale.set(s);
        sp.position.set(startX + idx * spacing2, y);
        center.addChild(sp);
      });
    }
  };

  useEffect(() => {
    renderScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, mySeat, selected]);

  return <div ref={containerRef} />;
};


