import { BONUS_HEIGHT, BONUS_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH, VIEW_HEIGHT, VIEW_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from './config';
import type { GameState } from './game';

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

/** プレイヤー中心にカメラ y を決め、ワールド範囲 [0, worldHeight - viewHeight] に収める。 */
export function computeCameraY(
  playerCenterY: number,
  viewHeight: number = VIEW_HEIGHT,
  worldHeight: number = WORLD_HEIGHT,
): number {
  const maxY = Math.max(0, worldHeight - viewHeight);
  return Math.min(Math.max(playerCenterY - viewHeight / 2, 0), maxY);
}

/** ワールド y を画面 y に変換する。 */
export function worldToScreenY(worldY: number, cameraY: number): number {
  return worldY - cameraY;
}

/** 描画するプレイヤーのカメラ位置。ボーナスステージ中は広間の大きさで、そうでなければ本編のステージの大きさで決める。 */
export function cameraOf(game: GameState): { x: number; y: number } {
  const p = game.bonus ? game.bonus.player : game.player;
  const cx = p.x + PLAYER_WIDTH / 2;
  const cy = p.y + PLAYER_HEIGHT / 2;
  if (game.bonus) {
    return {
      x: computeCameraX(cx, VIEW_WIDTH, BONUS_WIDTH),
      y: computeCameraY(cy, VIEW_HEIGHT, BONUS_HEIGHT),
    };
  }
  return { x: computeCameraX(cx), y: computeCameraY(cy) };
}
