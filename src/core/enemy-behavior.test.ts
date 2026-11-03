import { describe, expect, it } from 'vitest';
import {
  CHARGER_DASH_SPEED,
  CHARGER_WALK_SPEED,
  CHASER_PATROL_SPEED,
  CHASER_SPEED,
  ENEMY_SIZE,
  FIXED_DT,
  FLOATER_AMPLITUDE,
  FLOATER_HEIGHT,
  GROUND_Y,
  HIDER_HIDDEN_TIME,
  HIDER_SPEED,
  HIDER_VISIBLE_TIME,
  SLEEPER_DASH_SPEED,
  SLEEPER_DASH_TIME,
  SLEEPER_REST_TIME,
  SWOOPER_DIVE_BOTTOM,
  SWOOPER_DIVE_SPEED,
  SWOOPER_HEIGHT,
} from './config';
import { createEnemy, stepEnemy, type Enemy, type EnemyCtx } from './enemy';

const FAR: EnemyCtx = { playerX: -100000, playerY: 0 };
const ticks = (seconds: number) => Math.round(seconds / FIXED_DT);

/** 敵の中心から dx だけ右にプレイヤーがいる状況。 */
function playerAt(e: Enemy, dx: number): EnemyCtx {
  return { playerX: e.x + ENEMY_SIZE / 2 + dx, playerY: GROUND_Y - 28 };
}

function run(e: Enemy, steps: number, ctx: EnemyCtx | ((cur: Enemy) => EnemyCtx) = FAR): Enemy {
  let cur = e;
  for (let i = 0; i < steps; i++) cur = stepEnemy(cur, typeof ctx === 'function' ? ctx(cur) : ctx, FIXED_DT);
  return cur;
}

describe('ねぼすけ(近づくと突進する)', () => {
  const make = (left = 0, right = 5000) => createEnemy('sleeper', 2000, left, right);

  it('プレイヤーが遠い(水平 400)間は、動かない', () => {
    const e = make();
    const after = run(e, 200, (cur) => playerAt(cur, 400));
    expect(after.x).toBe(e.x);
    expect(after.phase).toBe('idle');
  });

  it('近づく(水平 200)と、プレイヤーの方向へ毎秒 220 で突進し始める', () => {
    const e = make();
    const s = stepEnemy(e, playerAt(e, 200), FIXED_DT);
    expect(s.phase).toBe('dash');
    expect(s.x - e.x).toBeCloseTo(SLEEPER_DASH_SPEED * FIXED_DT, 6);
    const left = stepEnemy(e, playerAt(e, -200), FIXED_DT);
    expect(left.x).toBeLessThan(e.x);
  });

  it('突進は 0.8 秒続き、その距離はおよそ 176', () => {
    const e = make();
    const ctx = (cur: Enemy) => playerAt(cur, 1000 > 0 ? 200 : 0);
    let cur = e;
    for (let i = 0; i < ticks(SLEEPER_DASH_TIME) - 1; i++) cur = stepEnemy(cur, ctx(e), FIXED_DT);
    expect(cur.x - e.x).toBeGreaterThan(160);
    expect(cur.x - e.x).toBeLessThan(180);
  });

  it('突進のあとは 2 秒の間、プレイヤーが近くにいても動かず、その後に再び突進できる', () => {
    let e = make();
    const near = (cur: Enemy) => playerAt(cur, 150);
    // 突進が終わって rest になるまで
    for (let i = 0; i < 200 && e.phase !== 'rest'; i++) e = stepEnemy(e, near(e), FIXED_DT);
    expect(e.phase).toBe('rest');
    const restX = e.x;
    for (let i = 0; i < ticks(SLEEPER_REST_TIME) - 3; i++) {
      e = stepEnemy(e, near(e), FIXED_DT);
      expect(e.x).toBe(restX);
    }
    // 2 秒を超えたら、再び突進する
    let dashed = false;
    for (let i = 0; i < 10; i++) {
      e = stepEnemy(e, near(e), FIXED_DT);
      if (e.phase === 'dash') dashed = true;
    }
    expect(dashed).toBe(true);
  });

  it('往復範囲の端の近くで突進しても、範囲の外へは出ない', () => {
    const e = createEnemy('sleeper', 2090, 2000, 2100);
    const after = run(e, 100, (cur) => playerAt(cur, 200));
    expect(after.x).toBeLessThanOrEqual(2100);
    expect(after.x).toBeGreaterThanOrEqual(2000);
  });
});

