// Sprite Sheet 加载器 - 处理新的游戏资产（客户端在线版）
import * as PIXI from 'pixi.js';

export interface SpriteSheetConfig {
  cardWidth: number;
  cardHeight: number;
  playingCardsConfig: {
    cols: number;
    rows: number;
    suits: string[];
    ranks: string[];
  };
  jokersConfig: {
    smallJokerIndex: number;
    bigJokerIndex: number;
  };
  cardBacksConfig: {
    styles: string[];
  };
}

class SpriteSheetLoader {
  private static instance: SpriteSheetLoader;
  private cardTextures: Map<string, PIXI.Texture> = new Map();
  private loaded = false;
  private config: SpriteSheetConfig;

  private constructor() {
    this.config = {
      cardWidth: 128,
      cardHeight: 178,
      playingCardsConfig: {
        cols: 13,
        rows: 4,
        suits: ['clubs', 'hearts', 'spades', 'diamonds'],
        ranks: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
      },
      jokersConfig: { smallJokerIndex: 0, bigJokerIndex: 1 },
      cardBacksConfig: { styles: ['blue_pattern', 'pink_star', 'red_pattern', 'dark_blue'] }
    };
  }

  public static getInstance(): SpriteSheetLoader {
    if (!SpriteSheetLoader.instance) SpriteSheetLoader.instance = new SpriteSheetLoader();
    return SpriteSheetLoader.instance;
  }

  public async loadSpriteSheets(): Promise<void> {
    if (this.loaded) return;

    const playingCardsTexture = await PIXI.Assets.load({ alias: 'playingCards', src: '/GameAssets/images/PlayingCards 128x178.png' });
    const jokersTexture = await PIXI.Assets.load({ alias: 'jokers', src: '/GameAssets/images/Jokers 128x178.png' });
    const cardBacksTexture = await PIXI.Assets.load({ alias: 'cardBacks', src: '/GameAssets/images/Card Backs 128x178.png' });

    this.processPlayingCards(playingCardsTexture);
    this.processJokers(jokersTexture);
    this.processCardBacks(cardBacksTexture);

    this.loaded = true;
  }

  private processPlayingCards(tex: PIXI.Texture | PIXI.BaseTexture): void {
    const { cardWidth, cardHeight, playingCardsConfig } = this.config;
    const { cols, rows, suits, ranks } = playingCardsConfig;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const rect = new PIXI.Rectangle(col * cardWidth, row * cardHeight, cardWidth, cardHeight);
        const base = (tex as any).baseTexture ? (tex as PIXI.Texture).baseTexture : (tex as PIXI.BaseTexture);
        const texture = new PIXI.Texture(base, rect);
        const key = this.getCardTextureKey(suits[row], ranks[col]);
        this.cardTextures.set(key, texture);
        PIXI.Assets.cache.set(key, texture);
      }
    }
  }

  private processJokers(tex: PIXI.Texture | PIXI.BaseTexture): void {
    const base = (tex as any).baseTexture ? (tex as PIXI.Texture).baseTexture : (tex as PIXI.BaseTexture);
    const width = base.width / 2;
    const height = base.height;
    const left = new PIXI.Texture(base, new PIXI.Rectangle(0, 0, width, height));
    const right = new PIXI.Texture(base, new PIXI.Rectangle(width, 0, width, height));
    this.cardTextures.set('sjoker.png', left);
    this.cardTextures.set('joker.png', right);
    PIXI.Assets.cache.set('sjoker.png', left);
    PIXI.Assets.cache.set('joker.png', right);
  }

  private processCardBacks(tex: PIXI.Texture | PIXI.BaseTexture): void {
    const { cardWidth, cardHeight, cardBacksConfig } = this.config;
    const base = (tex as any).baseTexture ? (tex as PIXI.Texture).baseTexture : (tex as PIXI.BaseTexture);
    cardBacksConfig.styles.forEach((style, index) => {
      const rect = new PIXI.Rectangle(index * cardWidth, 0, cardWidth, cardHeight);
      const texture = new PIXI.Texture(base, rect);
      const key = `cardback_${style}.png`;
      this.cardTextures.set(key, texture);
      PIXI.Assets.cache.set(key, texture);
      if (index === 0) {
        this.cardTextures.set('cardback.png', texture);
        PIXI.Assets.cache.set('cardback.png', texture);
      }
    });
  }

  private getCardTextureKey(suit: string, rank: string): string {
    const suitMap: Record<string, string> = { clubs: 'Clovers', hearts: 'Hearts', spades: 'Pikes', diamonds: 'Tiles' };
    const rankMap: Record<string, string> = { A: 'A', K: 'King', Q: 'Queen', J: 'Jack', '10': '10', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2' };
    return `${suitMap[suit]}_${rankMap[rank]}_white.png`;
  }

  public getTexture(key: string): PIXI.Texture | null {
    return this.cardTextures.get(key) || null;
  }

  public isAssetsLoaded(): boolean { return this.loaded; }
}

export const spriteSheetLoader = SpriteSheetLoader.getInstance();


