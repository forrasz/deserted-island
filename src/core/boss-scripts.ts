import type { Boss } from './boss';
import {
  BOSS_TRANSFORM_TIME,
  FIXED_DT,
  GRAVITY,
  PROJECTILE_SIZE,
  WAVE_WIDTH,
} from './config';
import { createArc, createShot, createWave, type Projectile } from './projectile';

/**
 * ボスの行動の 1 つ。ボスは、行動の並び(行動の流れ)を順に実行し、最後まで終わったら最初に戻る。
 * 時間(time)の単位は秒、速さの単位は px/s。
 */
export type BossStep =
  | { a: 'patrol'; time: number; speed?: number } // 往復(速さの既定はボスの speed)
  | { a: 'burrow'; time: number } // もぐる(触れない・踏めない)
  | { a: 'telegraph'; time: number } // 予備動作(静止して点滅。プレイヤーの方向を向く)
  | { a: 'dash'; time: number; speed: number } // 予備動作の終わりのプレイヤーの方向へ突進
  | { a: 'rest'; time: number } // 休み(踏める)
  | { a: 'jump'; vy: number; air?: number; wave?: number } // ジャンプ。air: 空中でプレイヤー方向へ進む速さ、wave: 着地で出す衝撃波の速さ
  | { a: 'shot'; speed: number; tops: number[] } // 直進弾(地面から弾の上端までの高さごとに 1 発)。即時
  | { a: 'lob'; vx: number; vy: number } // 左右へ放物線の弾(1 発ずつ)。即時
  | { a: 'wave'; speed: number } // 左右へ衝撃波(1 つずつ)。即時
  | { a: 'rise'; height: number; speed: number } // 地面から height(ボスの下辺)の高さまで浮上
  | { a: 'hover'; time: number; speed: number } // 浮いたまま往復
  | { a: 'aim'; time: number; speed: number } // 浮いたまま、プレイヤーの真上へ水平に動く
  | { a: 'drop'; speed: number } // 急降下(着地で終わる)
  | { a: 'dizzy'; time: number } // 目を回す(踏める)
  | { a: 'roll'; time: number; speed: number }; // 転がる(踏めない。範囲の端で反転)

/** ボスの更新が参照する情報。 */
export interface BossCtx {
  /** プレイヤーの中心の x。 */
  playerX: number;
  groundY: number;
}

export interface BossStepResult {
  boss: Boss;
  /** この更新で出した弾・衝撃波。 */
  spawns: Projectile[];
}

/** 往復だけ(従来のボス)の行動の流れ。 */
export const PATROL_ONLY: BossStep[] = [{ a: 'patrol', time: Number.POSITIVE_INFINITY }];

/** 通常ボス 9 体の行動の流れ(数値は specs/boss-behaviors のとおり)。 */
export const BOSS_SCRIPTS = {
  momojiri: [
    { a: 'patrol', time: 2.5, speed: 80 },
    { a: 'burrow', time: 1.2 },
  ],
  tobihane: [
    { a: 'patrol', time: 1.0, speed: 87 },
    { a: 'jump', vy: 800, air: 160 },
  ],
  oogui: [
    { a: 'patrol', time: 2.0, speed: 94 },
    { a: 'telegraph', time: 0.6 },
    { a: 'dash', time: 0.8, speed: 320 },
    { a: 'rest', time: 0.8 },
  ],
  tamafuki: [
    { a: 'patrol', time: 1.6, speed: 100 },
    { a: 'telegraph', time: 0.4 },
    { a: 'shot', speed: 260, tops: [48] },
  ],
  naminori: [
    { a: 'patrol', time: 1.2, speed: 107 },
    { a: 'jump', vy: 700, wave: 280 },
    { a: 'rest', time: 0.6 },
  ],
  futago: [
    { a: 'patrol', time: 1.4, speed: 114 },
    { a: 'telegraph', time: 0.4 },
    { a: 'lob', vx: 300, vy: 650 },
  ],
  ukiuki: [
    { a: 'rise', height: 150, speed: 200 },
    { a: 'hover', time: 2.0, speed: 120 },
    { a: 'aim', time: 1.0, speed: 200 },
    { a: 'telegraph', time: 0.5 },
    { a: 'drop', speed: 800 },
    { a: 'dizzy', time: 1.2 },
  ],
  kororin: [
    { a: 'patrol', time: 1.5, speed: 127 },
    { a: 'roll', time: 2.0, speed: 260 },
    { a: 'dizzy', time: 1.2 },
  ],
  jishin: [
    { a: 'patrol', time: 1.5, speed: 134 },
    { a: 'telegraph', time: 0.5 },
    { a: 'wave', speed: 360 },
    { a: 'rest', time: 0.4 },
    { a: 'wave', speed: 360 },
    { a: 'rest', time: 0.8 },
  ],
} satisfies Record<string, BossStep[]>;

