import {
  BOUNCER_BOUNCE_SPEED,
  BOUNCER_SPEED,
  CHARGER_DASH_SPEED,
  CHARGER_DASH_TIME,
  CHARGER_WALK_SPEED,
  CHARGER_WALK_TIME,
  CHASER_PATROL_SPEED,
  CHASER_RANGE,
  CHASER_SPEED,
  ENEMY_SIZE,
  FIXED_DT,
  FLOATER_AMPLITUDE,
  FLOATER_HEIGHT,
  FLOATER_PERIOD,
  FLOATER_SPEED,
  GRAVITY,
  GROUND_Y,
  HIDER_HIDDEN_TIME,
  HIDER_SPEED,
  HIDER_VISIBLE_TIME,
  HOPPER_INTERVAL,
  HOPPER_JUMP_SPEED,
  HOPPER_SPEED,
  PLODDER_SPEED,
  SCURRIER_SPEED,
  SLEEPER_DASH_SPEED,
  SLEEPER_DASH_TIME,
  SLEEPER_REST_TIME,
  SLEEPER_TRIGGER,
  SWOOPER_DIVE_BOTTOM,
  SWOOPER_DIVE_SPEED,
  SWOOPER_HEIGHT,
  SWOOPER_RISE_SPEED,
  SWOOPER_SPEED,
  SWOOPER_TRIGGER,
} from './config';
import type { Rect } from './collision';
import type { EnemyKind } from './enemy-defs';

/** 行動の段階。種類ごとに使うものが異なる。 */
export type EnemyPhase =
  | 'walk'
  | 'idle'
  | 'dash'
  | 'rest'
  | 'patrol'
  | 'dive'
  | 'rise'
  | 'visible'
  | 'hidden';

/** x, y は敵の当たり判定の左上(ワールド座標)。left / right は x(左辺)が取りうる往復範囲。 */
export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  left: number;
  right: number;
  /** 向き(右 = 1、左 = -1)。 */
  dir: 1 | -1;
  /** 行動の経過時間(秒)。 */
  timer: number;
  phase: EnemyPhase;
  /** 空中の敵の基準の高さ(y)。地面の敵では接地したときの y。 */
  baseY: number;
  /** 隠れていて、描画も接触もされない状態か。 */
  hidden: boolean;
}

/** プレイヤー(の中心)の位置など、敵の行動が参照する情報。 */
export interface EnemyCtx {
  playerX: number;
  playerY: number;
  groundY?: number;
}

const AIR_KINDS: readonly EnemyKind[] = ['floater', 'swooper'];

export function enemyRect(e: Enemy): Rect {
  return { x: e.x, y: e.y, w: ENEMY_SIZE, h: ENEMY_SIZE };
}

/** 種類ごとの初期の段階。 */
function initialPhase(kind: EnemyKind): EnemyPhase {
  switch (kind) {
    case 'sleeper':
      return 'idle';
    case 'swooper':
      return 'patrol';
    case 'hider':
      return 'visible';
    default:
      return 'walk';
  }
}

/** 種類ごとの、往復の基本の速さ(0 なら動かない)。 */
function baseSpeed(kind: EnemyKind): number {
  switch (kind) {
    case 'plodder':
      return PLODDER_SPEED;
    case 'scurrier':
      return SCURRIER_SPEED;
    case 'hopper':
      return HOPPER_SPEED;
    case 'chaser':
      return CHASER_PATROL_SPEED;
    case 'floater':
      return FLOATER_SPEED;
    case 'swooper':
      return SWOOPER_SPEED;
    case 'bouncer':
      return BOUNCER_SPEED;
    case 'hider':
      return HIDER_SPEED;
    case 'charger':
      return CHARGER_WALK_SPEED;
    case 'sleeper':
      return 0;
  }
}

export function createEnemy(
  kind: EnemyKind,
  x: number,
  left: number,
  right: number,
  groundY: number = GROUND_Y,
  id = 0,
): Enemy {
  const groundTop = groundY - ENEMY_SIZE;
  const air = AIR_KINDS.includes(kind);
  const height = kind === 'floater' ? FLOATER_HEIGHT : SWOOPER_HEIGHT;
  const y = air ? groundY - height - ENEMY_SIZE : groundTop;
  return {
    id,
    kind,
    x,
    y,
    vx: baseSpeed(kind),
    vy: 0,
    alive: true,
    left,
    right,
    dir: 1,
    timer: 0,
    phase: initialPhase(kind),
    baseY: y,
    hidden: false,
  };
}