describe('つきまとい(近づくと追いかける)', () => {
  const make = () => createEnemy('chaser', 2000, 1000, 3000);

  it('プレイヤーが近い(水平 250)と、1 秒でおよそ 110 追いかける', () => {
    const e = make();
    const after = run(e, 60, (cur) => playerAt(cur, 250));
    expect(after.x - e.x).toBeCloseTo(CHASER_SPEED, 4);
  });

  it('反対側にいても、プレイヤーの方向へ追いかける', () => {
    const e = make();
    const after = run(e, 30, (cur) => playerAt(cur, -250));
    expect(after.x).toBeLessThan(e.x);
  });

  it('プレイヤーが遠い(水平 500)と、毎秒 50 で往復する', () => {
    const e = make();
    const after = run(e, 60, playerAt(e, 500));
    expect(Math.abs(after.x - e.x)).toBeCloseTo(CHASER_PATROL_SPEED, 4);
  });

  it('プレイヤーが往復範囲の外の遠くにいても、範囲の端で止まり、外へは出ない', () => {
    const e = createEnemy('chaser', 1950, 1000, 2000);
    const after = run(e, 200, { playerX: 2200, playerY: GROUND_Y - 28 }); // 敵の中心から約 250 先
    expect(after.x).toBe(2000);
  });
});

describe('とっしん(周期的に突進する)', () => {
  const make = () => createEnemy('charger', 1000, 0, 5000);

  it('最初の 2 秒間は、毎秒 40 でゆっくり歩く', () => {
    let e = make();
    for (let i = 0; i < ticks(2) - 3; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      expect(Math.abs(e.vx)).toBe(CHARGER_WALK_SPEED);
    }
  });

  it('2 秒歩いたあと、向いている方向へ毎秒 320 で突進し、0.5 秒後に歩行へ戻る', () => {
    let e = make();
    let dashTicks = 0;
    let sawDash = false;
    for (let i = 0; i < ticks(3.5); i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      if (Math.abs(e.vx) === CHARGER_DASH_SPEED) {
        sawDash = true;
        dashTicks++;
      }
    }
    expect(sawDash).toBe(true);
    expect(dashTicks).toBeGreaterThanOrEqual(ticks(0.5) - 2);
    expect(dashTicks).toBeLessThanOrEqual(ticks(0.5) + 2);
    expect(Math.abs(e.vx)).toBe(CHARGER_WALK_SPEED); // 3.5 秒時点では歩行に戻っている
  });

  it('突進の距離は、歩く距離よりずっと長い', () => {
    let e = make();
    let walkDist = 0;
    let dashDist = 0;
    for (let i = 0; i < ticks(2.6); i++) {
      const next = stepEnemy(e, FAR, FIXED_DT);
      const d = Math.abs(next.x - e.x);
      if (e.phase === 'dash') dashDist += d;
      else walkDist += d;
      e = next;
    }
    expect(dashDist).toBeGreaterThan(walkDist / 3);
    expect(dashDist).toBeGreaterThan(100);
  });

  it('突進して往復範囲の端に達すると、向きを反転し、範囲の外へは出ない', () => {
    let e: Enemy = { ...createEnemy('charger', 1000, 900, 1100), phase: 'dash', timer: 0 };
    e = run(e, 30);
    expect(e.x).toBeGreaterThanOrEqual(900);
    expect(e.x).toBeLessThanOrEqual(1100);
    expect(e.dir).toBe(-1);
  });
});

describe('ふわふわ(空中を漂う)', () => {
  it('地面には着かず、地面から 100 以上 180 以下の高さの範囲に留まる', () => {
    let e = createEnemy('floater', 1000, 500, 2000);
    for (let i = 0; i < 600; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      const height = GROUND_Y - (e.y + ENEMY_SIZE);
      expect(height).toBeGreaterThanOrEqual(FLOATER_HEIGHT - FLOATER_AMPLITUDE - 1);
      expect(height).toBeLessThanOrEqual(FLOATER_HEIGHT + FLOATER_AMPLITUDE + 1);
      expect(height).toBeGreaterThanOrEqual(100);
      expect(height).toBeLessThanOrEqual(180);
    }
  });

  it('周期 2 秒の間に、上下の差がおよそ 80 になる', () => {
    let e = createEnemy('floater', 1000, 500, 5000);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < ticks(2); i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      min = Math.min(min, e.y);
      max = Math.max(max, e.y);
    }
    expect(max - min).toBeGreaterThan(76);
    expect(max - min).toBeLessThan(82);
  });

  it('毎秒 70 で水平に往復し、端で反転する', () => {
    const e = createEnemy('floater', 1000, 500, 2000);
    expect(run(e, 60).x - e.x).toBeCloseTo(70, 4);
    const edge = run(createEnemy('floater', 1990, 1500, 2000), 40);
    expect(edge.dir).toBe(-1);
    expect(edge.x).toBeLessThanOrEqual(2000);
  });
});