/**
 * 最終ボス「ヌシ」の通常形態の行動の流れ。
 * 往復 → 予備動作 → 突進 → 休み(1.0 秒)→ 予備動作 → 直進弾 3 発(低・中・高)→ ジャンプと衝撃波 → 休み(1.2 秒)。
 * 休みの間は身をかがめて(高さ 100)、ジャンプで踏める。ジャンプの最高点から上辺まで落ちるのに約 0.58 秒かかるため、休みは 1.0 秒以上にしてある。
 * 弾の高さ(tops)は、地面から弾の上端までの高さ。48 は地面に立つプレイヤー(高さ 56)に当たり、100 と 170 は頭上を通る。
 */
export const NUSHI_FORM1: BossStep[] = [
  { a: 'patrol', time: 1.2, speed: 100 },
  { a: 'telegraph', time: 0.8 },
  { a: 'dash', time: 1.0, speed: 400 },
  { a: 'rest', time: 1.0 },
  { a: 'telegraph', time: 0.5 },
  { a: 'shot', speed: 280, tops: [48, 100, 170] },
  { a: 'jump', vy: 800, wave: 300 },
  { a: 'rest', time: 1.2 },
];

/**
 * 「ヌシ」の強化形態。通常形態と同じ順番で、往復・予備動作・突進・休みの時間を 0.6 倍にし、
 * 突進を連続で 2 回、直進弾を 5 発に、衝撃波を 0.5 秒おきの 2 回にする。
 */
export const NUSHI_FORM2: BossStep[] = [
  { a: 'patrol', time: 1.2 * 0.6, speed: 140 },
  { a: 'telegraph', time: 0.8 * 0.6 },
  { a: 'dash', time: 1.0 * 0.6, speed: 400 },
  { a: 'telegraph', time: 0.5 * 0.6 },
  { a: 'dash', time: 1.0 * 0.6, speed: 400 },
  { a: 'rest', time: 1.0 * 0.6 },
  { a: 'telegraph', time: 0.5 * 0.6 },
  { a: 'shot', speed: 280, tops: [48, 76, 104, 138, 172] },
  { a: 'jump', vy: 800, wave: 300 },
  { a: 'rest', time: 0.5 },
  { a: 'wave', speed: 300 },
  { a: 'rest', time: 1.2 * 0.6 },
];

function clampX(b: Boss, x: number): number {
  return Math.min(Math.max(x, b.left), b.right);
}

/** 往復範囲の端で反転しながら、dir の向きに speed で動かす。 */
function patrolMove(b: Boss, speed: number, dt: number): { x: number; dir: 1 | -1 } {
  let x = b.x + b.dir * speed * dt;
  let dir = b.dir;
  if (x <= b.left) {
    x = b.left;
    dir = 1;
  } else if (x >= b.right) {
    x = b.right;
    dir = -1;
  }
  return { x, dir };
}

function sideOf(b: Boss, playerX: number): 1 | -1 {
  return playerX >= b.x + b.w / 2 ? 1 : -1;
}

/** 次の行動へ進む(最後の次は最初に戻る)。 */
function next(b: Boss, script: BossStep[]): Boss {
  return { ...b, step: (b.step + 1) % script.length, t: 0 };
}

/** 現在の形態の行動の流れ。 */
export function scriptOf(b: Boss): BossStep[] {
  return b.form === 2 && b.script2 ? b.script2 : b.script;
}

/** ボスの現在の状態を表す目印(踏めない・触れない・予備動作)。 */
export interface BossFlags {
  /** もぐっていて、触れも踏めもしない。 */
  hidden: boolean;
  /** 転がっていて、踏めない(触れると被弾する)。 */
  stompImmune: boolean;
  /** 変身中で、踏んでもダメージがなく、触れても被弾しない。 */
  harmless: boolean;
  /** 攻撃の予備動作の最中(点滅で示す)。 */
  telegraph: boolean;
  /** 休んでいて、身をかがめている(restH を持つボスだけ。高さが低くなり、踏める)。 */
  crouch: boolean;
}

export function bossFlags(b: Boss): BossFlags {
  const s = scriptOf(b)[b.step % scriptOf(b).length];
  return {
    hidden: s?.a === 'burrow',
    stompImmune: s?.a === 'roll',
    harmless: b.transformT > 0,
    telegraph: s?.a === 'telegraph' && b.transformT <= 0,
    crouch: b.restH !== undefined && s?.a === 'rest' && b.transformT <= 0,
  };
}

/**
 * 1 回の固定ステップ分、ボスを更新する(行動の流れを進め、弾を出す)。
 * 乱数は使わず、同じ条件では同じ時間に同じ行動をする。撃破済みのボスは変化しない。
 */
