import { BLINK_PERIOD } from './config';

/**
 * 無敵中の点滅。無敵でなければ常に表示し、無敵中は period 秒ごとに表示と非表示を交互に切り替える。
 * 被弾した更新(残り時間がちょうど満タン)は表示で、その直後の最初の period 秒は非表示から始まる。
 */
export function blinkVisible(invuln: number, period: number = BLINK_PERIOD): boolean {
  if (invuln <= 0) return true;
  return Math.floor(invuln / period) % 2 === 0;
}