describe('きゅうこうか(真下に来ると急降下する)', () => {
  const make = () => createEnemy('swooper', 2000, 1000, 3000);
  const heightOf = (e: Enemy) => GROUND_Y - (e.y + ENEMY_SIZE);

  it('プレイヤーが遠い(水平 300)間は、地面から 220 の高さを往復し、降下しない', () => {
    let e = make();
    for (let i = 0; i < 300; i++) {
      e = stepEnemy(e, playerAt(e, 300), FIXED_DT);
      expect(heightOf(e)).toBe(SWOOPER_HEIGHT);
    }
    expect(e.phase).toBe('patrol');
  });

  it('真下(水平 40)にプレイヤーが来ると、下向きの速度 600 で降下し始める', () => {
    const e = make();
    const s = stepEnemy(e, playerAt(e, 40), FIXED_DT);
    expect(s.phase).toBe('dive');
    expect(s.vy).toBe(SWOOPER_DIVE_SPEED);
    expect(s.y).toBeGreaterThan(e.y);
  });

  it('地面から 20 の高さまで降り、上昇して元の高さに戻り、再び往復する', () => {
    let e = make();
    e = stepEnemy(e, playerAt(e, 40), FIXED_DT); // 降下を始める
    let minHeight = Infinity;
    let rose = false;
    let back = false;
    for (let i = 0; i < 400; i++) {
      e = stepEnemy(e, FAR, FIXED_DT); // 以後、プレイヤーは遠くへ
      minHeight = Math.min(minHeight, heightOf(e));
      if (e.phase === 'rise') rose = true;
      if (rose && e.phase === 'patrol') back = true;
    }
    expect(minHeight).toBeCloseTo(SWOOPER_DIVE_BOTTOM, 5);
    expect(rose).toBe(true);
    expect(back).toBe(true);
    expect(heightOf(e)).toBe(SWOOPER_HEIGHT);
  });
});

describe('かくれんぼ(隠れて消える)', () => {
  const make = () => createEnemy('hider', 1000, 500, 3000);

  it('見えている間は、毎秒 60 で往復する', () => {
    const e = make();
    expect(e.hidden).toBe(false);
    const s = stepEnemy(e, FAR, FIXED_DT);
    expect(s.x - e.x).toBeCloseTo(HIDER_SPEED * FIXED_DT, 6);
    expect(s.hidden).toBe(false);
  });

  it('2 秒見えたあと、隠れて静止する', () => {
    let e = make();
    for (let i = 0; i < ticks(HIDER_VISIBLE_TIME) + 2; i++) e = stepEnemy(e, FAR, FIXED_DT);
    expect(e.hidden).toBe(true);
    expect(e.phase).toBe('hidden');
    const x = e.x;
    e = stepEnemy(e, FAR, FIXED_DT);
    expect(e.x).toBe(x);
    expect(e.vx).toBe(0);
  });

  it('隠れている間は 1.5 秒続き、そのあと再び現れて往復する', () => {
    let e = make();
    let hiddenTicks = 0;
    let reappeared = false;
    for (let i = 0; i < ticks(HIDER_VISIBLE_TIME + HIDER_HIDDEN_TIME) + 10; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      if (e.hidden) hiddenTicks++;
      if (hiddenTicks > 0 && !e.hidden) reappeared = true;
    }
    expect(hiddenTicks).toBeGreaterThanOrEqual(ticks(HIDER_HIDDEN_TIME) - 2);
    expect(hiddenTicks).toBeLessThanOrEqual(ticks(HIDER_HIDDEN_TIME) + 2);
    expect(reappeared).toBe(true);
    expect(e.phase).toBe('visible');
  });

  it('周期を繰り返す(見える → 隠れる → 見える → 隠れる)', () => {
    let e = make();
    const transitions: boolean[] = [];
    let prev = e.hidden;
    for (let i = 0; i < ticks(2 * (HIDER_VISIBLE_TIME + HIDER_HIDDEN_TIME)) + 10; i++) {
      e = stepEnemy(e, FAR, FIXED_DT);
      if (e.hidden !== prev) transitions.push(e.hidden);
      prev = e.hidden;
    }
    expect(transitions).toEqual([true, false, true, false]); // 2 周期 = 隠れる・現れる を 2 回
  });
});
