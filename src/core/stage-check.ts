import type { Rect } from './collision';
import {
  ENEMY_SIZE,
  HIDDEN_HOLE_WIDTH,
  HIDDEN_HOLE_X,
  FIXED_DT,
  SEA_X,
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
import { ENEMY_KINDS } from './enemy-defs';
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

  errors.push(...validatePlacements(stage));
  return errors;
}

/** 敵とボスの活動範囲(x の区間)が、穴・崖・浮島にかかっていないか。 */
function touchesFeature(stage: Stage, x0: number, x1: number): boolean {
  const hit = (r: { x: number; w: number }) => r.x < x1 && x0 < r.x + r.w;
  return stage.pits.some(hit) || stage.cliffs.some(hit) || stage.islands.some(hit);
}

/** 区間 [a0, a1] と [b0, b1] が重なるか。 */
function overlapsRange(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** 敵とボスの配置の検査(数・種類ごとの数・平地・安全な区間・ボスの前後・別々の闘技場)。 */
export function validatePlacements(stage: Stage): string[] {
  const errors: string[] = [];
  const START_SAFE = 600;
  const SHORE_SAFE = 600;
  const BOSS_MARGIN = 100;

  // ボス: 10 体、別々の闘技場(往復範囲が重ならない)、左から右へ順に、前後 100 が平地
  if (stage.bosses.length !== 10) errors.push(`ボスが 10 体ではない: ${stage.bosses.length}`);
  for (const [i, b] of stage.bosses.entries()) {
    const x0 = b.left - BOSS_MARGIN;
    const x1 = b.right + b.def.w + BOSS_MARGIN;
    if (touchesFeature(stage, x0, x1)) errors.push(`ボス ${i} の前後に穴・崖・浮島がある: ${x0}〜${x1}`);
    if (b.left < START_SAFE || x1 > SEA_X - SHORE_SAFE) errors.push(`ボス ${i} が安全な区間にいる`);
    const prev = stage.bosses[i - 1];
    if (prev && b.left <= prev.right + prev.def.w) errors.push(`ボス ${i} が前のボスの範囲と重なる、または順序が逆`);
  }

  // ザコ敵: 30 体以上、10 種類すべてが 3 体以上
  if (stage.enemies.length < 30) errors.push(`ザコ敵が 30 体未満: ${stage.enemies.length}`);
  for (const kind of ENEMY_KINDS) {
    const n = stage.enemies.filter((e) => e.kind === kind).length;
    if (n < 3) errors.push(`ザコ敵の種類 ${kind} が 3 体未満: ${n}`);
  }
  for (const [i, e] of stage.enemies.entries()) {
    const x0 = e.left;
    const x1 = e.right + ENEMY_SIZE;
    if (touchesFeature(stage, x0, x1)) errors.push(`ザコ敵 ${i}(${e.kind}) の範囲に穴・崖・浮島がある: ${x0}〜${x1}`);
    if (x0 < START_SAFE || x1 > SEA_X - SHORE_SAFE) errors.push(`ザコ敵 ${i}(${e.kind}) が安全な区間にいる`);
    if (e.x < e.left || e.x > e.right) errors.push(`ザコ敵 ${i}(${e.kind}) の初期位置が範囲の外`);
    for (const [j, b] of stage.bosses.entries()) {
      if (overlapsRange(x0, x1, b.left - BOSS_MARGIN, b.right + b.def.w + BOSS_MARGIN)) {
        errors.push(`ザコ敵 ${i}(${e.kind}) がボス ${j} の範囲と重なる`);
      }
    }
  }

  // 隠し穴(ボーナスステージの入口): 平らな地面の上(穴・崖がない)で、ザコ敵とボスの往復範囲と重ならない
  const h0 = HIDDEN_HOLE_X;
  const h1 = HIDDEN_HOLE_X + HIDDEN_HOLE_WIDTH;
  for (const p of stage.pits) {
    if (overlapsRange(h0, h1, p.x, p.x + p.w)) errors.push(`隠し穴が穴と重なる: x=${p.x}`);
  }
  for (const c of stage.cliffs) {
    if (overlapsRange(h0, h1, c.x, c.x + c.w)) errors.push(`隠し穴が崖と重なる: x=${c.x}`);
  }
  for (const [i, e] of stage.enemies.entries()) {
    if (overlapsRange(h0, h1, e.left, e.right + ENEMY_SIZE)) errors.push(`隠し穴がザコ敵 ${i} の範囲と重なる`);
  }
  for (const [j, b] of stage.bosses.entries()) {
    if (overlapsRange(h0, h1, b.left, b.right + b.def.w)) errors.push(`隠し穴がボス ${j} の範囲と重なる`);
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