/** 往復範囲の中を、speed で dir の向きに動かし、端で反転する。 */
function patrol(e: Enemy, speed: number, dt: number): Pick<Enemy, 'x' | 'dir' | 'vx'> {
  let x = e.x + e.dir * speed * dt;
  let dir = e.dir;
  if (x <= e.left) {
    x = e.left;
    dir = 1;
  } else if (x >= e.right) {
    x = e.right;
    dir = -1;
  }
  return { x, dir, vx: dir * speed };
}

/** 重力で動く縦方向(ジャンプ・弾み)。着地したら接地の y に合わせ、着地した更新かどうかを返す。 */
function gravityStep(e: Enemy, dt: number): { y: number; vy: number; landed: boolean } {
  const floor = e.baseY;
  const vy = e.vy + GRAVITY * dt;
  const y = e.y + vy * dt;
  if (y >= floor) return { y: floor, vy: 0, landed: true };
  return { y, vy, landed: false };
}

function onFloor(e: Enemy): boolean {
  return e.y >= e.baseY - 1e-9 && e.vy === 0;
}

/** x を往復範囲に収める。 */
function clampX(e: Enemy, x: number): number {
  return Math.min(Math.max(x, e.left), e.right);
}

/** プレイヤーの中心と敵の中心の、水平の符号付きの距離(プレイヤーが右なら正)。 */
function dxToPlayer(e: Enemy, ctx: EnemyCtx): number {
  return ctx.playerX - (e.x + ENEMY_SIZE / 2);
}

/** 1 回の固定ステップ分、敵を更新して新しい状態を返す。倒された敵は変化しない。 */
export function stepEnemy(e: Enemy, ctx: EnemyCtx, dt: number = FIXED_DT): Enemy {
  if (!e.alive) return e;
  switch (e.kind) {
    case 'plodder':
    case 'scurrier':
      return { ...e, ...patrol(e, baseSpeed(e.kind), dt) };
    case 'hopper':
      return stepHopper(e, dt);
    case 'bouncer':
      return stepBouncer(e, dt);
    case 'sleeper':
      return stepSleeper(e, ctx, dt);
    case 'chaser':
      return stepChaser(e, ctx, dt);
    case 'floater':
      return stepFloater(e, dt);
    case 'swooper':
      return stepSwooper(e, ctx, dt);
    case 'hider':
      return stepHider(e, dt);
    case 'charger':
      return stepCharger(e, dt);
  }
}

function stepHopper(e: Enemy, dt: number): Enemy {
  const moved = patrol(e, HOPPER_SPEED, dt);
  let timer = e.timer + dt;
  let { y, vy } = e;
  if (onFloor(e)) {
    if (timer >= HOPPER_INTERVAL) {
      // 1.2 秒ごとにジャンプ
      timer = 0;
      vy = -HOPPER_JUMP_SPEED;
      const g = gravityStep({ ...e, vy }, dt);
      y = g.y;
      vy = g.vy;
    }
  } else {
    const g = gravityStep(e, dt);
    y = g.y;
    vy = g.vy;
  }
  return { ...e, ...moved, y, vy, timer };
}

function stepBouncer(e: Enemy, dt: number): Enemy {
  const moved = patrol(e, BOUNCER_SPEED, dt);
  const g = gravityStep(e, dt);
  // 着地した更新で、上向きの速度 600 に跳ね返る(地面に留まらない)
  const vy = g.landed ? -BOUNCER_BOUNCE_SPEED : g.vy;
  return { ...e, ...moved, y: g.y, vy };
}

function stepSleeper(e: Enemy, ctx: EnemyCtx, dt: number): Enemy {
  const dx = dxToPlayer(e, ctx);
  switch (e.phase) {
    case 'dash': {
      const x = clampX(e, e.x + e.dir * SLEEPER_DASH_SPEED * dt);
      const timer = e.timer + dt;
      if (timer >= SLEEPER_DASH_TIME) return { ...e, x, vx: 0, timer: 0, phase: 'rest' };
      return { ...e, x, vx: e.dir * SLEEPER_DASH_SPEED, timer };
    }
    case 'rest': {
      const timer = e.timer + dt;
      if (timer >= SLEEPER_REST_TIME) return { ...e, vx: 0, timer: 0, phase: 'idle' };
      return { ...e, vx: 0, timer };
    }
    default: {
      // idle: プレイヤーが近づいたら、その方向へ突進を始める
      if (Math.abs(dx) <= SLEEPER_TRIGGER) {
        const dir: 1 | -1 = dx >= 0 ? 1 : -1;
        const x = clampX(e, e.x + dir * SLEEPER_DASH_SPEED * dt);
        return { ...e, x, dir, vx: dir * SLEEPER_DASH_SPEED, timer: dt, phase: 'dash' };
      }
      return { ...e, vx: 0 };
    }
  }
}

