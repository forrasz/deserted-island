import { overlaps, type Rect } from './collision';
import {
  COCONUT_GRAVITY,
  COCONUT_MAX_HELD,
  COCONUT_RESPAWN_TIME,
  COCONUT_SIZE,
  COCONUT_THROW_VX,
  COCONUT_THROW_VY,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TARGET_SIZE,
} from './config';

/** 地面に置かれたヤシの実。拾われると alive が false になり、respawnT 秒後に同じ位置へ再び出現する。 */
export interface Coconut {
  x: number;
  y: number;
  alive: boolean;
  /** 拾われてからの経過時間(秒)。 */
  respawnT: number;
}

/** 投げられて飛んでいるヤシの実。x, y は左上。 */
export interface Thrown {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** x(左辺)の位置の地面に置くヤシの実。 */
export function createCoconut(x: number, groundY: number): Coconut {
  return { x, y: groundY - COCONUT_SIZE, alive: true, respawnT: 0 };
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
 * 拾うと補充。プレイヤーが重なっていて、手持ちが上限未満なら拾う(alive → false)。
 * 拾われた実は respawnT を進め、COCONUT_RESPAWN_TIME 秒たち、プレイヤーが重なっていなければ再び出現する(canRespawn が true のとき)。
 */
export function stepCoconuts(
  coconuts: readonly Coconut[],
  player: Rect,
  held: number,
  dt: number,
  canRespawn: boolean,
): { coconuts: Coconut[]; held: number } {
  let h = held;
  const next = coconuts.map((c) => {
    const r = coconutRect(c);
    if (c.alive) {
      if (h < COCONUT_MAX_HELD && overlaps(player, r)) {
        h += 1;
        return { ...c, alive: false, respawnT: 0 };
      }
      return c;
    }
    const respawnT = c.respawnT + dt;
    if (canRespawn && respawnT >= COCONUT_RESPAWN_TIME - 1e-9 && !overlaps(player, r)) {
      return { ...c, alive: true, respawnT: 0 };
    }
    return { ...c, respawnT };
  });
  return { coconuts: next, held: h };
}
