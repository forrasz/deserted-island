import { describe, expect, it } from 'vitest';
import {
  GROUND_Y,
  HIT_BOUNCE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  STOMP_BOUNCE_SPEED,
} from './config';
import { enemyRect, createEnemy, type Enemy } from './enemy';
import { resolveEnemyContact } from './enemy-contact';
import type { Player } from './player';

const H = PLAYER_HEIGHT;
const W = PLAYER_WIDTH;

function enemy(kind: Parameters<typeof createEnemy>[0] = 'plodder', x = 1000): Enemy {
  return createEnemy(kind, x, 0, 5000);
}

/** 敵の真上、gap だけ離れた空中のプレイヤーが、1 更新で落下して重なる状況(前の位置と現在の位置)。 */
function falling(e: Enemy, gap = 5, vy = 300): { prev: Player; cur: Player } {
  const prev: Player = { x: e.x, y: e.y - H - gap, vx: 0, vy, onGround: false };
  const cur: Player = { ...prev, y: prev.y + gap + 0.5 };
  return { prev, cur };
}

/** 地面に立って、敵の側面と 10px 重なっているプレイヤー。 */
function side(e: Enemy): { prev: Player; cur: Player } {
  const p: Player = { x: e.x - W + 10, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };
  return { prev: p, cur: p };
}

describe('踏みつけで倒す', () => {
  it('落下中に上から重なると、敵が倒れ、プレイヤーは上向きに跳ね返り、被弾しない', () => {
    const e = enemy();
    const { prev, cur } = falling(e);
    const r = resolveEnemyContact(prev, cur, [e], false);
    expect(r.enemies[0]!.alive).toBe(false);
    expect(r.stomped).toBe(true);
    expect(r.hit).toBe(false);
    expect(r.player.vy).toBe(-STOMP_BOUNCE_SPEED);
    expect(r.player.onGround).toBe(false);
    expect(r.player.y + H).toBe(e.y);
  });

  it('上昇中の接触は踏みつけではなく、敵は倒れない', () => {
    const e = enemy();
    const { prev, cur } = falling(e, -10, -500); // 重なったまま上昇中
    const r = resolveEnemyContact(prev, cur, [e], false);
    expect(r.enemies[0]!.alive).toBe(true);
    expect(r.stomped).toBe(false);
  });

  it('被弾後の無敵中でも、踏みつければ倒せる', () => {
    const e = enemy();
    const { prev, cur } = falling(e);
    const r = resolveEnemyContact(prev, cur, [e], true);
    expect(r.enemies[0]!.alive).toBe(false);
    expect(r.hit).toBe(false);
  });

  it('空中の敵(ふわふわ)も、上から踏めば倒せる', () => {
    const e = enemy('floater');
    const { prev, cur } = falling(e);
    expect(resolveEnemyContact(prev, cur, [e], false).enemies[0]!.alive).toBe(false);
  });

  it('下辺が上辺の許容量より深く重なっている(側面扱い)と、踏みつけにならない', () => {
    const e = enemy();
    const prev: Player = { x: e.x, y: e.y - H + 25, vx: 0, vy: 300, onGround: false };
    const r = resolveEnemyContact(prev, { ...prev, y: prev.y + 5 }, [e], false);
    expect(r.stomped).toBe(false);
    expect(r.enemies[0]!.alive).toBe(true);
  });
});

describe('倒された敵・隠れている敵', () => {
  it('倒された敵とは、重なっても被弾も跳ね返りも起きない', () => {
    const e = { ...enemy(), alive: false };
    const { prev, cur } = side(e);
    const r = resolveEnemyContact(prev, cur, [e], false);
    expect(r.hit).toBe(false);
    expect(r.stomped).toBe(false);
    expect(r.player).toEqual(cur);
  });

  it('隠れている敵とは接触せず、踏みつけても倒れない', () => {
    const e = { ...enemy('hider'), hidden: true, phase: 'hidden' as const };
    const { prev, cur } = side(e);
    expect(resolveEnemyContact(prev, cur, [e], false).hit).toBe(false);
    const f = falling(e);
    const r = resolveEnemyContact(f.prev, f.cur, [e], false);
    expect(r.enemies[0]!.alive).toBe(true);
    expect(r.stomped).toBe(false);
  });

  it('重ならない敵とは、何も起きない', () => {
    const e = enemy('plodder', 3000);
    const { prev, cur } = side(enemy());
    const r = resolveEnemyContact(prev, cur, [e], false);
    expect(r.hit).toBe(false);
    expect(r.enemies[0]).toBe(e);
  });
});

describe('踏みつけ以外の接触による被弾', () => {
  it('横から接触すると被弾し、小さく上へ跳ね上がるが、押し戻されない', () => {
    const e = enemy();
    const { prev, cur } = side(e);
    const r = resolveEnemyContact(prev, cur, [e], false);
    expect(r.hit).toBe(true);
    expect(r.player.vy).toBe(-HIT_BOUNCE_SPEED);
    expect(r.player.onGround).toBe(false);
    expect(r.player.x).toBe(cur.x); // 押し戻さない
    expect(r.enemies[0]!.alive).toBe(true);
  });

  it('無敵中は被弾せず、プレイヤーはそのまま通り抜ける(状態が変わらない)', () => {
    const e = enemy();
    const { prev, cur } = side(e);
    const r = resolveEnemyContact(prev, cur, [e], true);
    expect(r.hit).toBe(false);
    expect(r.player).toEqual(cur);
  });

  it('同じ更新で、1 体を踏みつけ、別の 1 体に横から触れても、被弾しない(踏みつけを優先)', () => {
    const a = enemy('plodder', 1000);
    const f = falling(a);
    // 別の敵を、プレイヤーの横に重ねて置く
    const b = enemy('scurrier', f.cur.x + W - 10);
    const r = resolveEnemyContact(f.prev, f.cur, [a, b], false);
    expect(r.stomped).toBe(true);
    expect(r.hit).toBe(false);
    expect(r.enemies[0]!.alive).toBe(false);
  });

  it('複数の敵に同時に触れても、被弾は 1 回だけ(hit は真偽値)', () => {
    const a = enemy('plodder', 1000);
    const b = enemy('scurrier', 1010);
    const p: Player = { x: 1000, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };
    const r = resolveEnemyContact(p, p, [a, b], false);
    expect(r.hit).toBe(true);
    expect(r.player.vy).toBe(-HIT_BOUNCE_SPEED);
  });
});

describe('enemyRect', () => {
  it('敵の位置と 40×40 の大きさを返す', () => {
    const e = enemy();
    expect(enemyRect(e)).toEqual({ x: e.x, y: e.y, w: 40, h: 40 });
  });
});