export function stepBossScript(boss: Boss, ctx: BossCtx, dt: number = FIXED_DT): BossStepResult {
  if (!boss.alive) return { boss, spawns: [] };
  const floorY = ctx.groundY - boss.h;
  let b: Boss = { ...boss, invuln: Math.max(0, boss.invuln - dt) };

  // 最終ボスの形態変化: 体力が半分以下になったら、1 回だけ変身に入る
  if (b.kind === 'nushi' && !b.transformed && b.hp <= b.maxHp / 2) {
    b = { ...b, transformed: true, transformT: BOSS_TRANSFORM_TIME, y: floorY, vy: 0, vx: 0 };
  }
  if (b.transformT > 0) {
    const transformT = b.transformT - dt;
    if (transformT <= 0) {
      return { boss: { ...b, transformT: 0, form: 2, step: 0, t: 0 }, spawns: [] };
    }
    return { boss: { ...b, transformT, vx: 0 }, spawns: [] };
  }

  const script = scriptOf(b);
  const s = script[b.step % script.length]!;
  const t = b.t + dt;
  const spawns: Projectile[] = [];
  const center = b.x + b.w / 2;
  const toPlayer = sideOf(b, ctx.playerX);
  const hoverY = (height: number) => ctx.groundY - height - b.h;

  switch (s.a) {
    case 'patrol': {
      const speed = s.speed ?? b.speed;
      const m = patrolMove(b, speed, dt);
      const moved = { ...b, x: m.x, dir: m.dir, vx: m.dir * speed, t };
      return { boss: t >= s.time ? next(moved, script) : moved, spawns };
    }
    case 'burrow':
    case 'rest':
    case 'dizzy': {
      const moved = { ...b, vx: 0, t };
      return { boss: t >= s.time ? next(moved, script) : moved, spawns };
    }
    case 'telegraph': {
      // 静止して、プレイヤーの方向を向く(最後の向きが、続く突進・攻撃の向きになる)
      const moved = { ...b, vx: 0, dir: toPlayer, aimDir: toPlayer, t };
      return { boss: t >= s.time ? next(moved, script) : moved, spawns };
    }
    case 'dash': {
      const dir = b.aimDir;
      const x = clampX(b, b.x + dir * s.speed * dt);
      const moved = { ...b, x, dir, vx: dir * s.speed, t };
      return { boss: t >= s.time ? next(moved, script) : moved, spawns };
    }
    case 'roll': {
      const m = patrolMove(b, s.speed, dt);
      const moved = { ...b, x: m.x, dir: m.dir, vx: m.dir * s.speed, t };
      return { boss: t >= s.time ? next(moved, script) : moved, spawns };
    }
    case 'jump': {
      let vy = b.vy;
      if (b.t === 0) vy = -s.vy; // 最初の更新で跳び上がる
      vy += GRAVITY * dt;
      let y = b.y + vy * dt;
      const air = s.air ?? 0;
      const x = clampX(b, b.x + toPlayer * air * dt);
      if (y >= floorY) {
        // 着地
        y = floorY;
        if (s.wave !== undefined) {
          spawns.push(
            createWave(b.x - WAVE_WIDTH, ctx.groundY, -s.wave),
            createWave(b.x + b.w, ctx.groundY, s.wave),
          );
        }
        return { boss: next({ ...b, x, y, vy: 0, vx: 0 }, script), spawns };
      }
      return { boss: { ...b, x, y, vy, vx: air ? toPlayer * air : 0, dir: air ? toPlayer : b.dir, t }, spawns };
    }
    case 'shot': {
      const dir = toPlayer;
      const x = dir > 0 ? b.x + b.w : b.x - PROJECTILE_SIZE;
      for (const top of s.tops) spawns.push(createShot(x, ctx.groundY - top, dir * s.speed));
      return { boss: next({ ...b, dir, aimDir: dir, vx: 0 }, script), spawns };
    }
    case 'lob': {
      const x = center - PROJECTILE_SIZE / 2;
      spawns.push(createArc(x, b.y, -s.vx, -s.vy), createArc(x, b.y, s.vx, -s.vy));
      return { boss: next({ ...b, vx: 0 }, script), spawns };
    }
    case 'wave': {
      spawns.push(
        createWave(b.x - WAVE_WIDTH, ctx.groundY, -s.speed),
        createWave(b.x + b.w, ctx.groundY, s.speed),
      );
      return { boss: next({ ...b, vx: 0 }, script), spawns };
    }
    case 'rise': {
      const target = hoverY(s.height);
      const y = Math.max(target, b.y - s.speed * dt);
      const moved = { ...b, y, vx: 0, t };
      return { boss: y <= target ? next(moved, script) : moved, spawns };
    }
    case 'hover': {
      const speed = s.speed;
      const m = patrolMove(b, speed, dt);
      const moved = { ...b, x: m.x, dir: m.dir, vx: m.dir * speed, t };
      return { boss: t >= s.time ? next(moved, script) : moved, spawns };
    }
    case 'aim': {
      const dx = ctx.playerX - center;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), s.speed * dt);
      const x = clampX(b, b.x + step);
      const moved = { ...b, x, vx: step / dt, dir: dx >= 0 ? (1 as const) : (-1 as const), t };
      return { boss: t >= s.time ? next(moved, script) : moved, spawns };
    }
    case 'drop': {
      const y = Math.min(floorY, b.y + s.speed * dt);
      const moved = { ...b, y, vy: s.speed, vx: 0, t };
      return { boss: y >= floorY ? next({ ...moved, vy: 0 }, script) : moved, spawns };
    }
  }
}
