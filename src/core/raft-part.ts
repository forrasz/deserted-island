import { FIXED_DT, GRAVITY, GROUND_Y, PART_HEIGHT, PART_WIDTH } from './config';
import type { Rect } from './collision';

/** x, y は部品矩形の左上(ワールド座標)。 */
export interface RaftPart {
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
}

export function createPart(x: number, y: number): RaftPart {
  return { x, y, vy: 0, grounded: false };
}

export function partRect(part: RaftPart): Rect {
  return { x: part.x, y: part.y, w: PART_WIDTH, h: PART_HEIGHT };
}

/** 重力で落下し、地面に達したら静止する。静止後は変化しない。 */
export function stepPart(part: RaftPart, dt: number = FIXED_DT, groundY: number = GROUND_Y): RaftPart {
  if (part.grounded) return part;
  const vy = part.vy + GRAVITY * dt;
  const y = part.y + vy * dt;
  const floor = groundY - PART_HEIGHT;
  if (y >= floor) return { ...part, y: floor, vy: 0, grounded: true };
  return { ...part, y, vy };
}
