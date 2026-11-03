import {
  FIXED_DT,
  GRAVITY,
  GROUND_Y,
  JUMP_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  WORLD_WIDTH,
} from './config';
import type { InputState } from './input';

/** x, y はプレイヤー矩形の左上(ワールド座標)。 */
export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface WorldBounds {
  width: number;
  groundY: number;
}

export const DEFAULT_WORLD: WorldBounds = { width: WORLD_WIDTH, groundY: GROUND_Y };

export function createPlayer(x = 100, world: WorldBounds = DEFAULT_WORLD): Player {
  return { x, y: world.groundY - PLAYER_HEIGHT, vx: 0, vy: 0, onGround: true };
}

/** 1 回の固定ステップ分、プレイヤーを更新して新しい状態を返す。 */
export function stepPlayer(
  player: Player,
  input: InputState,
  dt: number = FIXED_DT,
  world: WorldBounds = DEFAULT_WORLD,
): Player {
  // 水平: 左右同時押しは停止
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const vx = dir * MOVE_SPEED;

  // ジャンプは地面に接している間のみ
  let vy = player.vy;
  if (input.jump && player.onGround) {
    vy = -JUMP_SPEED;
  }

  // 半陰的オイラー法
  vy += GRAVITY * dt;
  let x = player.x + vx * dt;
  let y = player.y + vy * dt;

  // ワールド左右端
  x = Math.min(Math.max(x, 0), world.width - PLAYER_WIDTH);

  // 着地
  let onGround = false;
  const floor = world.groundY - PLAYER_HEIGHT;
  if (y >= floor) {
    y = floor;
    vy = 0;
    onGround = true;
  }

  return { x, y, vx, vy, onGround };
}
