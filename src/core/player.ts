import {
  FIXED_DT,
  GRAVITY,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from './config';
import type { InputState } from './input';
import { STAGE } from './stage';
import {
  platformsOf,
  resolveHorizontal,
  resolveVertical,
  solidsOf,
  type WorldBounds,
} from './terrain';

export type { WorldBounds } from './terrain';

/** x, y はプレイヤー矩形の左上(ワールド座標)。 */
export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

/** 既定の世界は、地形つきのステージ。 */
export const DEFAULT_WORLD: WorldBounds = STAGE.world;

export function createPlayer(x = 100, world: WorldBounds = DEFAULT_WORLD): Player {
  return { x, y: world.groundY - PLAYER_HEIGHT, vx: 0, vy: 0, onGround: true };
}

/**
 * 1 回の固定ステップ分、プレイヤーを更新して新しい状態を返す。
 * 地形(崖・浮島・地面)との衝突は、水平 → 垂直の順に解決する。
 * 水平の速さは、足場の上ではキーで決まり、空中では踏み切りの速さのまま保たれる(空中でキーを押しても軌道は変わらない)。
 * 地形を省略した世界は、従来と同じ平らな地面として動く。
 */
export function stepPlayer(
  player: Player,
  input: InputState,
  dt: number = FIXED_DT,
  world: WorldBounds = DEFAULT_WORLD,
): Player {
  const solids = solidsOf(world);
  const platforms = platformsOf(world);

  // 水平: 足場の上にいる間は、キーで速さを決める(左右同時押しは停止)。
  // 空中では、キーを見ず、直前の速さのまま進む(踏み切りの瞬間の速さが、着地まで保たれる)
  const grounded = player.onGround;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const wantedVx = grounded ? dir * MOVE_SPEED : player.vx;

  // ジャンプは足場(地面・崖・浮島)に接している間のみ
  let vy = player.vy;
  if (input.jump && player.onGround) {
    vy = -JUMP_SPEED;
  }

  // 半陰的オイラー法。落下速度には上限を設ける
  vy = Math.min(vy + GRAVITY * dt, MAX_FALL_SPEED);

  // 水平: 崖の側面で止め、ワールドの左右端にクランプ
  const intended = wantedVx * dt;
  let x = resolveHorizontal(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT, intended, solids);
  x = Math.min(Math.max(x, 0), world.width - PLAYER_WIDTH);
  // 空中で、崖の側面やワールドの端に阻まれたら、水平の速さは 0(壁に沿って真下へ落ちる)
  const blocked = !grounded && intended !== 0 && Math.abs(x - (player.x + intended)) > 1e-9;
  const vx = blocked ? 0 : wantedVx;

  // 垂直: 着地(崖・浮島の上面)と頭ぶつけ(崖の下面)
  const v = resolveVertical(
    player.y,
    player.y + vy * dt,
    vy,
    x,
    PLAYER_WIDTH,
    PLAYER_HEIGHT,
    solids,
    platforms,
  );

  return { x, y: v.y, vx, vy: v.vy, onGround: v.landed };
}
