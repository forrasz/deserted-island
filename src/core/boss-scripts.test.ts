import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, createBoss, type Boss } from './boss';
import {
  BOSS_SCRIPTS,
  bossFlags,
  stepBossScript,
  type BossStep,
} from './boss-scripts';
import { FIXED_DT, GROUND_Y } from './config';
import { bossWith, ctxAt, run, ticks } from './boss-test-helpers';



describe('行動の流れ', () => {
  const SCRIPT: BossStep[] = [
    { a: 'patrol', time: 1.0, speed: 80 },
    { a: 'telegraph', time: 0.4 },
    { a: 'rest', time: 0.5 },
  ];

  it('行動が、順番(往復 → 予備動作 → 休み)に切り替わる', () => {
    const { steps } = run(bossWith(SCRIPT), ticks(1.9) + 5);
    // 各更新のあとの行動の番号が、0 → 1 → 2 の順に、増える方向でだけ変わる
    const order: number[] = [0];
    for (const s of steps) if (s !== order[order.length - 1]) order.push(s);
    expect(order.slice(0, 4)).toEqual([0, 1, 2, 0]);
  });

  it('各行動は、指定した時間だけ続く', () => {
    const { steps } = run(bossWith(SCRIPT), ticks(1.9) + 5);
    const firstChange = steps.findIndex((s) => s === 1) + 1; // 1 つ目の行動が終わるまでの更新数
    expect(Math.abs(firstChange - ticks(1.0))).toBeLessThanOrEqual(1);
    const secondChange = steps.findIndex((s) => s === 2) + 1;
    expect(Math.abs(secondChange - ticks(1.4))).toBeLessThanOrEqual(2);
  });

  it('最後の行動のあと、最初に戻り、2 周目は 1 周目と同じ時間で動く', () => {
    const { steps } = run(bossWith(SCRIPT), ticks(1.9) * 2 + 10);
    const changes: number[] = [];
    for (let i = 1; i < steps.length; i++) if (steps[i] !== steps[i - 1]) changes.push(i);
    // 1 周目の切り替え(0→1, 1→2, 2→0)と、2 周目の切り替え(0→1, 1→2, 2→0)の間隔が同じ
    const lap1 = [changes[1]! - changes[0]!, changes[2]! - changes[1]!];
    const lap2 = [changes[4]! - changes[3]!, changes[5]! - changes[4]!];
    expect(lap2[0]).toBe(lap1[0]);
    expect(lap2[1]).toBe(lap1[1]);
    expect(steps).toContain(0);
  });

  it('同じ条件では、同じ結果になる(乱数を使わない)', () => {
    const a = run(bossWith(SCRIPT), 500, ctxAt(1200));
    const b = run(bossWith(SCRIPT), 500, ctxAt(1200));
    expect(a.boss).toEqual(b.boss);
  });

  it('倒されたボスは、更新しても変化せず、弾も出さない', () => {
    const dead: Boss = { ...bossWith([{ a: 'wave', speed: 300 }]), alive: false, hp: 0 };
    const r = stepBossScript(dead, ctxAt(1000), FIXED_DT);
    expect(r.boss).toBe(dead);
    expect(r.spawns).toEqual([]);
  });

  it('往復の行動は、毎秒の速さで水平に動き、範囲の端で反転する', () => {
    const b = bossWith([{ a: 'patrol', time: 100, speed: 80 }], {}, 1390);
    const r = run(b, 60);
    expect(r.boss.x).toBeLessThanOrEqual(1400);
    expect(r.boss.dir).toBe(-1);
    const m = run(bossWith([{ a: 'patrol', time: 100, speed: 80 }], {}, 1100), 60);
    expect(m.boss.x - 1100).toBeCloseTo(80, 4);
  });

  it('すべての通常ボスは、長く動かしても、往復範囲の外へ出ず、地面より下へ沈まない', () => {
    for (const def of BOSS_DEFS.slice(0, 9)) {
      let b = createBoss(1000, 1000, 1000 + def.rangeWidth, GROUND_Y, def);
      for (let i = 0; i < 3000; i++) {
        // プレイヤーは、ボスの左右を行き来する
        const px = 1000 + def.rangeWidth / 2 + Math.sin(i / 90) * 600;
        b = stepBossScript(b, ctxAt(px), FIXED_DT).boss;
        expect(b.x).toBeGreaterThanOrEqual(1000 - 1e-6);
        expect(b.x).toBeLessThanOrEqual(1000 + def.rangeWidth + 1e-6);
        expect(b.y + b.h).toBeLessThanOrEqual(GROUND_Y + 1e-6);
      }
    }
  });

  it('BOSS_SCRIPTS は、通常ボス 9 体ぶんがある', () => {
    expect(Object.keys(BOSS_SCRIPTS)).toHaveLength(9);
    for (const def of BOSS_DEFS.slice(0, 9)) {
      expect(BOSS_SCRIPTS[def.kind as keyof typeof BOSS_SCRIPTS]).toBe(def.script);
    }
  });
});

