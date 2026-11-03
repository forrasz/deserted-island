import { describe, expect, it } from 'vitest';
import {
  ARC_LIFE,
  FIXED_DT,
  GROUND_Y,
  HIT_BOUNCE_SPEED,
  PLAYER_HEIGHT,
  PROJECTILE_SIZE,
  SHOT_LIFE,
  WAVE_HEIGHT,
  WAVE_LIFE,
} from './config';
import type { Player } from './player';
import {
  createArc,
  createShot,
  createWave,
  resolveProjectileContact,
  stepProjectile,
  type Projectile,
} from './projectile';

const WORLD = { width: 25800, groundY: GROUND_Y };
const H = PLAYER_HEIGHT;

function run(p: Projectile, steps: number): Projectile {
  let cur = p;
  for (let i = 0; i < steps; i++) cur = stepProjectile(cur, WORLD, FIXED_DT);
  return cur;
}

describe('直進弾', () => {
  it('毎秒 260 で水平に進み、高さは変わらない', () => {
    const s = createShot(1000, GROUND_Y - 48, 260);
    const after = run(s, 60);
    expect(after.x - s.x).toBeCloseTo(260, 4);
    expect(after.y).toBe(s.y);
    expect(after.alive).toBe(true);
  });

  it('左向き(負の速さ)にも進む', () => {
    const s = createShot(1000, GROUND_Y - 48, -260);
    expect(run(s, 60).x).toBeLessThan(s.x);
  });

  it('大きさは 24×24、地面から指定した高さ(上端 y)に出る', () => {
    const s = createShot(1000, GROUND_Y - 48, 260);
    expect([s.w, s.h]).toEqual([PROJECTILE_SIZE, PROJECTILE_SIZE]);
    expect(s.y).toBe(GROUND_Y - 48);
  });
});

describe('放物線の弾', () => {
  it('上へ昇ってから落ち、水平の位置は一定の速さで進み続ける', () => {
    const a = createArc(1000, GROUND_Y - 60, 300, -650);
    let cur = a;
    let minY = Infinity;
    let rose = false;
    let fell = false;
    for (let i = 0; i < 40; i++) {
      const next = stepProjectile(cur, WORLD, FIXED_DT);
      if (next.y < cur.y) rose = true;
      if (next.y > cur.y) fell = true;
      minY = Math.min(minY, next.y);
      expect(next.x - cur.x).toBeCloseTo(300 * FIXED_DT, 6);
      cur = next;
      if (!cur.alive) break;
    }
    expect(rose).toBe(true);
    expect(fell).toBe(true);
    expect(minY).toBeLessThan(a.y);
  });

  it('地面の高さに達すると消える', () => {
    let cur = createArc(1000, GROUND_Y - 60, 300, -650);
    let alive = true;
    for (let i = 0; i < 120 && alive; i++) {
      cur = stepProjectile(cur, WORLD, FIXED_DT);
      alive = cur.alive;
    }
    expect(alive).toBe(false);
    expect(cur.y + cur.h).toBeGreaterThanOrEqual(GROUND_Y - 1);
  });
});

describe('衝撃波', () => {
  it('地面の上を毎秒 280 で水平に進み、地面から離れない', () => {
    const w = createWave(1000, GROUND_Y, 280);
    const after = run(w, 60);
    expect(after.x - w.x).toBeCloseTo(280, 4);
    expect(after.y + after.h).toBe(GROUND_Y);
    expect(w.y).toBe(GROUND_Y - WAVE_HEIGHT);
  });

  it('毎秒 360 の衝撃波は、毎秒 280 の衝撃波より速い', () => {
    const slow = run(createWave(1000, GROUND_Y, 280), 30);
    const fast = run(createWave(1000, GROUND_Y, 360), 30);
    expect(fast.x - 1000).toBeGreaterThan(slow.x - 1000);
    expect(run(createWave(1000, GROUND_Y, 360), 60).x - 1000).toBeCloseTo(360, 4);
  });

  it('左向きにも走る', () => {
    expect(run(createWave(1000, GROUND_Y, -280), 30).x).toBeLessThan(1000);
  });
});

