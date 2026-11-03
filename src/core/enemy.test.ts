import { describe, expect, it } from 'vitest';
import {
  BOUNCER_BOUNCE_SPEED,
  ENEMY_HP,
  ENEMY_SIZE,
  FIXED_DT,
  FLOATER_HEIGHT,
  GROUND_Y,
  HOPPER_INTERVAL,
  PLODDER_SPEED,
  SCURRIER_SPEED,
  SWOOPER_HEIGHT,
} from './config';
import { ENEMY_DEFS, ENEMY_KINDS, type EnemyKind } from './enemy-defs';
import { createEnemy, enemyRect, stepEnemy, type Enemy, type EnemyCtx } from './enemy';

/** プレイヤーが十分遠くにいる(敵の行動に影響しない)状況。 */
const FAR: EnemyCtx = { playerX: -100000, playerY: 0 };

function run(e: Enemy, steps: number, ctx: EnemyCtx = FAR): Enemy {
  let cur = e;
  for (let i = 0; i < steps; i++) cur = stepEnemy(cur, ctx, FIXED_DT);
  return cur;
}

describe('敵の定義(ENEMY_DEFS)', () => {
  it('10 種類あり、識別子・名前・色がすべて異なる', () => {
    expect(ENEMY_KINDS).toHaveLength(10);
    expect(new Set(ENEMY_KINDS).size).toBe(10);
    expect(Object.keys(ENEMY_DEFS).sort()).toEqual([...ENEMY_KINDS].sort());
    const names = ENEMY_KINDS.map((k) => ENEMY_DEFS[k].name);
    const colors = ENEMY_KINDS.map((k) => ENEMY_DEFS[k].color);
    expect(new Set(names).size).toBe(10);
    expect(new Set(colors).size).toBe(10);
    for (const k of ENEMY_KINDS) {
      expect(ENEMY_DEFS[k].kind).toBe(k);
      expect(ENEMY_DEFS[k].name.length).toBeGreaterThan(0);
      expect(ENEMY_DEFS[k].color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('名前は仕様どおり(のろのろ〜とっしん)', () => {
    expect(ENEMY_KINDS.map((k) => ENEMY_DEFS[k].name)).toEqual([
      'のろのろ',
      'ちょこまか',
      'ぴょんぴょん',
      'ねぼすけ',
      'つきまとい',
      'ふわふわ',
      'きゅうこうか',
      'はねっこ',
      'かくれんぼ',
      'とっしん',
    ]);
  });
});

describe('createEnemy', () => {
  it('大きさは 40×40、体力は 1、生存状態で作られる', () => {
    expect(ENEMY_SIZE).toBe(40);
    expect(ENEMY_HP).toBe(1);
    for (const kind of ENEMY_KINDS) {
      const e = createEnemy(kind, 1000, 800, 1400);
      const r = enemyRect(e);
      expect(r.w).toBe(40);
      expect(r.h).toBe(40);
      expect(e.alive).toBe(true);
      expect(e.hidden).toBe(false);
    }
  });

  it('地面の敵は地面の上に、空中の敵は地面より高い位置に作られる', () => {
    const ground: EnemyKind[] = ['plodder', 'scurrier', 'hopper', 'sleeper', 'chaser', 'bouncer', 'hider', 'charger'];
    for (const kind of ground) {
      expect(createEnemy(kind, 1000, 800, 1400).y + ENEMY_SIZE).toBe(GROUND_Y);
    }
    expect(GROUND_Y - (createEnemy('floater', 1000, 800, 1400).y + ENEMY_SIZE)).toBe(FLOATER_HEIGHT);
    expect(GROUND_Y - (createEnemy('swooper', 1000, 800, 1400).y + ENEMY_SIZE)).toBe(SWOOPER_HEIGHT);
  });

  it('倒された敵は、更新しても変化しない', () => {
    const dead = { ...createEnemy('scurrier', 1000, 800, 1400), alive: false };
    expect(stepEnemy(dead, FAR, FIXED_DT)).toBe(dead);
  });
});

describe('のろのろ・ちょこまか(往復)', () => {
  it('のろのろは、1 秒でおよそ 50 移動する', () => {
    const e = createEnemy('plodder', 1000, 500, 2000);
    expect(run(e, 60).x - e.x).toBeCloseTo(PLODDER_SPEED, 5);
  });

  it('ちょこまかは、1 秒でおよそ 150 移動し、のろのろより速い', () => {
    const e = createEnemy('scurrier', 1000, 500, 2000);
    const dx = run(e, 60).x - e.x;
    expect(dx).toBeCloseTo(SCURRIER_SPEED, 5);
    expect(dx).toBeGreaterThan(run(createEnemy('plodder', 1000, 500, 2000), 60).x - 1000);
  });

  it('右端に達すると左向きになり、範囲の外へ出ない', () => {
    let e = createEnemy('plodder', 1990, 1500, 2000);
    e = run(e, 30);
    expect(e.x).toBeLessThanOrEqual(2000);
    expect(e.dir).toBe(-1);
    expect(e.vx).toBeLessThan(0);
  });

  it('左端に達すると右向きになる', () => {
    let e: Enemy = { ...createEnemy('scurrier', 1510, 1500, 2000), dir: -1 };
    e = run(e, 30);
    expect(e.x).toBeGreaterThanOrEqual(1500);
    expect(e.dir).toBe(1);
  });

  it('長く動かしても、常に往復範囲の中にある', () => {
    for (const kind of ['plodder', 'scurrier'] as const) {
      let e = createEnemy(kind, 1000, 800, 1300);
      for (let i = 0; i < 3000; i++) {
        e = stepEnemy(e, FAR, FIXED_DT);
        expect(e.x).toBeGreaterThanOrEqual(800);
        expect(e.x).toBeLessThanOrEqual(1300);
      }
    }
  });
});

describe('ぴょんぴょん(跳ねながら往復)', () => {
  it('地面にいる間は、1.2 秒が経つまでジャンプしない', () => {
    let e = createEnemy('hopper', 1000, 500, 2000);
    const steps = Math.floor(HOPPER_INTERVAL / FIXED_DT) - 2; // 1.2 秒に届く少し前
    for (let i = 0; i < steps; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      expect(e.y).toBe(e.baseY);
    }
  });

  it('1.2 秒が経つと、上向きにジャンプして地面から離れる', () => {
    let e = createEnemy('hopper', 1000, 500, 2000);
    let jumpedAt = -1;
    for (let i = 0; i < 100 && jumpedAt < 0; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      if (e.y < e.baseY) jumpedAt = i + 1;
    }
    expect(jumpedAt).toBeGreaterThanOrEqual(70);
    expect(jumpedAt).toBeLessThanOrEqual(74);
    expect(e.vy).toBeLessThan(0);
  });

  it('ジャンプしたあと、地面の高さまで落ちて着地し、地面より下には沈まない', () => {
    let e = createEnemy('hopper', 1000, 500, 2000);
    let airborne = false;
    let landedAfter = false;
    for (let i = 0; i < 200; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      expect(e.y).toBeLessThanOrEqual(e.baseY);
      if (e.y < e.baseY) airborne = true;
      if (airborne && e.y === e.baseY) landedAfter = true;
    }
    expect(airborne).toBe(true);
    expect(landedAfter).toBe(true);
  });

  it('ジャンプ中も水平に動き、往復範囲の中に留まる', () => {
    let e = createEnemy('hopper', 1000, 900, 1100);
    let prevX = e.x;
    let movedWhileAirborne = false;
    for (let i = 0; i < 400; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      if (e.y < e.baseY && e.x !== prevX) movedWhileAirborne = true;
      prevX = e.x;
      expect(e.x).toBeGreaterThanOrEqual(900);
      expect(e.x).toBeLessThanOrEqual(1100);
    }
    expect(movedWhileAirborne).toBe(true);
  });
});

describe('はねっこ(常に弾み続ける)', () => {
  it('着地した更新で、上向きの速度 600 になる', () => {
    const e = stepEnemy(createEnemy('bouncer', 1000, 500, 2000), FAR, FIXED_DT);
    expect(e.vy).toBe(-BOUNCER_BOUNCE_SPEED);
    expect(e.y).toBe(e.baseY);
    const next = stepEnemy(e, FAR, FIXED_DT);
    expect(next.y).toBeLessThan(next.baseY);
  });

  it('5 秒間、地面に静止したままにならず、上下に動き続け、地面より下に沈まない', () => {
    let e = createEnemy('bouncer', 1000, 500, 3000);
    let up = 0;
    let down = 0;
    let minY = Infinity;
    for (let i = 0; i < 300; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      if (e.vy < 0) up++;
      if (e.vy > 0) down++;
      minY = Math.min(minY, e.y);
      expect(e.y).toBeLessThanOrEqual(e.baseY);
    }
    expect(up).toBeGreaterThan(100);
    expect(down).toBeGreaterThan(100);
    expect(e.baseY - minY).toBeGreaterThan(80); // 弾みの高さはおよそ 90
  });

  it('毎秒 60 で水平に移動し、範囲の端で反転する', () => {
    const e = createEnemy('bouncer', 1000, 500, 2000);
    expect(run(e, 60).x - e.x).toBeCloseTo(60, 5);
    const edge = run(createEnemy('bouncer', 1990, 1500, 2000), 40);
    expect(edge.x).toBeLessThanOrEqual(2000);
    expect(edge.dir).toBe(-1);
  });
});
