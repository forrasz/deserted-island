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

/** x, y はボス矩形の左上(ワールド座標)。left/right は x(左辺)が取りうる往復範囲。 */
export interface Boss {
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
): Boss {
  return {
    x,
    y: groundY - BOSS_HEIGHT,
    vx: BOSS_SPEED,
    hp: BOSS_MAX_HP,
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
