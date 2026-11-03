import { describe, expect, it } from 'vitest';
import { BOSS_HEIGHT, BOSS_INVULN_TIME, BOSS_MAX_HP, BOSS_SPEED, FIXED_DT, GROUND_Y } from './config';
import { createBoss, damageBoss, stepBoss, type Boss } from './boss';

function run(boss: Boss, steps: number): Boss {
  let b = boss;
  for (let i = 0; i < steps; i++) b = stepBoss(b, FIXED_DT);
  return b;
}

describe('createBoss', () => {
  it('体力 3 で地面の上に生存状態で配置される', () => {
    const b = createBoss();
    expect(b.hp).toBe(BOSS_MAX_HP);
    expect(b.hp).toBe(3);
    expect(b.alive).toBe(true);
    expect(b.y + BOSS_HEIGHT).toBe(GROUND_Y);
  });
});

describe('往復移動', () => {
  it('更新ごとに x が一定量ずつ変化する', () => {
    let b = createBoss(1800, 1600, 2000);
    for (let i = 0; i < 5; i++) {
      const next = stepBoss(b, FIXED_DT);
      expect(next.x - b.x).toBeCloseTo(BOSS_SPEED * FIXED_DT, 9);
      b = next;
    }
  });

  it('右端に達すると左向きに反転し、範囲の外へ出ない', () => {
    let b = createBoss(1990, 1600, 2000);
    b = run(b, 30);
    expect(b.x).toBeLessThanOrEqual(2000);
    expect(b.vx).toBeLessThan(0);
  });

  it('左端に達すると右向きに反転する', () => {
    const b0 = { ...createBoss(1610, 1600, 2000), vx: -BOSS_SPEED };
    const b = run(b0, 30);
    expect(b.x).toBeGreaterThanOrEqual(1600);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('長時間動かしても常に往復範囲内にある', () => {
    let b = createBoss(1800, 1600, 2000);
    for (let i = 0; i < 3000; i++) {
      b = stepBoss(b, FIXED_DT);
      expect(b.x).toBeGreaterThanOrEqual(1600);
      expect(b.x).toBeLessThanOrEqual(2000);
    }
  });

  it('撃破済みのボスは動かない', () => {
    const dead: Boss = { ...createBoss(), alive: false, hp: 0 };
    expect(stepBoss(dead, FIXED_DT)).toBe(dead);
  });
});

describe('ダメージと無敵時間', () => {
  it('ダメージで体力が 1 減り、無敵時間が設定される', () => {
    const b = damageBoss(createBoss());
    expect(b.hp).toBe(BOSS_MAX_HP - 1);
    expect(b.invuln).toBe(BOSS_INVULN_TIME);
    expect(b.alive).toBe(true);
  });

  it('無敵時間中は追加でダメージを受けない', () => {
    const hit = damageBoss(createBoss());
    const again = damageBoss(stepBoss(hit, FIXED_DT));
    expect(again.hp).toBe(hit.hp);
  });

  it('無敵時間は更新で減り、終了後は再びダメージを受ける', () => {
    let b = damageBoss(createBoss());
    b = run(b, Math.ceil(BOSS_INVULN_TIME / FIXED_DT) + 1);
    expect(b.invuln).toBe(0);
    expect(damageBoss(b).hp).toBe(BOSS_MAX_HP - 2);
  });

  it('3 回のダメージ(無敵をはさむ)で撃破される', () => {
    let b = createBoss();
    for (let i = 0; i < 3; i++) {
      b = damageBoss(b);
      b = run(b, Math.ceil(BOSS_INVULN_TIME / FIXED_DT) + 1);
    }
    expect(b.hp).toBe(0);
    expect(b.alive).toBe(false);
  });

  it('撃破済みのボスにはダメージが入らない', () => {
    const dead: Boss = { ...createBoss(), alive: false, hp: 0 };
    expect(damageBoss(dead).hp).toBe(0);
  });
});
