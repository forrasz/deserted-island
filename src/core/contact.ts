import type { Rect } from './collision';
import { PLAYER_HEIGHT, PLAYER_WIDTH, STOMP_TOLERANCE } from './config';
import type { Player } from './player';

export function playerRect(p: Player): Rect {
  return { x: p.x, y: p.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/**
 * 踏みつけか。落下中(下向きの速度)で、更新前の下辺が、相手の上辺から許容量以内にあるとき。
 * ボスとザコ敵で共通。
 */
export function isStomp(prevPlayerY: number, playerVy: number, targetTop: number): boolean {
  const prevBottom = prevPlayerY + PLAYER_HEIGHT;
  return playerVy > 0 && prevBottom <= targetTop + STOMP_TOLERANCE;
}
