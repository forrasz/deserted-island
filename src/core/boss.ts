import {
  BOSS_HEIGHT,
  BOSS_INVULN_TIME,
  BOSS_MAX_HP,
  BOSS_PATROL_LEFT,
  BOSS_PATROL_RIGHT,
  BOSS_SPEED,
  BOSS_START_X,
  BOSS_WIDTH,
  FIXED_DT,
  GROUND_Y,
} from './config';

/** ボスごとの定義(体力・往復の速さ・往復範囲の幅)。位置は配置(ステージ)で決める。 */
export interface BossDef {
  id: number;
  maxHp: number;
  /** 往復の速さ(px/s)。 */
  speed: number;
  /** 往復範囲の幅(px)。 */
  rangeWidth: number;
}

/** 既定のボス(従来の 1 体)の定義。 */
export const DEFAULT_BOSS_DEF: BossDef = {
  id: 0,
  maxHp: BOSS_MAX_HP,
  speed: BOSS_SPEED,
  rangeWidth: BOSS_PATROL_RIGHT - BOSS_PATROL_LEFT,
};

/**
 * ボス 10 体の定義。先に進むほど強い(体力が多く、速く、往復範囲が広い)。
 * 体力 3〜5、速さ 80〜140、往復範囲の幅 400〜500。
 */
export const BOSS_DEFS: BossDef[] = [
  { id: 0, maxHp: 3, speed: 80, rangeWidth: 400 },
  { id: 1, maxHp: 3, speed: 87, rangeWidth: 410 },
  { id: 2, maxHp: 3, speed: 94, rangeWidth: 420 },
  { id: 3, maxHp: 4, speed: 100, rangeWidth: 430 },
  { id: 4, maxHp: 4, speed: 107, rangeWidth: 440 },
  { id: 5, maxHp: 4, speed: 114, rangeWidth: 450 },
  { id: 6, maxHp: 4, speed: 120, rangeWidth: 460 },
  { id: 7, maxHp: 5, speed: 127, rangeWidth: 470 },
  { id: 8, maxHp: 5, speed: 134, rangeWidth: 490 },
  { id: 9, maxHp: 5, speed: 140, rangeWidth: 500 },
];

/** x, y はボス矩形の左上(ワールド座標)。left/right は x(左辺)が取りうる往復範囲。 */
export interface Boss {
  id: number;
  /** 最大体力(`hp` の初期値)。体力バーの表示に使う。 */
  maxHp: number;
  /** 往復の速さ(px/s)。 */
  speed: number;
  x: number;
  y: number;
  vx: number;
  hp: number;
  /** 残りの無敵時間(秒)。0 なら被弾可能。 */
  invuln: number;
  alive: boolean;
  left: number;
  right: number;
}

export function createBoss(
  x: number = BOSS_START_X,
  left: number = BOSS_PATROL_LEFT,
  right: number = BOSS_PATROL_RIGHT,
  groundY: number = GROUND_Y,
  def: BossDef = DEFAULT_BOSS_DEF,
): Boss {
  return {
    id: def.id,
    maxHp: def.maxHp,
    speed: def.speed,
    x,
    y: groundY - BOSS_HEIGHT,
    vx: def.speed,
    hp: def.maxHp,
    invuln: 0,
    alive: true,
    left,
    right,
  };
}

export function bossRect(boss: Boss) {
  return { x: boss.x, y: boss.y, w: BOSS_WIDTH, h: BOSS_HEIGHT };
}

/** 往復移動と無敵タイマーの更新。撃破済みなら何もしない。 */
export function stepBoss(boss: Boss, dt: number = FIXED_DT): Boss {
  if (!boss.alive) return boss;

  const invuln = Math.max(0, boss.invuln - dt);
  let x = boss.x + boss.vx * dt;
  let vx = boss.vx;
  if (x <= boss.left) {
    x = boss.left;
    vx = Math.abs(vx);
  } else if (x >= boss.right) {
    x = boss.right;
    vx = -Math.abs(vx);
  }
  return { ...boss, x, vx, invuln };
}

/** 踏みつけによるダメージ。無敵中・撃破済みならそのまま返す。体力 0 で撃破。 */
export function damageBoss(boss: Boss): Boss {
  if (!boss.alive || boss.invuln > 0) return boss;
  const hp = boss.hp - 1;
  return { ...boss, hp, invuln: BOSS_INVULN_TIME, alive: hp > 0 };
}
