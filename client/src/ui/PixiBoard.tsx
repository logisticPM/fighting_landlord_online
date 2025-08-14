import React, { useEffect, useMemo, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { spriteSheetLoader } from '../game/SpriteSheetLoader';
import { loadGameData, getGameData, PlayerLayout } from '../game/GameData';
import { idToTextureKey, idToSuitRank, Entity } from '../game/cardMapping';

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
  playSuggestion?: {
    canPlay: boolean;
    suggestion: string;
    recommendedCards?: Entity[];
  };
};

type BidState = {
  biddingSeat: number;
  currentBid: number;
  secondsRemaining?: number;
};

type Props = {
  snap: Snapshot | null;
  mySeat: number | null;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  bidState?: BidState | null;
  onBid?: (amount: number) => void;
  width?: number;
  height?: number;
};

export const PixiBoard: React.FC<Props> = ({ snap, mySeat, selected, onSelectedChange, bidState, onBid, width = 1280, height = 720 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const layersRef = useRef<{ table: PIXI.Container; bottom: PIXI.Container; hands: PIXI.Container; center: PIXI.Container; fx: PIXI.Container; ui: PIXI.Container } | null>(null);
  const lastPlayKeyRef = useRef<string>('');
  const animatingIdsRef = useRef<Set<Entity>>(new Set());
  const prevHandRef = useRef<Entity[]>([]);
  const avatarRingsRef = useRef<Map<number, PIXI.Graphics>>(new Map());
  const snapRef = useRef<Snapshot | null>(null);

  useEffect(() => {
    let disposed = false;
    const bootstrap = async () => {
      await spriteSheetLoader.loadSpriteSheets();
      if (disposed) return;

      // Load GameData early for world size/background
      try { await loadGameData(); } catch {}
      const gdata = getGameData();
      const viewW = gdata?.world?.width ?? width;
      const viewH = gdata?.world?.height ?? height;

      // Support both Pixi v7 (no async init) and v8 (async init)
      const hasAsyncInit = typeof (PIXI as any).Application?.prototype?.init === 'function';
      let app: any;
      if (hasAsyncInit) {
        app = new (PIXI as any).Application();
        await app.init({ width: viewW, height: viewH, background: 0xffffff, antialias: true });
      } else {
        app = new (PIXI as any).Application({ width: viewW, height: viewH, backgroundColor: 0xffffff, antialias: true });
      }
      appRef.current = app as PIXI.Application;

      const table = new PIXI.Container();
      const bottom = new PIXI.Container();
      const hands = new PIXI.Container();
      const center = new PIXI.Container();
      center.sortableChildren = true;
      const fx = new PIXI.Container();
      const ui = new PIXI.Container();
      // Order: table < bottom (landlord cards) < center (last plays) < hands < fx < ui
      app.stage.addChild(table, bottom, center, hands, fx, ui);
      layersRef.current = { table, bottom, hands, center, fx, ui };

      // Ticker for avatar ring blink on current turn
      (appRef.current as any).ticker.add(() => {
        const s = snapRef.current;
        if (!s) return;
        const now = performance.now();
        const pulse = 0.6 + 0.4 * Math.sin(now / 300);
        avatarRingsRef.current.forEach((ring, seatNum) => {
          if (!ring) return;
          if (seatNum === s.currentSeat) ring.alpha = pulse; else ring.alpha = 1;
        });
      });

      // Background image (prefer GameData texturePath.background)
      try {
        const bgPath = gdata?.texturePath?.background ?? '/GameAssets/images/background3.png';
        const bg = await PIXI.Assets.load(bgPath);
        const bgSprite = new PIXI.Sprite(bg as PIXI.Texture);
        bgSprite.width = viewW;
        bgSprite.height = viewH;
        bgSprite.position.set(0, 0);
        table.addChild(bgSprite);
      } catch {}

      if (containerRef.current) {
        const canvasEl: HTMLCanvasElement | undefined = (app as any).view ?? (app as any).canvas;
        // Ensure container has explicit size so canvas is visible
        try {
          (containerRef.current as HTMLDivElement).style.width = `${viewW}px`;
          (containerRef.current as HTMLDivElement).style.height = `${viewH}px`;
        } catch {}
        if (canvasEl) {
          try {
            canvasEl.style.display = 'block';
            canvasEl.style.width = `${viewW}px`;
            canvasEl.style.height = `${viewH}px`;
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
    // Sort left->right: big -> small. Tie-break by suit for stable grouping.
    const rankValue: Record<string, number> = { '2': 15, 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3 };
    const suitValue: Record<string, number> = { spades: 4, hearts: 3, clubs: 2, diamonds: 1 };
    const getRankScore = (id: Entity): number => {
      if (id === 54) return 17; // big joker
      if (id === 53) return 16; // small joker
      const { rank } = idToSuitRank(id);
      return rank ? (rankValue[rank] ?? 3) : 3;
    };
    const getSuitScore = (id: Entity): number => {
      const { suit } = idToSuitRank(id);
      return suit ? (suitValue[suit] ?? 0) : 0;
    };
    return [...raw].sort((a, b) => {
      const ra = getRankScore(a), rb = getRankScore(b);
      if (rb !== ra) return rb - ra;
      const sa = getSuitScore(a), sb = getSuitScore(b);
      return sb - sa;
    });
  }, [snap, mySeat]);

  const renderScene = () => {
    const app = appRef.current;
    const layers = layersRef.current;
    if (!app || !layers) return;
    snapRef.current = snap || null;

    const { hands, center, bottom, fx, ui } = layers;
    hands.removeChildren();
    ui.removeChildren();
    avatarRingsRef.current.clear();
    // If not in playing phase or there is no last play, ensure center is cleared to avoid any stale cards
    if (!snap || !snap.lastPlay || snap.lastPlay.length === 0) {
      center.removeChildren();
      lastPlayKeyRef.current = '';
    }
    // bottom layer will be explicitly cleared when re-rendering landlord cards

    // Layout from GameData mapping
    const gd = getGameData();
    const layouts: PlayerLayout[] = gd?.layout?.players ?? [
      { id: 0, x: width/2, y: height-80, cardSpacing: 35, scale: 0.8 },
      { id: 1, x: 100, y: 200, cardSpacing: 20, scale: 0.25 },
      { id: 2, x: width-100, y: 200, cardSpacing: 20, scale: 0.25 },
    ];
    // 固定：本地玩家始终使用 id=0 的底部布局
    const meCfg = layouts.find(p => p.id === 0) ?? layouts[0];
    const leftCfg = layouts.find(p => p.id === 1) ?? { id: 1, x: 100, y: 200, cardSpacing: 20, scale: 0.25 };
    const rightCfg = layouts.find(p => p.id === 2) ?? { id: 2, x: width-100, y: 200, cardSpacing: 20, scale: 0.25 };
    const spacing = meCfg.cardSpacing ?? 35;
    const scale = meCfg.scale ?? 0.8; // 与本地版保持一致（默认 0.8）
    const baseY = meCfg.y ?? (height - 80);
    const baseW = gd?.card?.width ?? 100;
    const baseH = gd?.card?.height ?? 140;
    const total = (myHand.length - 1) * spacing + baseW * scale;
    const startX = (meCfg.x ?? width/2) - total/2;
    const cardFromKey = (key: string) => {
      const tex = PIXI.Assets.cache.get(key) || spriteSheetLoader.getTexture(key) || PIXI.Texture.WHITE;
      const sp = new PIXI.Sprite(tex);
      sp.tint = tex === PIXI.Texture.WHITE ? 0xeeeeee : 0xffffff;
      sp.width = baseW; sp.height = baseH;
      return sp;
    };
    const createFramedHandCard = (key: string, scaleVal: number, isSelected = false): PIXI.Container => {
      const tex = PIXI.Assets.cache.get(key) || spriteSheetLoader.getTexture(key) || PIXI.Texture.WHITE;
      const group = new PIXI.Container();
      const w = baseW * scaleVal;
      const h = baseH * scaleVal;
      
      // Add subtle shadow for depth
      const shadow = new PIXI.Graphics();
      shadow.beginFill(0x000000, 0.3);
      shadow.drawRoundedRect(2, 4, w, h, 10);
      shadow.endFill();
      
      const sp = new PIXI.Sprite(tex);
      sp.width = w; sp.height = h; sp.x = 0; sp.y = 0;
      
      // Enhanced frame with selection state
      const frame = new PIXI.Graphics();
      if (isSelected) {
        frame.lineStyle(3, 0x4CAF50, 1); // Green highlight for selected
        frame.beginFill(0x4CAF50, 0.1); // Subtle green fill
      } else {
        frame.lineStyle(2, 0x333333, 1); // Dark border for unselected
      }
      frame.drawRoundedRect(0, 0, w, h, 10);
      if (isSelected) frame.endFill();
      
      group.addChild(shadow, sp, frame);
      return group;
    };

    myHand.forEach((id, idx) => {
      if (animatingIdsRef.current.has(id)) return; // 跳过动画中的牌
      const key = idToTextureKey(id);
      const isSelected = selected.has(id);
      const group = createFramedHandCard(key, scale, isSelected);
      group.position.set(startX + idx * spacing, baseY - (isSelected ? 28 : 0));
      group.eventMode = 'static';
      group.cursor = 'pointer';
      group.on('pointertap', (e: any) => {
        // Prevent this click from propagating to stage/global handlers
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectedChange(next);
        // Need to re-render to update card border/highlighting
        // This is necessary for visual feedback but will be optimized by React's diffing
      });
      hands.addChild(group);
    });

    // Avatars with landlord/farmer images
    const loadAvatarTexture = (role: 'landlord' | 'farmer'): PIXI.Texture => {
      const p = role === 'landlord' ? '/avatars/landlord.png' : '/avatars/farmer.png';
      console.log(`Loading ${role} avatar from: ${p}`);
      
      // Test if file exists by trying to fetch it first
      fetch(p).then(response => {
        console.log(`${role} avatar HTTP status:`, response.status, response.ok);
        if (!response.ok) {
          console.error(`${role} avatar file not accessible: ${response.status}`);
        }
      }).catch(err => {
        console.error(`${role} avatar fetch failed:`, err);
      });
      
      // Use Texture.from directly to avoid PIXI.Assets cache warning logs
      try { 
        const tex = PIXI.Texture.from(p);
        console.log(`${role} texture created:`, tex.valid, tex.width, tex.height);
        
        // Check if texture loaded successfully after a short delay
        setTimeout(() => {
          console.log(`${role} texture after delay:`, tex.valid, tex.width, tex.height);
        }, 100);
        
        return tex;
      } catch (error) { 
        console.error(`Failed to load ${role} avatar:`, error);
        return PIXI.Texture.WHITE; 
      }
    };
    const drawAvatar = (x: number, y: number, seatNum: number) => {
      const isLandlord = snap?.landlordSeat !== null && snap?.landlordSeat !== undefined && seatNum === (snap?.landlordSeat as number);
      
      // Debug logging to identify the issue
      console.log(`Drawing avatar for seat ${seatNum}:`, {
        landlordSeat: snap?.landlordSeat,
        isLandlord,
        role: isLandlord ? 'landlord' : 'farmer'
      });
      
      const tex = loadAvatarTexture(isLandlord ? 'landlord' : 'farmer');
      // Scale avatar radius relative to card height for better visibility
      const r = Math.max(36, Math.round(baseH * 0.26));
      const wrap = new PIXI.Container();
      wrap.position.set(x, y);
      const shadow = new PIXI.Graphics();
      shadow.beginFill(0x000000, 0.15).drawCircle(0, 2, r + 2).endFill();
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff, 1).drawCircle(0, 0, r).endFill();
      const sp = new PIXI.Sprite(tex); 
      sp.anchor.set(0.5); 
      
      // Use the original working approach but improve the scaling
      if (tex !== PIXI.Texture.WHITE && tex.valid) {
        // For actual images, scale to fill circle while maintaining aspect ratio
        const scaleToFill = Math.max((r * 2) / tex.width, (r * 2) / tex.height);
        sp.scale.set(scaleToFill);
        console.log(`Avatar scaled for seat ${seatNum}:`, scaleToFill);
      } else {
        // Fallback: create colored circle to distinguish roles
        sp.width = r * 2; 
        sp.height = r * 2;
        // Tint the white texture to show role difference
        sp.tint = isLandlord ? 0xff6b35 : 0x4a90e2; // Orange for landlord, blue for farmer
        console.log(`Avatar fallback for seat ${seatNum}, role:`, isLandlord ? 'landlord' : 'farmer', 'color:', sp.tint.toString(16));
      }
      sp.mask = mask;
      const ringColor = isLandlord ? 0xf59e0b : 0x1f2937;
      const ring = new PIXI.Graphics(); ring.lineStyle(5, ringColor, 1).drawCircle(0, 0, r + 1);
      const cap = new PIXI.Text(`S${seatNum}`, { fontFamily: 'Arial', fontSize: 12, fill: 0xffffff }); cap.anchor.set(0.5, 0); cap.position.set(0, r + 6);
      wrap.addChild(shadow, sp, mask, ring, cap); ui.addChild(wrap);
      avatarRingsRef.current.set(seatNum, ring);
    };
    const leftCfgAv = layouts.find(p => p.id === 1) ?? { id:1, x: 140, y: height/2, cardSpacing: 20, scale: 0.25 };
    const rightCfgAv = layouts.find(p => p.id === 2) ?? { id:2, x: width-140, y: height/2, cardSpacing: 20, scale: 0.25 };
    const mySeatVal = mySeat ?? 0; 
    const otherSeats = (snap?.players || []).map(p => p.seat).filter(s => s !== mySeatVal).sort((a,b)=>a-b);
    
    // Place my avatar strictly below the hand row: baseY + cardHeight*scale + radius + margin
    // Place my avatar safely above the bottom edge (avoid clipping)
    const avatarR = Math.max(36, Math.round(baseH * 0.26));
    const myAvatarY = (meCfg.y ?? (height - 80)) - (avatarR + 12);
    drawAvatar(meCfg.x ?? width/2, myAvatarY, mySeatVal);
    
    // Left/Right avatars vertically centered to avoid overlap with table bevel
    // Use actual seat numbers from other players, not defaults
    if (otherSeats.length >= 1) {
      drawAvatar(leftCfgAv.x ?? 140, (leftCfgAv.y ?? height/2), otherSeats[0]);
    }
    if (otherSeats.length >= 2) {
      drawAvatar(rightCfgAv.x ?? (width-140), (rightCfgAv.y ?? height/2), otherSeats[1]);
    }

    // Render opponents as card backs（左/右固定，不跟随 seat 映射）
    if (snap) {
      const backTex = PIXI.Assets.cache.get('cardback.png') || spriteSheetLoader.getTexture('cardback.png') || PIXI.Texture.WHITE;
      const opp = snap.players.filter((p) => p.seat !== mySeat).map(p => p.handCount);
      const cfgs = [leftCfgAv, rightCfgAv];
      for (let i = 0; i < cfgs.length; i++) {
        const cfg = cfgs[i];
        const count = opp[i] ?? 0;
        // Render opponent card backs in columns but keep them inside the inner table area
        const gap = Math.max(16, Math.round((cfg.cardSpacing ?? 20)));
        for (let k = 0; k < count; k++) {
          const sp = new PIXI.Sprite(backTex);
          if (backTex === PIXI.Texture.WHITE) { sp.width = baseW; sp.height = baseH; sp.tint = 0xcccccc; }
          sp.scale.set(cfg.scale ?? 0.25);
          const isLeft = (cfg.x ?? 0) < width/2;
          const xPos = isLeft ? (cfg.x ?? 140) : ((cfg.x ?? (width - 140)) - sp.width);
          const startY = (cfg.y ?? height/2) - Math.min(count - 1, 8) * (gap / 2);
          sp.position.set(xPos, startY + k * gap);
          hands.addChild(sp);
        }
      }
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

    const createFramedCard = (key: string, scaleVal = 0.82): PIXI.Container => {
      const tex = PIXI.Assets.cache.get(key) || spriteSheetLoader.getTexture(key) || PIXI.Texture.WHITE;
      const group = new PIXI.Container();
      group.sortableChildren = true;
      const w = baseW * scaleVal;
      const h = baseH * scaleVal;
      // shadow
      const shadow = new PIXI.Graphics();
      shadow.beginFill(0x000000, 0.18);
      shadow.drawRoundedRect(4, 6, w, h, 10);
      shadow.endFill();
      shadow.zIndex = 0;
      // sprite
      const sp = new PIXI.Sprite(tex);
      sp.width = w; sp.height = h; sp.x = 0; sp.y = 0; sp.alpha = 1; sp.zIndex = 1;
      // frame
      const frame = new PIXI.Graphics();
      frame.lineStyle(2, 0x1f2937, 1); // 深色描边
      frame.drawRoundedRect(0, 0, w, h, 10);
      frame.zIndex = 2;
      group.addChild(shadow, sp, frame);
      return group;
    };

    const buildLastPlayKey = () => (snap && snap.started && snap.lastPlayOwnerSeat !== null && Array.isArray(snap.lastPlay) ? `${snap.lastPlayOwnerSeat}|${(snap.lastPlay||[]).join(',')}` : '');
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

    if (snap && snap.started && snap.lastPlay && snap.lastPlay.length > 0) {
      if (newKey !== lastPlayKeyRef.current) {
        const playedAnchorX = gd?.layout?.player_played_cards?.x ?? (width / 2);
        const playedAnchorY = gd?.layout?.player_played_cards?.y ?? (height / 2 - 90);
        const centerSpacing = gd ? Math.max(28, Math.round(baseW * 0.4)) : 40;
        const totalWidth = (snap.lastPlay.length - 1) * centerSpacing + baseW * 0.82;
        const cxStart = playedAnchorX - totalWidth / 2;

        // 如果是我出的牌：从手牌位置飞向中央
        if (snap.lastPlayOwnerSeat === mySeat) {
          const ids = snap.lastPlay as Entity[];
          // 标记动画中，避免在手牌层重绘
          ids.forEach((id) => animatingIdsRef.current.add(id));

          let finished = 0;
          const done = () => {
            finished++;
            if (finished === ids.length) {
              // 动画结束后，渲染最终中央牌并清除 hand 动画标记
              center.removeChildren();
              ids.forEach((id, idx) => {
                const group = createFramedCard(idToTextureKey(id), 0.82);
                group.x = cxStart + idx * centerSpacing; group.y = playedAnchorY; group.alpha = 1; group.zIndex = 10 + idx;
                center.addChild(group);
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
            const startPosY = prevIndex >= 0 ? baseY : playedAnchorY + 20;
            const ghost = createFramedCard(idToTextureKey(id), scale);
            ghost.x = startPosX; ghost.y = startPosY; ghost.alpha = 1; ghost.zIndex = 100 + idx;
            fx.addChild(ghost);
            animate(ghost, { x: cxStart + idx * centerSpacing, y: playedAnchorY, alpha: 1, scale: 0.82 }, 280, () => {
              fx.removeChild(ghost);
              done();
            });
          });
        } else {
          // 非我方出牌：原地淡入
          center.removeChildren();
          (snap.lastPlay as Entity[]).forEach((id, idx) => {
            const group = createFramedCard(idToTextureKey(id), 0.82);
            group.alpha = 0;
            group.x = cxStart + idx * centerSpacing; group.y = playedAnchorY + 20; group.zIndex = 10 + idx;
            center.addChild(group);
            animate(group, { x: cxStart + idx * centerSpacing, y: playedAnchorY, alpha: 1 }, 260);
          });
          lastPlayKeyRef.current = newKey;
        }
      } else {
        // same last play, keep showing
      }
    }

    // 记录当前手牌用于下次计算起点
    prevHandRef.current = myHand.slice();

    // Render landlord bottom cards in a dedicated layer
    bottom.removeChildren();
    if (snap) {
      const cfg = gd?.layout?.landlord_cards ?? { x: width/2, y: 120, spacing: 25 } as any;
      const s = meCfg.scale ?? 0.8;
      const spacing2 = cfg.spacing ?? 25;
      const y = cfg.y ?? 120;
      if (snap.started && Array.isArray((snap as any).bottom) && (snap as any).bottom.length > 0) {
        const list = (snap as any).bottom as Entity[];
        const totalWidth = (list.length - 1) * spacing2 + baseW * s;
        const startX2 = (cfg.x ?? width/2) - totalWidth / 2;
        list.forEach((id, idx) => {
          const sp = cardFromKey(idToTextureKey(id));
          sp.scale.set(s);
          sp.position.set(startX2 + idx * spacing2, y);
          bottom.addChild(sp);
        });
      } else if (!snap.started && snap.bottomCount > 0) {
        const totalWidth = (snap.bottomCount - 1) * spacing2 + baseW * s;
        const startX2 = (cfg.x ?? width/2) - totalWidth / 2;
        const backTex = PIXI.Assets.cache.get('cardback.png') || spriteSheetLoader.getTexture('cardback.png') || PIXI.Texture.WHITE;
        for (let i = 0; i < snap.bottomCount; i++) {
          const b = new PIXI.Sprite(backTex);
          if (backTex === PIXI.Texture.WHITE) { b.width = baseW; b.height = baseH; b.tint = 0xcccccc; }
          b.scale.set(s);
          b.position.set(startX2 + i * spacing2, y);
          bottom.addChild(b);
        }
      }
    }
  };

  useEffect(() => {
    renderScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, mySeat, selected]);

  // Calculate avatar positions for bid buttons
  const getAvatarPositions = () => {
    if (!snap) return [];
    
    const positions = [];
    const myAvatarY = height - 80 - 36 - 12; // Same as in renderScene
    const leftAvatarX = 140;
    const rightAvatarX = width - 140;
    const centerAvatarY = height / 2;
    
    // My position (always at bottom center)
    positions.push({
      seat: mySeat ?? 0,
      x: width / 2,
      y: myAvatarY - 60, // Above avatar
    });
    
    // Other players
    const otherSeats = snap.players.map(p => p.seat).filter(s => s !== mySeat).sort((a,b) => a-b);
    if (otherSeats[0] !== undefined) {
      positions.push({
        seat: otherSeats[0],
        x: leftAvatarX,
        y: centerAvatarY - 60,
      });
    }
    if (otherSeats[1] !== undefined) {
      positions.push({
        seat: otherSeats[1],
        x: rightAvatarX,
        y: centerAvatarY - 60,
      });
    }
    
    return positions;
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} />
      
      {/* Bidding buttons overlay */}
      {bidState && snap && onBid && getAvatarPositions().map(pos => (
        <div
          key={pos.seat}
          className={`bid-buttons-overlay ${pos.seat === bidState.biddingSeat ? 'active' : 'inactive'}`}
          style={{
            position: 'absolute',
            left: pos.x - 100, // Center the 200px wide button group
            top: pos.y,
            width: '200px',
            zIndex: 20,
          }}
        >
          {pos.seat === bidState.biddingSeat && (
            <div className="bid-buttons-group">
              {[0, 1, 2, 3].map(amount => {
                const disabled = mySeat !== bidState.biddingSeat || (amount <= bidState.currentBid && amount !== 0);
                return (
                  <button
                    key={amount}
                    className={`bid-button ${disabled ? 'disabled' : ''}`}
                    onClick={() => !disabled && onBid(amount)}
                    disabled={disabled}
                  >
                    {amount === 0 ? 'Pass' : amount}
                  </button>
                );
              })}
            </div>
          )}
          {pos.seat === bidState.biddingSeat && (
            <div className="bid-timer">
              ⏱️ {bidState.secondsRemaining ?? 10}s
            </div>
          )}
        </div>
      ))}
    </div>
  );
};


