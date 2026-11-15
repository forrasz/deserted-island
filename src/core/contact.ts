import type { Rect } from './collision';
import {
  PLAYER_HEIGHT,
  PLAYER_HURT_HEIGHT,
  PLAYER_HURT_WIDTH,
  PLAYER_WIDTH,
  STOMP_TOLERANCE,
} from './config';
import type { Player } from './player';

export function playerRect(p: Player): Rect {
  return { x: p.x, y: p.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/**
 * 被弾判定の矩形。見た目(40×56)より小さい 28×46 で、下辺と左右の中心をそろえる。
 * ザコ敵・弾・衝撃波との被弾に使う。踏みつけ・地形・部品には、見た目の矩形(playerRect)を使う。
 */
export function playerHurtRect(p: Player): Rect {
  return {
    x: p.x + (PLAYER_WIDTH - PLAYER_HURT_WIDTH) / 2,
    y: p.y + (PLAYER_HEIGHT - PLAYER_HURT_HEIGHT),
    w: PLAYER_HURT_WIDTH,
    h: PLAYER_HURT_HEIGHT,
  };
}

/**
 * 踏みつけか。落下中(下向きの速度)で、更新前の下辺が、相手の上辺から許容量以内にあるとき。
 * ボスとザコ敵で共通。
 */
export function isStomp(prevPlayerY: number, playerVy: number, targetTop: number): boolean {
  const prevBottom = prevPlayerY + PLAYER_HEIGHT;
  return playerVy > 0 && prevBottom <= targetTop + STOMP_TOLERANCE;
}
