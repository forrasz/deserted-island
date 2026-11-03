import type { Rect } from './collision';
import {
  FIXED_DT,
  HEADROOM,
  HIGH_RISE,
  MAX_GAP_HIGH,
  MAX_PIT_WIDTH,
  MAX_RISE,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config';
import { NO_INPUT, type InputState } from './input';
import { stepPlayer, type Player } from './player';
import type { RouteNode, Stage } from './stage';
import { EPS, fallYOf, type WorldBounds } from './terrain';

/** 2 つの足場の水平の隙間(範囲が重なっていれば 0)。 */
export function horizontalGap(a: RouteNode, b: RouteNode): number {
  return Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
}

/**
 * ステージの構造が、到達可能性の制約を守っているかを検査する。違反の説明の一覧を返す(空なら問題なし)。
 * 制約: 穴の幅・上りの高さ差・高い足場への水平の隙間・頭上の空間・ステージの範囲内。
 */
export function validateStage(stage: Stage): string[] {
  const errors: string[] = [];

  for (const p of stage.pits) {
    if (p.w > MAX_PIT_WIDTH) errors.push(`穴の幅が広すぎる: x=${p.x} 幅=${p.w}`);
  }

  for (let i = 1; i < stage.route.length; i++) {
    const a = stage.route[i - 1]!;
    const b = stage.route[i]!;
    const rise = a.y - b.y; // 正なら上り
    const gap = horizontalGap(a, b);
    if (rise > MAX_RISE) errors.push(`上りの高さ差が大きすぎる: ${i - 1}→${i} 高さ差=${rise}`);
    if (rise > HIGH_RISE && gap > MAX_GAP_HIGH) {
      errors.push(`高い足場への隙間が広すぎる: ${i - 1}→${i} 隙間=${gap} 高さ差=${rise}`);
    }
    if (rise <= HIGH_RISE && gap > MAX_PIT_WIDTH) {
      errors.push(`足場の隙間が広すぎる: ${i - 1}→${i} 隙間=${gap}`);
    }
  }

  // 頭上の空間: 経路上の足場の上方に、HEADROOM 以内に下面を持つ通れない地形がない
  const solids = stage.world.solids ?? [];
  for (const [i, n] of stage.route.entries()) {
    for (const s of solids) {
      const overlapsX = s.x < n.x1 - EPS && n.x0 < s.x + s.w - EPS;
      const bottom = s.y + s.h;
      if (overlapsX && bottom < n.y - EPS && bottom > n.y - HEADROOM) {
        errors.push(`頭上の空間が足りない: 経路 ${i}(x=${n.x0}〜${n.x1}) の上に崖の下面(y=${bottom})`);
      }
    }
  }

  // ステージの範囲内
  const rects: Rect[] = [...solids, ...(stage.world.platforms ?? [])];
  for (const r of rects) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > WORLD_WIDTH || r.y + r.h > WORLD_HEIGHT) {
      errors.push(`ステージの範囲外: x=${r.x} y=${r.y} w=${r.w} h=${r.h}`);
    }
  }

  return errors;
}

const LOCAL_MARGIN = 600;
const MAX_TICKS = 240;
const RUN_UP_STEP = 20;
const RUN_UP_MAX = 420;
const JUMP_TICKS: number[] = [-1, ...Array.from({ length: 26 }, (_, k) => k * 2)];

/** 判定を速くするため、2 つの足場の周辺の地形だけを持つ世界を作る。 */
function localWorld(world: WorldBounds, a: RouteNode, b: RouteNode): WorldBounds {
  const lo = Math.min(a.x0, b.x0) - LOCAL_MARGIN;
  const hi = Math.max(a.x1, b.x1) + LOCAL_MARGIN;
  const near = (r: Rect) => r.x < hi && r.x + r.w > lo;
  return {
    ...world,
    solids: (world.solids ?? []).filter(near),
    platforms: (world.platforms ?? []).filter(near),
  };
}

function attempt(
  w: WorldBounds,
  startX: number,
  from: RouteNode,
  to: RouteNode,
  dir: 1 | -1,
  jumpTick: number,
): boolean {
  let p: Player = { x: startX, y: from.y - PLAYER_HEIGHT, vx: 0, vy: 0, onGround: true };
  const fallY = fallYOf(w);
  for (let t = 0; t < MAX_TICKS; t++) {
    const input: InputState = {
      ...NO_INPUT,
      right: dir > 0,
      left: dir < 0,
      jump: t === jumpTick,
    };
    p = stepPlayer(p, input, FIXED_DT, w);
    if (p.y > fallY) return false;
    if (
      p.onGround &&
      Math.abs(p.y + PLAYER_HEIGHT - to.y) < 0.5 &&
      p.x < to.x1 - EPS &&
      p.x + PLAYER_WIDTH > to.x0 + EPS &&
      !(to.kind === from.kind && to.x0 === from.x0 && to.y === from.y)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 足場 from から足場 to へ、実際の物理(stepPlayer)で移動できる入力の組み合わせがあるかを探索する。
 * 探索する入力は「一方向に押し続け、1 回だけジャンプを押す(または押さない)」に限り、人間でも再現できる範囲にする。
 * 助走の位置(足場の上の位置)と跳び出しのタイミングを変えて試す。
 */
export function canTransit(world: WorldBounds, from: RouteNode, to: RouteNode): boolean {
  const w = localWorld(world, from, to);
  const minX = from.x0;
  const maxX = from.x1 - PLAYER_WIDTH;
  const clamp = (x: number) => Math.min(Math.max(x, minX), maxX);

  const attempts: Array<{ dir: 1 | -1; xs: number[] }> = [];
  // 右へ進む: to の左側から助走
  const rightBase = clamp(to.x0 - PLAYER_WIDTH);
  attempts.push({
    dir: 1,
    xs: Array.from({ length: RUN_UP_MAX / RUN_UP_STEP + 1 }, (_, k) => clamp(rightBase - k * RUN_UP_STEP)),
  });
  // 左へ進む: to の右側から助走
  const leftBase = clamp(to.x1);
  attempts.push({
    dir: -1,
    xs: Array.from({ length: RUN_UP_MAX / RUN_UP_STEP + 1 }, (_, k) => clamp(leftBase + k * RUN_UP_STEP)),
  });

  for (const { dir, xs } of attempts) {
    for (const x of new Set(xs)) {
      for (const j of JUMP_TICKS) {
        if (attempt(w, x, from, to, dir, j)) return true;
      }
    }
  }
  return false;
}
