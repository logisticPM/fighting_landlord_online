import React, { useEffect, useMemo, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { spriteSheetLoader } from '../game/SpriteSheetLoader';
import { idToTextureKey, Entity } from '../game/cardMapping';

export type Snapshot = {
  id: string;
  started: boolean;
  landlordSeat: number | null;
  bottomCount: number;
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

      const app = new PIXI.Application();
      await app.init({ width, height, background: 0x0f172a, antialias: true });
      appRef.current = app;

      const table = new PIXI.Container();
      const hands = new PIXI.Container();
      const center = new PIXI.Container();
      app.stage.addChild(table, center, hands);
      layersRef.current = { table, hands, center };

      // Title omitted to avoid Text plugin dependency

      if (containerRef.current) {
        const canvasEl = (app as any).view ?? (app as any).canvas;
        if (canvasEl) containerRef.current.appendChild(canvasEl);
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
    return snap.players.find((p) => p.seat === mySeat)?.hand || [];
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
    myHand.forEach((id, idx) => {
      const key = idToTextureKey(id);
      const tex = PIXI.Assets.cache.get(key) || spriteSheetLoader.getTexture(key);
      if (!tex) return;
      const sp = new PIXI.Sprite(tex);
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
      const backTex = PIXI.Assets.cache.get('cardback.png') || spriteSheetLoader.getTexture('cardback.png');
      const opponents = snap.players.filter((p) => p.seat !== mySeat);
      opponents.forEach((p, i) => {
        const vertical = i === 0; // left first, right second
        const count = p.handCount;
        const gap = 20;
        for (let k = 0; k < count; k++) {
          if (!backTex) break;
          const sp = new PIXI.Sprite(backTex);
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
        const tex = PIXI.Assets.cache.get(key) || spriteSheetLoader.getTexture(key);
        if (!tex) return;
        const sp = new PIXI.Sprite(tex);
        sp.scale.set(0.8);
        sp.position.set(startX + idx * centerSpacing, centerY);
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