describe('弾の消滅', () => {
  it('直進弾は、出現から 3 秒の寿命で消える', () => {
    const s = createShot(1000, GROUND_Y - 48, 10);
    expect(run(s, Math.round(SHOT_LIFE / FIXED_DT) - 3).alive).toBe(true);
    expect(run(s, Math.round(SHOT_LIFE / FIXED_DT) + 3).alive).toBe(false);
  });

  it('衝撃波は、出現から 2 秒の寿命で消える', () => {
    const w = createWave(1000, GROUND_Y, 10);
    expect(run(w, Math.round(WAVE_LIFE / FIXED_DT) - 3).alive).toBe(true);
    expect(run(w, Math.round(WAVE_LIFE / FIXED_DT) + 3).alive).toBe(false);
    expect(WAVE_LIFE).toBe(2);
    expect(ARC_LIFE).toBeGreaterThan(0);
  });

  it('ステージの左端・右端を越えたら消える', () => {
    const left = run(createShot(20, GROUND_Y - 48, -500), 30);
    expect(left.alive).toBe(false);
    const right = run(createShot(WORLD.width - 20, GROUND_Y - 48, 500), 30);
    expect(right.alive).toBe(false);
  });

  it('消えた弾は、更新しても変化しない', () => {
    const dead = { ...createShot(1000, GROUND_Y - 48, 260), alive: false };
    expect(stepProjectile(dead, WORLD, FIXED_DT)).toBe(dead);
  });
});

describe('弾との接触', () => {
  const standing = (x: number): Player => ({ x, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true });

  it('弾に当たると被弾し、小さく跳ね上がり、その弾は消える', () => {
    const s = createShot(1000, GROUND_Y - 48, 0); // 立っているプレイヤーに当たる高さ
    const r = resolveProjectileContact(standing(1000), [s], false);
    expect(r.hit).toBe(true);
    expect(r.player.vy).toBe(-HIT_BOUNCE_SPEED);
    expect(r.player.onGround).toBe(false);
    expect(r.projectiles[0]!.alive).toBe(false);
  });

  it('無敵中は被弾せず、弾は消えずに進み続ける', () => {
    const s = createShot(1000, GROUND_Y - 48, 260);
    const r = resolveProjectileContact(standing(1000), [s], true);
    expect(r.hit).toBe(false);
    expect(r.player).toEqual(standing(1000));
    expect(r.projectiles[0]!.alive).toBe(true);
  });

  it('重ならない弾とは、何も起きない', () => {
    const s = createShot(2000, GROUND_Y - 48, 0);
    const r = resolveProjectileContact(standing(1000), [s], false);
    expect(r.hit).toBe(false);
    expect(r.projectiles[0]).toBe(s);
  });

  it('消えた弾とは接触しない', () => {
    const dead = { ...createShot(1000, GROUND_Y - 48, 0), alive: false };
    expect(resolveProjectileContact(standing(1000), [dead], false).hit).toBe(false);
  });

  it('踏んでも倒せない: 落下しながら上から重なっても、通常の接触として被弾する', () => {
    const s = createShot(1000, GROUND_Y - 100, 0);
    const falling: Player = { x: 1000, y: s.y - H + 10, vx: 0, vy: 300, onGround: false };
    const r = resolveProjectileContact(falling, [s], false);
    expect(r.hit).toBe(true);
    expect(r.projectiles[0]!.alive).toBe(false);
  });

  it('ジャンプで衝撃波をよけられる(衝撃波の上端より高い位置にいれば重ならない)', () => {
    const w = createWave(1000, GROUND_Y, 280);
    const airborne: Player = { x: 1000, y: GROUND_Y - H - 40, vx: 0, vy: 0, onGround: false };
    expect(resolveProjectileContact(airborne, [w], false).hit).toBe(false);
    expect(resolveProjectileContact(standing(1000), [w], false).hit).toBe(true);
  });

  it('複数の弾に同時に当たっても、被弾は 1 回(hit は真偽値)で、当たった弾はすべて消える', () => {
    const a = createShot(1000, GROUND_Y - 48, 0);
    const b = createShot(1010, GROUND_Y - 40, 0);
    const r = resolveProjectileContact(standing(1000), [a, b], false);
    expect(r.hit).toBe(true);
    expect(r.projectiles.every((p) => !p.alive)).toBe(true);
  });
});