describe('攻撃の予備動作', () => {
  const SCRIPT: BossStep[] = [
    { a: 'patrol', time: 0.2, speed: 80 },
    { a: 'telegraph', time: 0.4 },
    { a: 'shot', speed: 260, tops: [48] },
    { a: 'rest', time: 0.2 },
  ];

  it('予備動作の間は、位置を動かさず、予備動作中の状態になり、弾は出ない', () => {
    let b = bossWith(SCRIPT, {}, 1100);
    // 往復が終わって予備動作に入るまで
    for (let i = 0; i < ticks(0.2) + 1; i++) b = stepBossScript(b, ctxAt(2000), FIXED_DT).boss;
    expect(bossFlags(b).telegraph).toBe(true);
    const x = b.x;
    for (let i = 0; i < ticks(0.4) - 3; i++) {
      const r = stepBossScript(b, ctxAt(2000), FIXED_DT);
      b = r.boss;
      expect(b.x).toBe(x);
      expect(r.spawns).toEqual([]);
      expect(bossFlags(b).telegraph).toBe(true);
    }
  });

  it('予備動作の時間が経過すると、状態が終わり、次の更新で攻撃(弾)が始まる', () => {
    let b = bossWith(SCRIPT, {}, 1100);
    let spawned = 0;
    let telegraphEnded = false;
    let wasTelegraph = false;
    for (let i = 0; i < ticks(1.0); i++) {
      const r = stepBossScript(b, ctxAt(2000), FIXED_DT);
      b = r.boss;
      spawned += r.spawns.length;
      if (bossFlags(b).telegraph) wasTelegraph = true;
      else if (wasTelegraph) telegraphEnded = true;
    }
    expect(wasTelegraph).toBe(true);
    expect(telegraphEnded).toBe(true);
    expect(spawned).toBeGreaterThanOrEqual(1);
  });

  it('予備動作では、プレイヤーのいる側を向く', () => {
    const right = run(bossWith(SCRIPT, {}, 1100), ticks(0.2) + 5, ctxAt(5000)).boss;
    expect(right.aimDir).toBe(1);
    const left = run(bossWith(SCRIPT, {}, 1100), ticks(0.2) + 5, ctxAt(-5000)).boss;
    expect(left.aimDir).toBe(-1);
  });
});

describe('bossFlags(踏めない・触れない・予備動作)', () => {
  const flagsFor = (step: BossStep) => bossFlags(bossWith([step]));

  it('もぐっている(burrow)は、hidden', () => {
    expect(flagsFor({ a: 'burrow', time: 1 }).hidden).toBe(true);
    expect(flagsFor({ a: 'burrow', time: 1 }).stompImmune).toBe(false);
  });

  it('転がっている(roll)は、stompImmune', () => {
    const f = flagsFor({ a: 'roll', time: 1, speed: 260 });
    expect(f.stompImmune).toBe(true);
    expect(f.hidden).toBe(false);
  });

  it('予備動作(telegraph)は、telegraph', () => {
    expect(flagsFor({ a: 'telegraph', time: 1 }).telegraph).toBe(true);
  });

  it('往復・休みなど、通常の状態は、どれも立っていない(踏める)', () => {
    for (const step of [
      { a: 'patrol', time: 1 },
      { a: 'rest', time: 1 },
      { a: 'dizzy', time: 1 },
    ] as BossStep[]) {
      expect(flagsFor(step)).toEqual({ hidden: false, stompImmune: false, harmless: false, telegraph: false, crouch: false });
    }
  });

  it('変身中(transformT > 0)は、harmless で、予備動作の目印は立たない', () => {
    const b = { ...bossWith([{ a: 'telegraph', time: 1 }]), transformT: 1 };
    const f = bossFlags(b);
    expect(f.harmless).toBe(true);
    expect(f.telegraph).toBe(false);
  });
});
