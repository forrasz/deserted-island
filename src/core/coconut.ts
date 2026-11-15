import { overlaps, type Rect } from './collision';
import {
  COCONUT_GRAVITY,
  COCONUT_MAX_HELD,
  COCONUT_LIFETIME,
  COCONUT_SIZE,
  COCONUT_THROW_VX,
  COCONUT_THROW_VY,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TARGET_SIZE,
} from './config';

/**
 * 落ちている(落ちてくる)ヤシの実。x, y は左上。ヤシの木の頭突きや、ヌシの突進の衝撃で落ち、
 * 地面に着いたら止まり(landed)、30 秒で消える(age は着いてからの経過時間)。
 */
export interface Coconut {
  x: number;
  y: number;
  vy: number;
  landed: boolean;
  age: number;
}

/** 投げられて飛んでいるヤシの実。x, y は左上。 */
export interface Thrown {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** 中心の x・上端の y から落ち始めるヤシの実。 */
export function dropCoconut(cx: number, y: number): Coconut {
  return { x: cx - COCONUT_SIZE / 2, y, vy: 0, landed: false, age: 0 };
}

export function coconutRect(c: Coconut): Rect {
  return { x: c.x, y: c.y, w: COCONUT_SIZE, h: COCONUT_SIZE };
}

export function thrownRect(t: Thrown): Rect {
  return { x: t.x, y: t.y, w: COCONUT_SIZE, h: COCONUT_SIZE };
}

/** 練習用の的(x, y は左上)。 */
export function createTarget(x: number, groundY: number, height = 120): Rect {
  return { x, y: groundY - height, w: TARGET_SIZE, h: TARGET_SIZE };
}

/**
 * ヤシの実を投げる。手の位置(矩形の水平中央・上から 1/4)から、向きへ水平の速さ、
 * プレイヤーの水平速度の半分を足し、上向きに飛ばす。
 */
export function throwCoconut(p: { x: number; y: number; vx: number }, facing: 1 | -1): Thrown {
  return {
    x: p.x + PLAYER_WIDTH / 2 - COCONUT_SIZE / 2,
    y: p.y + PLAYER_HEIGHT / 4 - COCONUT_SIZE / 2,
    vx: facing * COCONUT_THROW_VX + p.vx / 2,
    vy: -COCONUT_THROW_VY,
  };
}

/** 半陰的オイラー法で 1 ステップ進める(重力あり)。 */
export function stepThrown(t: Thrown, dt: number): Thrown {
  const vy = t.vy + COCONUT_GRAVITY * dt;
  return { x: t.x + t.vx * dt, y: t.y + vy * dt, vx: t.vx, vy };
}

/**
 * 落ちているヤシの実を進める。落下中は重力で落ち、地面(groundY)で止まる。着いてから COCONUT_LIFETIME 秒で消える。
 * プレイヤーが重なっていて、手持ちが上限未満なら拾う(落ちている途中でも拾える)。
 */
export function stepCoconuts(
  coconuts: readonly Coconut[],
  player: Rect,
  held: number,
  groundY: number,
  dt: number,
): { coconuts: Coconut[]; held: number } {
  let h = held;
  const next: Coconut[] = [];
  for (const c of coconuts) {
    let n = c;
    if (!n.landed) {
      const vy = n.vy + COCONUT_GRAVITY * dt;
      const y = n.y + vy * dt;
      n = y + COCONUT_SIZE >= groundY ? { ...n, y: groundY - COCONUT_SIZE, vy: 0, landed: true, age: 0 } : { ...n, y, vy };
    } else {
      n = { ...n, age: n.age + dt };
    }
    if (h < COCONUT_MAX_HELD && overlaps(player, coconutRect(n))) {
      h += 1;
      continue;
    }
    if (n.landed && n.age >= COCONUT_LIFETIME - 1e-9) continue;
    next.push(n);
  }
  return { coconuts: next, held: h };
}
