import { describe, expect, it } from 'vitest';
import { playerHurtRect, playerRect } from './contact';
import {
  ENEMY_HURT_SIZE,
  ENEMY_SIZE,
  FIXED_DT,
  GROUND_Y,
  HIT_BOUNCE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_HURT_HEIGHT,
  PLAYER_HURT_WIDTH,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  STOMP_BOUNCE_SPEED,
} from './config';
import { createEnemy, enemyHurtRect, enemyRect, type Enemy } from './enemy';
import { resolveEnemyContact } from './enemy-contact';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT } from './input';
import type { Player } from './player';
import { createShot, createWave, resolveProjectileContact } from './projectile';
import { createPart } from './raft-part';

const H = PLAYER_HEIGHT;
const W = PLAYER_WIDTH;

const enemy = (x = 1000): Enemy => createEnemy('plodder', x, 0, 5000);
const standing = (x: number): Player => ({ x, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true });

describe('被弾判定の矩形(player-health / enemy-system)', () => {
  it('プレイヤーの被弾判定は 28×46 で、下辺と左右の中心が見た目の矩形とそろう', () => {
    const p: Player = { x: 100, y: 200, vx: 0, vy: 0, onGround: true };
    expect(playerHurtRect(p)).toEqual({ x: 106, y: 210, w: 28, h: 46 });
    expect([PLAYER_HURT_WIDTH, PLAYER_HURT_HEIGHT]).toEqual([28, 46]);
    const v = playerRect(p);
    const h = playerHurtRect(p);
    expect(h.y + h.h).toBe(v.y + v.h);
    expect(h.x + h.w / 2).toBe(v.x + v.w / 2);
  });

  it('ザコ敵の被弾判定は 32×32 で、下辺と左右の中心が見た目の矩形とそろう', () => {
    const e = enemy(500);
    const moved: Enemy = { ...e, x: 500, y: 300 };
    expect(enemyHurtRect(moved)).toEqual({ x: 504, y: 308, w: 32, h: 32 });
    expect(ENEMY_HURT_SIZE).toBe(32);
    const v = enemyRect(moved);
    const h = enemyHurtRect(moved);
    expect(h.y + h.h).toBe(v.y + v.h);
    expect(h.x + h.w / 2).toBe(v.x + v.w / 2);
    expect(ENEMY_SIZE).toBe(40);
  });
});

describe('ザコ敵との被弾(掠りの扱い)', () => {
  it('見た目の矩形が 6 px 重なるだけ(被弾判定は重ならない)なら、被弾せず、敵も倒れない', () => {
    const e = enemy();
    const p = standing(e.x - W + 6);
    const r = resolveEnemyContact(p, p, [e], false);
    expect(r.hit).toBe(false);
    expect(r.stomped).toBe(false);
    expect(r.enemies[0]!.alive).toBe(true);
  });

  it('見た目が 10 px 重なっても、被弾判定は接するだけで、被弾しない(境界)', () => {
    const e = enemy();
    const p = standing(e.x - W + 10);
    expect(resolveEnemyContact(p, p, [e], false).hit).toBe(false);
  });

  it('被弾判定どうしが重なる(見た目が 22 px 重なる)と、被弾する', () => {
    const e = enemy();
    const p = standing(e.x - W + 22);
    const r = resolveEnemyContact(p, p, [e], false);
    expect(r.hit).toBe(true);
    expect(r.player.vy).toBe(-HIT_BOUNCE_SPEED);
  });

  it('反対側(敵の右側)からも、同じ重なりで被弾する/しない', () => {
    const e = enemy();
    expect(resolveEnemyContact(standing(e.x + ENEMY_SIZE - 6), standing(e.x + ENEMY_SIZE - 6), [e], false).hit).toBe(false);
    expect(resolveEnemyContact(standing(e.x + ENEMY_SIZE - 22), standing(e.x + ENEMY_SIZE - 22), [e], false).hit).toBe(true);
  });

  it('踏みつけは、見た目の矩形のまま: 敵の端(見た目で 3 px 重なる)に落ちても、踏める', () => {
    const e = enemy();
    const prev: Player = { x: e.x - W + 3, y: e.y - H - 5, vx: 0, vy: 300, onGround: false };
    const cur: Player = { ...prev, y: prev.y + 5.5 };
    const r = resolveEnemyContact(prev, cur, [e], false);
    expect(r.stomped).toBe(true);
    expect(r.enemies[0]!.alive).toBe(false);
    expect(r.player.vy).toBe(-STOMP_BOUNCE_SPEED);
    expect(r.hit).toBe(false);
  });

  it('無敵中は、被弾判定が重なっても被弾せず、通り抜ける', () => {
    const e = enemy();
    const p = standing(e.x - W + 22);
    const r = resolveEnemyContact(p, p, [e], true);
    expect(r.hit).toBe(false);
    expect(r.player).toBe(p);
  });
});

describe('弾・衝撃波との被弾(掠りの扱い)', () => {
  const pl = standing(500);
  const hurt = playerHurtRect(pl);

  it('プレイヤーの見た目の矩形にだけ掠る弾(被弾判定の外)は、当たらず、消えない', () => {
    // 見た目の左端 500〜506 の範囲(被弾判定の外)に、弾の右端が 3 px だけ入る位置
    const shot = createShot(500 - 24 + 3, hurt.y + 10, 0);
    const r = resolveProjectileContact(pl, [shot], false);
    expect(r.hit).toBe(false);
    expect(r.projectiles[0]!.alive).toBe(true);
  });

  it('被弾判定に重なる弾は、当たって、消える', () => {
    const shot = createShot(hurt.x - 10, hurt.y + 10, 0);
    const r = resolveProjectileContact(pl, [shot], false);
    expect(r.hit).toBe(true);
    expect(r.projectiles[0]!.alive).toBe(false);
  });

  it('地面を走る衝撃波は、ジャンプで頭より下を通せば、当たらない', () => {
    const wave = createWave(pl.x, GROUND_Y, 0);
    const air: Player = { ...pl, y: GROUND_Y - H - 40, onGround: false };
    expect(resolveProjectileContact(air, [wave], false).hit).toBe(false);
  });

  it('無敵中は、被弾せず、弾は消えずに進む', () => {
    const shot = createShot(hurt.x, hurt.y + 10, 0);
    const r = resolveProjectileContact(pl, [shot], true);
    expect(r.hit).toBe(false);
    expect(r.projectiles[0]!.alive).toBe(true);
  });
});

describe('ほかの判定は、見た目の矩形のまま(game)', () => {
  const base = (): GameState => createGame(undefined, { bosses: [], enemies: [] });

  it('部品は、見た目の矩形の端が重なるだけで拾える', () => {
    const part = createPart(500 - 24 + 2, GROUND_Y - 24);
    const g = stepGame(
      { ...base(), parts: [{ ...part, vy: 0 }], player: standing(500) },
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.partsCollected).toBe(1);
  });

  it('ゲーム内でも、ザコ敵に掠るだけでは HP が減らない', () => {
    const e = enemy();
    const g = stepGame({ ...base(), enemies: [e], player: standing(e.x - W + 6) }, NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(PLAYER_MAX_HP);
  });
});
