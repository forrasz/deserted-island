/** 向き。右 = 1、左 = -1。素材は右向きで描かれている前提。 */
export type Facing = 1 | -1;

/** 水平速度から次の向きを決める。停止中(0)は直前の向きを保つ。 */
export function nextFacing(prev: Facing, vx: number): Facing {
  if (vx > 0) return 1;
  if (vx < 0) return -1;
  return prev;
}
