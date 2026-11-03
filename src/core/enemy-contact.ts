import { overlaps } from './collision';
import { isStomp, playerRect } from './contact';
import { HIT_BOUNCE_SPEED, PLAYER_HEIGHT, STOMP_BOUNCE_SPEED } from './config';
import { enemyRect, type Enemy } from './enemy';
import type { Player } from './player';

export interface EnemyContactResult {
  player: Player;
  enemies: Enemy[];
  /** 被弾したか(HP を減らす更新)。 */
  hit: boolean;
  /** 踏みつけで敵を倒したか。 */
  stomped: boolean;
}

/**
 * プレイヤーとザコ敵の接触。
 * - 上から踏みつけた(落下中かつ更新前の下辺が上辺付近): その敵を倒し、プレイヤーを跳ね返す。被弾しない。
 * - それ以外の重なり: 無敵でなければ被弾(小さく跳ね上がる)。ボスと違い、押し戻さない(無敵の間は通り抜ける)。
 * - 倒された敵・隠れている敵とは接触しない。
 * - 同じ更新で踏みつけが成立したら、被弾しない(踏みつけを優先)。
 */
export function resolveEnemyContact(
  prevPlayer: Player,
  player: Player,
  enemies: Enemy[],
  invulnerable: boolean,
): EnemyContactResult {
  let p = player;
  let stomped = false;
  let touched = false;

  const next = enemies.map((e) => {
    if (!e.alive || e.hidden) return e;
    if (!overlaps(playerRect(p), enemyRect(e))) return e;
    if (isStomp(prevPlayer.y, player.vy, e.y)) {
      stomped = true;
      p = { ...p, y: e.y - PLAYER_HEIGHT, vy: -STOMP_BOUNCE_SPEED, onGround: false };
      return { ...e, alive: false };
    }
    touched = true;
    return e;
  });

  const hit = touched && !stomped && !invulnerable;
  if (hit) p = { ...p, vy: -HIT_BOUNCE_SPEED, onGround: false };
  return { player: p, enemies: next, hit, stomped };
}
