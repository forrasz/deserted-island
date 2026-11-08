import {
  ENDING_DURATION,
  INTRO_TIME,
  NUSHI_DYING_TIME,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from './config';

/**
 * ラスボスの演出の時間割。時刻(または進行度)から、描画に使う値を返す純粋関数。乱数は使わない。
 * 全画面の点滅は 1 秒に 3 回まで、白の濃さは最大 0.85 に抑える(光過敏への配慮)。
 */

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
/** 0〜1 の、決定的な擬似乱数(i から決める)。 */
const hash01 = (i: number, k: number): number => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// ---- 登場演出 ----

/** 登場演出の最大の暗さ(黒の濃さ)。 */
export const INTRO_MAX_DARK = 0.6;
/** WARNING の点滅の周期(秒)。点灯と消灯を交互に行い、1 秒に約 1.5 回の点灯になる(上限は 3 回)。 */
export const WARNING_PERIOD = 0.34;
/** 暗さが増える時間・減る時間(秒)。 */
const INTRO_FADE = 0.5;

export interface IntroTimeline {
  /** 画面を暗くする黒の濃さ(0〜INTRO_MAX_DARK)。 */
  dark: number;
  /** 「WARNING」を表示するか(点滅)。 */
  warning: boolean;
  /** 「ヌシ」の名前の濃さ(0〜1)。 */
  nameAlpha: number;
  /** 画面の揺れ(px)。 */
  shakeX: number;
  shakeY: number;
}

export function introTimeline(t: number): IntroTimeline {
  if (t < 0 || t >= INTRO_TIME) return { dark: 0, warning: false, nameAlpha: 0, shakeX: 0, shakeY: 0 };
  const dark = INTRO_MAX_DARK * Math.min(1, t / INTRO_FADE, (INTRO_TIME - t) / INTRO_FADE);
  const warning = t >= 0.3 && t < INTRO_TIME - 0.5 && Math.floor((t - 0.3) / WARNING_PERIOD) % 2 === 0;
  const nameAlpha = clamp01((t - 1) / 0.5) * clamp01((INTRO_TIME - t) / 0.5);
  const amp = t < 1 ? 6 : t < INTRO_TIME - 0.3 ? 3 : (3 * (INTRO_TIME - t)) / 0.3;
  return {
    dark,
    warning,
    nameAlpha,
    shakeX: amp * Math.sin(t * 47),
    shakeY: amp * Math.sin(t * 61 + 1),
  };
}

/** 登場演出のカメラの混ぜ方(0 = プレイヤーのカメラ、1 = ヌシのカメラ)。始まりの 0.8 秒で寄り、終わりの 0.5 秒で戻る。 */
export function introCameraBlend(t: number): number {
  if (t <= 0 || t >= INTRO_TIME) return 0;
  if (t < 0.8) return smooth(t / 0.8);
  if (t < INTRO_TIME - 0.5) return 1;
  return smooth((INTRO_TIME - t) / 0.5);
}

// ---- 撃破演出 ----

/** 撃破演出の進行度(0 = 始まり、1 = 終わり)。dying は残りのゲーム内の秒。 */
export function dyingProgress(dying: number): number {
  return clamp01(1 - dying / NUSHI_DYING_TIME);
}

/** ヌシが消える進行度(白いフラッシュの頂点)。 */
export const DYING_VANISH = 0.92;
/** 白いフラッシュの最大の濃さ。 */
export const FLASH_MAX = 0.85;

/** ヌシの体を表示するか(フラッシュの頂点で消える)。 */
export function dyingBossVisible(p: number): boolean {
  return p < DYING_VANISH;
}

/** 白いフラッシュの濃さ。p = 0.7 から頂点(DYING_VANISH)まで上がり、終わりまで引く。1 回の山で、点滅はしない。 */
export function dyingFlash(p: number): number {
  if (p <= 0.7 || p >= 1) return 0;
  if (p < DYING_VANISH) return (FLASH_MAX * (p - 0.7)) / (DYING_VANISH - 0.7);
  return (FLASH_MAX * (1 - p)) / (1 - DYING_VANISH);
}

/** 撃破演出の画面の揺れ(px)。 */
export function dyingShake(p: number): { x: number; y: number } {
  if (p <= 0 || p >= 1) return { x: 0, y: 0 };
  const amp = p < DYING_VANISH ? 2 + 6 * p : 0;
  return { x: amp * Math.sin(p * 523), y: amp * Math.sin(p * 611 + 1) };
}

/** ヌシの体が、白と元の色で交互に光るか(0.1 秒の実時間 = 0.03 ゲーム秒の周期)。 */
export function dyingBlinkWhite(dying: number): boolean {
  return Math.floor(Math.max(dying, 0) / 0.03) % 2 === 0;
}

export interface Explosion {
  /** ヌシの矩形に対する相対位置(0〜1)。 */
  x: number;
  y: number;
  /** 半径(px)。 */
  r: number;
  /** 濃さ(1 → 0)。 */
  alpha: number;
  /** 広がりの進行度(0〜1)。色の変化に使う。 */
  u: number;
}

const EXPLOSION_COUNT = 14;
const EXPLOSION_GAP = 0.06;
const EXPLOSION_LIFE = 0.25;

/** 進行度 p のときに、見えている爆発の一覧。i 番目は p = i * 0.06 から、0.25 の長さで広がって消える。 */
export function explosions(p: number): Explosion[] {
  const out: Explosion[] = [];
  for (let i = 0; i < EXPLOSION_COUNT; i++) {
    const u = (p - i * EXPLOSION_GAP) / EXPLOSION_LIFE;
    if (u < 0 || u > 1) continue;
    out.push({
      x: 0.1 + 0.8 * hash01(i, 1),
      y: 0.1 + 0.8 * hash01(i, 2),
      r: (24 + 36 * hash01(i, 3)) * (0.3 + 0.7 * u),
      alpha: 1 - u,
      u,
    });
  }
  return out;
}

// ---- エンディング ----

export interface EndingMessage {
  text: string;
  alpha: number;
}
export interface EndingBird {
  x: number;
  y: number;
  /** 羽ばたき(-1〜1)。 */
  flap: number;
}
export interface EndingScene {
  /** 水平線の y。 */
  horizonY: number;
  /** 夕日の中心(x, y)と半径。 */
  sunX: number;
  sunY: number;
  sunR: number;
  /** イカダ(とプレイヤー)の中心と大きさの倍率(1 → 0.25)。 */
  raftX: number;
  raftY: number;
  raftScale: number;
  /** 遠ざかる島の中心の x・大きさの倍率・濃さ。 */
  islandX: number;
  islandScale: number;
  islandAlpha: number;
  birds: EndingBird[];
  messages: EndingMessage[];
  /** 波の動きの位相(秒)。 */
  wave: number;
  /** 終わりの暗転(0〜1)。 */
  fadeOut: number;
}

export const ENDING_MESSAGES: ReadonlyArray<{ text: string; start: number; end: number }> = [
  { text: '無人島での日々が、いま終わった。', start: 1.5, end: 5.5 },
  { text: 'さあ、帰ろう。', start: 6, end: 9 },
  { text: 'これからは、おだやかな毎日が待っている。', start: 9.5, end: 12 },
];

export function endingScene(t: number): EndingScene {
  const tt = Math.min(Math.max(t, 0), ENDING_DURATION);
  const u = tt / ENDING_DURATION;
  const H = VIEW_HEIGHT;
  const W = VIEW_WIDTH;
  const horizonY = 0.62 * H;
  const e = smooth(u);
  const birds: EndingBird[] = [0, 1, 2].map((i) => ({
    x: ((tt * 40 + i * 210) % (W + 100)) - 50,
    y: (0.18 + 0.05 * i) * H + 12 * Math.sin(tt * 2 + i),
    flap: Math.sin(tt * 8 + i * 2),
  }));
  const messages = ENDING_MESSAGES.map((m) => ({
    text: m.text,
    alpha: clamp01((tt - m.start) / 0.8) * clamp01((m.end - tt) / 0.8),
  }));
  return {
    horizonY,
    sunX: 0.68 * W,
    sunY: lerp(0.46 * H, horizonY, u),
    sunR: 46,
    raftX: lerp(0.38 * W, 0.55 * W, e),
    raftY: lerp(0.84 * H, horizonY + 14, e),
    raftScale: lerp(1, 0.25, e),
    islandX: lerp(0.2 * W, 0.08 * W, e),
    islandScale: lerp(1, 0.2, e),
    islandAlpha: lerp(1, 0.4, e),
    birds,
    messages,
    wave: tt,
    fadeOut: clamp01((tt - (ENDING_DURATION - 0.5)) / 0.5),
  };
}
