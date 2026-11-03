import { VIEW_WIDTH, WORLD_WIDTH } from './config';

/** プレイヤー中心にカメラ x を決め、ワールド範囲 [0, worldWidth - viewWidth] に収める。 */
export function computeCameraX(
  playerCenterX: number,
  viewWidth: number = VIEW_WIDTH,
  worldWidth: number = WORLD_WIDTH,
): number {
  const maxX = Math.max(0, worldWidth - viewWidth);
  return Math.min(Math.max(playerCenterX - viewWidth / 2, 0), maxX);
}

/** ワールド x を画面 x に変換する。 */
export function worldToScreen(worldX: number, cameraX: number): number {
  return worldX - cameraX;
}
