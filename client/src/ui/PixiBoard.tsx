import React, { useEffect, useMemo, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { spriteSheetLoader } from '../game/SpriteSheetLoader';
import { loadGameData, getGameData, PlayerLayout } from '../game/GameData';
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
  const layersRef = useRef<{ table: PIXI.Container; hands: PIXI.Container; center: PIXI.Container; fx: PIXI.Container } | null>(null);
  const lastPlayKeyRef = useRef<string>('');
  const animatingIdsRef = useRef<Set<Entity>>(new Set());
  const prevHandRef = useRef<Entity[]>([]);

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
      const fx = new PIXI.Container();
      app.stage.addChild(table, center, hands, fx);
      layersRef.current = { table, hands, center, fx };

      // Background image (locked to background3.png as requested)
      try {
        const bg = await PIXI.Assets.load('/GameAssets/images/background3.png');
        const bgSprite = new PIXI.Sprite(bg as PIXI.Texture);
        bgSprite.width = width;
        bgSprite.height = height;
        bgSprite.position.set(0, 0);
        table.addChild(bgSprite);
      } catch {}

      // Load GameData for layout mapping
      try { await loadGameData(); } catch {}

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

    const { hands, center, fx } = layers;
    hands.removeChildren();

    // Layout from GameData mapping
    const gd = getGameData();
    const layouts: PlayerLayout[] = gd?.layout?.players ?? [
      { id: 0, x: width/2, y: height-80, cardSpacing: 35, scale: 0.8 },
      { id: 1, x: 100, y: 200, cardSpacing: 20, scale: 0.25 },
      { id: 2, x: width-100, y: 200, cardSpacing: 20, scale: 0.25 },
    ];
    const meCfg = layouts.find(p => p.id === (mySeat ?? 0)) ?? layouts[0];
    const spacing = meCfg.cardSpacing ?? 35;
    const scale = meCfg.scale ?? 0.8;
    const baseY = meCfg.y ?? (height - 80);
    const total = (myHand.length - 1) * spacing + 128 * scale;
    const startX = (meCfg.x ?? width/2) - total/2;
    const cardFromKey = (key: string) => {
      const tex = PIXI.Assets.cache.get(key) || spriteSheetLoader.getTexture(key) || PIXI.Texture.WHITE;
      const sp = new PIXI.Sprite(tex);
      sp.tint = tex === PIXI.Texture.WHITE ? 0xeeeeee : 0xffffff;
      sp.width = 128; sp.height = 178;
      return sp;
    };

    myHand.forEach((id, idx) => {
      if (animatingIdsRef.current.has(id)) return; // 跳过动画中的牌
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

    // Render opponents as card backs (left/right) using layout
    if (snap) {
      const backTex = PIXI.Assets.cache.get('cardback.png') || spriteSheetLoader.getTexture('cardback.png') || PIXI.Texture.WHITE;
      const opponents = snap.players.filter((p) => p.seat !== mySeat);
      opponents.forEach((p) => {
        const cfg = layouts.find(l => l.id === p.seat);
        const count = p.handCount;
        const gap = cfg?.cardSpacing ?? 20;
        for (let k = 0; k < count; k++) {
          const sp = new PIXI.Sprite(backTex);
          if (backTex === PIXI.Texture.WHITE) { sp.width = 128; sp.height = 178; sp.tint = 0xcccccc; }
          sp.scale.set(cfg?.scale ?? 0.25);
          const isLeft = (cfg?.x ?? 0) < width/2;
          if (isLeft) sp.position.set(cfg?.x ?? 100, (cfg?.y ?? 200) + k * gap);
          else sp.position.set((cfg?.x ?? width-100) - sp.width, (cfg?.y ?? 200) + k * gap);
          hands.addChild(sp);
        }
      });
    }

    // Render last play in center with simple fade/move animation
    const animate = (sprite: PIXI.DisplayObject, to: { x: number; y: number; alpha?: number; scale?: number }, duration = 300, onDone?: () => void) => {
      const fromX = (sprite as any).x ?? 0;
      const fromY = (sprite as any).y ?? 0;
      const fromAlpha = (sprite as any).alpha ?? 1;
      const fromScale = (sprite as any).scale?.x ?? 1;
      const toAlpha = to.alpha ?? fromAlpha;
      const toScale = to.scale ?? fromScale;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        (sprite as any).x = fromX + (to.x - fromX) * t;
        (sprite as any).y = fromY + (to.y - fromY) * t;
        (sprite as any).alpha = fromAlpha + (toAlpha - fromAlpha) * t;
        if ((sprite as any).scale && typeof toScale === 'number') {
          (sprite as any).scale.set(fromScale + (toScale - fromScale) * t);
        }
        if (t < 1) requestAnimationFrame(tick); else onDone?.();
      };
      requestAnimationFrame(tick);
    };

    const buildLastPlayKey = () => (snap ? `${snap.lastPlayOwnerSeat}|${(snap.lastPlay||[]).join(',')}` : '');
    const newKey = buildLastPlayKey();

    // If lastPlay becomes empty -> fade out old center
    if (snap && (!snap.lastPlay || snap.lastPlay.length === 0)) {
      if (lastPlayKeyRef.current && center.children.length > 0) {
        // fade out then clear
        center.children.forEach((c) => animate(c, { x: (c as any).x, y: (c as any).y + 20, alpha: 0 }, 250));
        setTimeout(() => center.removeChildren(), 260);
      } else {
        center.removeChildren();
      }
      lastPlayKeyRef.current = newKey;
    }

    if (snap && snap.lastPlay && snap.lastPlay.length > 0) {
      if (newKey !== lastPlayKeyRef.current) {
        const centerY = height / 2 - 90;
        const centerSpacing = 40;
        const totalWidth = (snap.lastPlay.length - 1) * centerSpacing + 128 * 0.82;
        const cxStart = (width - totalWidth) / 2;

        // 如果是我出的牌：从手牌位置飞向中央
        if (snap.lastPlayOwnerSeat === mySeat) {
          const ids = snap.lastPlay as Entity[];
          // 标记动画中，避免在手牌层重绘
          ids.forEach((id) => animatingIdsRef.current.add(id));

          const finishOne = () => {};
          let finished = 0;
          const done = () => {
            finished++;
            if (finished === ids.length) {
              // 动画结束后，渲染最终中央牌并清除 hand 动画标记
              center.removeChildren();
              ids.forEach((id, idx) => {
                const s2 = cardFromKey(idToTextureKey(id));
                s2.scale.set(0.82);
                s2.position.set(cxStart + idx * centerSpacing, centerY);
                center.addChild(s2);
                animatingIdsRef.current.delete(id);
              });
              lastPlayKeyRef.current = newKey;
            }
          };

          ids.forEach((id, idx) => {
            // 计算起点：基于上一帧手牌
            const prev = prevHandRef.current;
            const prevIndex = prev.indexOf(id);
            const startPosX = prevIndex >= 0 ? (startX + prevIndex * spacing) : (cxStart + idx * centerSpacing);
            const startPosY = prevIndex >= 0 ? baseY : centerY + 20;
            const ghost = cardFromKey(idToTextureKey(id));
            ghost.scale.set(scale);
            ghost.alpha = 1;
            ghost.position.set(startPosX, startPosY);
            fx.addChild(ghost);
            animate(ghost, { x: cxStart + idx * centerSpacing, y: centerY, alpha: 1, scale: 0.82 }, 280, () => {
              fx.removeChild(ghost);
              done();
            });
          });
        } else {
          // 非我方出牌：原地淡入
          center.removeChildren();
          (snap.lastPlay as Entity[]).forEach((id, idx) => {
            const key = idToTextureKey(id);
            const sp = cardFromKey(key);
            sp.scale.set(0.82);
            sp.alpha = 0;
            sp.position.set(cxStart + idx * centerSpacing, centerY + 20);
            center.addChild(sp);
            animate(sp, { x: cxStart + idx * centerSpacing, y: centerY, alpha: 1 }, 260);
          });
          lastPlayKeyRef.current = newKey;
        }
      } else {
        // same last play, keep showing
      }
    }

    // 记录当前手牌用于下次计算起点
    prevHandRef.current = myHand.slice();

    // Render bottom cards from GameData (top center)
    if (snap && Array.isArray((snap as any).bottom) && (snap as any).bottom.length > 0) {
      const list = (snap as any).bottom as Entity[];
      const cfg = gd?.layout?.landlord_cards ?? { x: width/2, y: 120, spacing: 25 } as any;
      const s = meCfg.scale ?? 0.8;
      const spacing2 = cfg.spacing ?? 25;
      const totalWidth = (list.length - 1) * spacing2 + 128 * s;
      const startX = (cfg.x ?? width/2) - totalWidth / 2;
      const y = cfg.y ?? 120;
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