function stepChaser(e: Enemy, ctx: EnemyCtx, dt: number): Enemy {
  const dx = dxToPlayer(e, ctx);
  if (Math.abs(dx) <= CHASER_RANGE) {
    // 追いかける(往復範囲の外へは出ない)
    if (Math.abs(dx) < 2) return { ...e, vx: 0 };
    const dir: 1 | -1 = dx > 0 ? 1 : -1;
    const x = clampX(e, e.x + dir * CHASER_SPEED * dt);
    return { ...e, x, dir, vx: x === e.x ? 0 : dir * CHASER_SPEED };
  }
  return { ...e, ...patrol(e, CHASER_PATROL_SPEED, dt) };
}

function stepFloater(e: Enemy, dt: number): Enemy {
  const timer = e.timer + dt;
  const y = e.baseY + FLOATER_AMPLITUDE * Math.sin((2 * Math.PI * timer) / FLOATER_PERIOD);
  return { ...e, ...patrol(e, FLOATER_SPEED, dt), y, timer };
}

function stepSwooper(e: Enemy, ctx: EnemyCtx, dt: number): Enemy {
  const groundY = ctx.groundY ?? GROUND_Y;
  const bottomY = groundY - ENEMY_SIZE - SWOOPER_DIVE_BOTTOM; // 降下の底(y)
  switch (e.phase) {
    case 'dive': {
      const y = e.y + SWOOPER_DIVE_SPEED * dt;
      if (y >= bottomY) return { ...e, y: bottomY, vx: 0, vy: 0, phase: 'rise' };
      return { ...e, y, vx: 0, vy: SWOOPER_DIVE_SPEED };
    }
    case 'rise': {
      const y = e.y - SWOOPER_RISE_SPEED * dt;
      if (y <= e.baseY) return { ...e, y: e.baseY, vx: 0, vy: 0, phase: 'patrol' };
      return { ...e, y, vx: 0, vy: -SWOOPER_RISE_SPEED };
    }
    default: {
      // patrol: 真下(水平 60 以内)にプレイヤーが来たら急降下
      if (Math.abs(dxToPlayer(e, ctx)) <= SWOOPER_TRIGGER) {
        const y = e.y + SWOOPER_DIVE_SPEED * dt;
        return { ...e, y, vx: 0, vy: SWOOPER_DIVE_SPEED, phase: 'dive' };
      }
      return { ...e, ...patrol(e, SWOOPER_SPEED, dt), vy: 0 };
    }
  }
}

function stepHider(e: Enemy, dt: number): Enemy {
  if (e.phase === 'hidden') {
    const timer = e.timer + dt;
    if (timer >= HIDER_HIDDEN_TIME) return { ...e, vx: 0, timer: 0, phase: 'visible', hidden: false };
    return { ...e, vx: 0, timer, hidden: true };
  }
  const moved = patrol(e, HIDER_SPEED, dt);
  const timer = e.timer + dt;
  if (timer >= HIDER_VISIBLE_TIME) return { ...e, ...moved, vx: 0, timer: 0, phase: 'hidden', hidden: true };
  return { ...e, ...moved, timer, hidden: false };
}

function stepCharger(e: Enemy, dt: number): Enemy {
  if (e.phase === 'dash') {
    const moved = patrol(e, CHARGER_DASH_SPEED, dt);
    const timer = e.timer + dt;
    if (timer >= CHARGER_DASH_TIME) return { ...e, ...moved, timer: 0, phase: 'walk', vx: moved.dir * CHARGER_WALK_SPEED };
    return { ...e, ...moved, timer };
  }
  const moved = patrol(e, CHARGER_WALK_SPEED, dt);
  const timer = e.timer + dt;
  if (timer >= CHARGER_WALK_TIME) return { ...e, ...moved, timer: 0, phase: 'dash', vx: moved.dir * CHARGER_DASH_SPEED };
  return { ...e, ...moved, timer };
}
