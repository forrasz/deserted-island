import { overlaps, type Rect } from './collision';
import { FIXED_DT, PILLAR_REGROW_TIME } from './config';

/** 柱が立つ側。west = 闘技場の西の入口、east = 東の出口。 */
export type PillarSide = 'west' | 'east';

/** 最終ボスの闘技場の入口と出口に立つ、壊せる石の柱。 */
export interface Pillar {
  /** 西の柱は、プレイヤーが西(柱の外側)にいるとき、東の柱は東にいるときに、再生できる。 */
  side: PillarSide;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 立っているか。壊れている間は false。 */
  alive: boolean;
  /** 壊れてからの経過時間(秒)。再生の判定に使う。 */
  brokenT: number;
}

/** 柱の矩形から作る。ヌシの往復範囲より西にあれば西の柱、東にあれば東の柱(闘技場の中心 center を基準に決める)。 */
export function createPillar(r: Rect, center: number = Number.POSITIVE_INFINITY): Pillar {
  return { side: r.x + r.w / 2 < center ? 'west' : 'east', x: r.x, y: r.y, w: r.w, h: r.h, alive: true, brokenT: 0 };
}

export function pillarRect(p: Pillar): Rect {
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

/** 立っている柱の矩形(通れない地形として扱う)。 */
export function standingPillarRects(pillars: readonly Pillar[]): Rect[] {
  return pillars.filter((p) => p.alive).map(pillarRect);
}

/**
 * 立っている柱の位置。ヌシの突進が、西の柱の東の縁(west)、東の柱の西の縁(east)に達すると、柱にぶつかる。なければ null。
 */
export function pillarEdges(pillars: readonly Pillar[]): { west: number | null; east: number | null } {
  const w = pillars.find((p) => p.alive && p.side === 'west');
  const e = pillars.find((p) => p.alive && p.side === 'east');
  return { west: w ? w.x + w.w : null, east: e ? e.x : null };
}

/** 突進が当たった側の柱を壊す(経過時間は 0 から数え直す)。 */
export function breakPillar(pillars: readonly Pillar[], side: PillarSide): Pillar[] {
  return pillars.map((p) => (p.alive && p.side === side ? { ...p, alive: false, brokenT: 0 } : p));
}

/** 立っている柱をすべて壊す(ヌシを倒したとき)。 */
export function breakAllPillars(pillars: readonly Pillar[]): Pillar[] {
  return pillars.map((p) => (p.alive ? { ...p, alive: false, brokenT: 0 } : p));
}

export interface RegrowCtx {
  /** どれかのボスが気絶しているか。 */
  anyStaggered: boolean;
  /** 柱の位置が空いていなければならない相手(ボスとプレイヤーの当たり判定)。 */
  blockers: Rect[];
  /** プレイヤーの左辺と右辺の x。 */
  playerLeft: number;
  playerRight: number;
  /** ヌシが生きているか。倒されたあとは、柱は再生しない。 */
  bossAlive: boolean;
}

/**
 * 壊れた柱の時間を進め、再生の条件を満たしたら立たせる。
 * 条件: ヌシが生きている・壊れてから PILLAR_REGROW_TIME 秒が経つ・ヌシが気絶していない・柱の位置が空いている・
 * プレイヤーが柱の外側(西の柱なら西側、東の柱なら東側)にいる。
 * (プレイヤーが闘技場の中にいるまま柱が立つと、閉じ込められるため)
 */
export function stepPillars(pillars: readonly Pillar[], ctx: RegrowCtx, dt: number = FIXED_DT): Pillar[] {
  return pillars.map((p) => {
    if (p.alive) return p;
    const brokenT = p.brokenT + dt;
    const outside = p.side === 'west' ? ctx.playerRight <= p.x : ctx.playerLeft >= p.x + p.w;
    const free =
      ctx.bossAlive &&
      !ctx.anyStaggered &&
      outside &&
      !ctx.blockers.some((b) => overlaps(b, pillarRect(p)));
    if (brokenT >= PILLAR_REGROW_TIME - 1e-9 && free) return { ...p, alive: true, brokenT: 0 };
    return { ...p, brokenT };
  });
}
