import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, createBoss, type Boss } from './boss';
import { bossFlags, stepBossScript, type BossCtx } from './boss-scripts';
import { ctxAt, ticks } from './boss-test-helpers';
import { FIXED_DT, GROUND_Y, PLAYER_HEIGHT, PLAYER_WIDTH } from './config';
import type { Player } from './player';
import { resolveProjectileContact, type Projectile } from './projectile';

/** 通常ボス(番号 0〜8)を、x=1000 から、定義の往復範囲で作る。 */
function make(i: number, x = 1000): Boss {
  const def = BOSS_DEFS[i]!;
  return createBoss(x, 1000, 1000 + def.rangeWidth, GROUND_Y, def);
}

interface Trace {
  boss: Boss;
  spawns: Array<{ tick: number; p: Projectile }>;
  log: Boss[];
}

function trace(boss: Boss, n: number, ctx: BossCtx | ((b: Boss) => BossCtx) = ctxAt(-100000)): Trace {
  let cur = boss;
  const spawns: Trace['spawns'] = [];
  const log: Boss[] = [];
  for (let i = 0; i < n; i++) {
    const r = stepBossScript(cur, typeof ctx === 'function' ? ctx(cur) : ctx, FIXED_DT);
    cur = r.boss;
    for (const p of r.spawns) spawns.push({ tick: i, p });
    log.push(cur);
  }
  return { boss: cur, spawns, log };
}

const nameOf = (i: number) => BOSS_DEFS[i]!.name;

describe(`${'カクレモモジリ'}(往復してもぐる)`, () => {
  it('名前と流れ: 往復 2.5 秒 → もぐる 1.2 秒', () => {
    expect(nameOf(0)).toBe('カクレモモジリ');
    expect(make(0).script.map((s) => s.a)).toEqual(['patrol', 'burrow']);
  });

  it('往復する間は、毎秒 80 で水平に移動する', () => {
    const b = make(0);
    expect(trace(b, 60).boss.x - b.x).toBeCloseTo(80, 3);
  });

  it('2.5 秒往復したあと、もぐって動かず、踏めず触れない(hidden)', () => {
    const t = trace(make(0), ticks(2.5) + 3);
    expect(bossFlags(t.boss).hidden).toBe(true);
    const x = t.boss.x;
    expect(trace(t.boss, 20).boss.x).toBe(x);
  });

  it('1.2 秒もぐったあと、姿を現して往復を再開し、踏める状態に戻る', () => {
    const t = trace(make(0), ticks(2.5 + 1.2) + 4);
    expect(bossFlags(t.boss).hidden).toBe(false);
    const moved = trace(t.boss, 30).boss;
    expect(moved.x).not.toBe(t.boss.x);
  });
});

describe('トビハネ(大ジャンプで近づく)', () => {
  it('1.0 秒往復したあと、上向きにジャンプして地面から離れる', () => {
    const t = trace(make(1), ticks(1.0) + 6);
    expect(t.log.some((b) => b.y < GROUND_Y - b.h - 20)).toBe(true);
  });

  it('空中では、プレイヤーのいる側(右)へ毎秒 160 で水平に動く', () => {
    const ctx = ctxAt(5000);
    let b = make(1, 1100);
    let airDx = 0;
    for (let i = 0; i < 200; i++) {
      const next = stepBossScript(b, ctx, FIXED_DT).boss;
      if (next.y < GROUND_Y - next.h - 1 && b.y < GROUND_Y - b.h - 1) airDx = Math.max(airDx, next.x - b.x);
      b = next;
    }
    expect(airDx).toBeCloseTo(160 * FIXED_DT, 4);
  });

  it('着地して地面の上に留まり、往復に戻る(地面より下には沈まない)', () => {
    let b = make(1);
    let jumped = false;
    let landedAfter = false;
    for (let i = 0; i < 400; i++) {
      b = stepBossScript(b, ctxAt(2000), FIXED_DT).boss;
      expect(b.y + b.h).toBeLessThanOrEqual(GROUND_Y + 1e-6);
      if (b.y + b.h < GROUND_Y - 1) jumped = true;
      if (jumped && b.y + b.h === GROUND_Y) landedAfter = true;
    }
    expect(jumped).toBe(true);
    expect(landedAfter).toBe(true);
    expect(b.step).toBeLessThan(2);
  });
});

describe('オオグイ(予備動作のあと突進する)', () => {
  const wide = (): Boss => createBoss(1000, 0, 5000, GROUND_Y, BOSS_DEFS[2]!);

  it('2.0 秒往復したあと、0.6 秒の予備動作で、その場に止まる', () => {
    const t = trace(wide(), ticks(2.0) + 3);
    expect(bossFlags(t.boss).telegraph).toBe(true);
    const x = t.boss.x;
    const later = trace(t.boss, ticks(0.6) - 6);
    expect(later.boss.x).toBe(x);
  });

  it('予備動作のあと、プレイヤーの方向へ毎秒 320 で最大 0.8 秒間突進する', () => {
    const t = trace(wide(), ticks(2.0 + 0.6) + 2, ctxAt(4000));
    const start = t.boss.x;
    const dash = trace(t.boss, 30, ctxAt(4000)).boss;
    expect(dash.x - start).toBeCloseTo(320 * 0.5, -1);
    const full = trace(t.boss, ticks(0.8), ctxAt(4000)).boss;
    expect(full.x - start).toBeGreaterThan(240);
    expect(full.x - start).toBeLessThanOrEqual(260);
  });

  it('突進のあと 0.8 秒休み(動かず、踏める)、そのあと往復に戻る', () => {
    const t = trace(wide(), ticks(2.0 + 0.6 + 0.8) + 4, ctxAt(4000));
    expect(t.boss.script[t.boss.step]!.a).toBe('rest');
    const x = t.boss.x;
    expect(trace(t.boss, ticks(0.8) - 6, ctxAt(4000)).boss.x).toBe(x);
    expect(bossFlags(t.boss)).toEqual({ hidden: false, stompImmune: false, harmless: false, telegraph: false, crouch: false, staggered: false, bounceOnly: false });
  });

  it('往復範囲の端の近くで突進しても、範囲の外へは出ない', () => {
    const b = createBoss(1380, 1000, 1400, GROUND_Y, BOSS_DEFS[2]!);
    let cur = b;
    for (let i = 0; i < 600; i++) {
      cur = stepBossScript(cur, ctxAt(9000), FIXED_DT).boss;
      expect(cur.x).toBeLessThanOrEqual(1400);
      expect(cur.x).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe('タマフキ(直進する弾を撃つ)', () => {
  it('1.6 秒の往復の間は、弾を撃たない', () => {
    expect(trace(make(3), ticks(1.6) - 3, ctxAt(5000)).spawns).toHaveLength(0);
  });

  it('0.4 秒の予備動作のあと、直進弾を 1 発、プレイヤーのいる側へ毎秒 260 で撃つ', () => {
    const t = trace(make(3), ticks(1.6 + 0.4) + 6, ctxAt(5000));
    expect(t.spawns).toHaveLength(1);
    const p = t.spawns[0]!.p;
    expect(p.kind).toBe('shot');
    expect(p.vx).toBe(260);
    expect(trace(make(3), ticks(1.6 + 0.4) + 6, ctxAt(-5000)).spawns[0]!.p.vx).toBe(-260);
  });

  it('弾は地面に立つプレイヤーに当たる高さで、ジャンプで飛び越えられる', () => {
    const p = trace(make(3), ticks(2.0) + 6, ctxAt(5000)).spawns[0]!.p;
    const standing: Player = { x: p.x, y: GROUND_Y - PLAYER_HEIGHT, vx: 0, vy: 0, onGround: true };
    expect(resolveProjectileContact(standing, [p], false).hit).toBe(true);
    const jumping: Player = { x: p.x, y: GROUND_Y - PLAYER_HEIGHT - 60, vx: 0, vy: 0, onGround: false };
    expect(resolveProjectileContact(jumping, [p], false).hit).toBe(false);
  });

  it('これを繰り返す(2 周目にも 1 発)', () => {
    const lap = ticks(1.6 + 0.4);
    expect(trace(make(3), lap * 2 + 12, ctxAt(5000)).spawns).toHaveLength(2);
  });
});

describe('ナミノリ(着地して衝撃波を出す)', () => {
  it('ジャンプ中は衝撃波を出さず、着地した更新で、左右へ 1 つずつ出す', () => {
    const t = trace(make(4), ticks(1.2) + 120);
    expect(t.spawns).toHaveLength(2);
    expect(t.spawns[0]!.tick).toBe(t.spawns[1]!.tick);
    const speeds = t.spawns.map((s) => s.p.vx).sort((a, b) => a - b);
    expect(speeds).toEqual([-280, 280]);
    expect(t.spawns.every((s) => s.p.kind === 'wave')).toBe(true);
  });

  it('着地の前(空中の間)は、衝撃波が出ていない', () => {
    const t = trace(make(4), ticks(1.2) + 120);
    const landTick = t.spawns[0]!.tick;
    const airborne = t.log.slice(ticks(1.2) + 2, landTick);
    expect(airborne.length).toBeGreaterThan(10);
    expect(t.spawns.filter((s) => s.tick < landTick)).toHaveLength(0);
  });

  it('衝撃波のあと 0.6 秒休み、その間は動かない', () => {
    const t = trace(make(4), ticks(1.2) + 120);
    const landTick = t.spawns[0]!.tick;
    const after = t.log.slice(landTick + 1, landTick + ticks(0.6) - 4);
    expect(new Set(after.map((b) => b.x)).size).toBe(1);
  });
});

describe('ジシン(連続の衝撃波)', () => {
  it('1.5 秒往復し、0.5 秒の予備動作のあと、衝撃波を 2 回(左右 1 つずつ)出す', () => {
    const t = trace(make(8), ticks(1.5 + 0.5 + 0.4 + 0.8) + 8);
    expect(t.spawns).toHaveLength(4);
    const ticksOf = [...new Set(t.spawns.map((s) => s.tick))];
    expect(ticksOf).toHaveLength(2);
    expect(Math.abs(ticksOf[1]! - ticksOf[0]! - ticks(0.4))).toBeLessThanOrEqual(3);
  });

  it('衝撃波は毎秒 360 で、ナミノリの衝撃波(280)より速い', () => {
    const t = trace(make(8), ticks(2.2));
    const speeds = t.spawns.map((s) => Math.abs(s.p.vx));
    expect(speeds.every((v) => v === 360)).toBe(true);
    expect(360).toBeGreaterThan(280);
  });

  it('衝撃波を出し終えたあと 0.8 秒休み、その間は動かない', () => {
    const t = trace(make(8), ticks(1.5 + 0.5 + 0.4) + 6);
    const second = t.spawns[t.spawns.length - 1]!.tick;
    const rest = t.log.slice(second + 2, second + ticks(0.8) - 6);
    const full = trace(make(8), ticks(1.5 + 0.5 + 0.4 + 0.8) - 6);
    expect(full.boss.step).toBeGreaterThan(0);
    expect(rest.length === 0 || new Set(rest.map((b) => b.x)).size === 1).toBe(true);
  });
});

describe('フタゴ(放物線の弾を左右へ投げる)', () => {
  it('0.4 秒の予備動作のあと、左右へ 1 発ずつ、合計 2 発の放物線の弾を出す', () => {
    const t = trace(make(5), ticks(1.4 + 0.4) + 6);
    expect(t.spawns).toHaveLength(2);
    expect(t.spawns.every((s) => s.p.kind === 'arc')).toBe(true);
    const vxs = t.spawns.map((s) => s.p.vx).sort((a, b) => a - b);
    expect(vxs).toEqual([-300, 300]);
    expect(t.spawns.every((s) => s.p.vy === -650)).toBe(true);
  });

  it('それまでの往復の間は、弾を出さない', () => {
    expect(trace(make(5), ticks(1.4) - 3).spawns).toHaveLength(0);
  });
});

describe('ウキウキ(浮かんで急降下する)', () => {
  const heightOf = (b: Boss) => GROUND_Y - (b.y + b.h);

  it('地面から 150 の高さまで上昇し、その高さを保って往復する(毎秒 120)', () => {
    const t = trace(make(6), ticks(1.0) + 40, ctxAt(-100000));
    // 浮上は毎秒 200 で 150 の高さまで(0.75 秒)
    const hover = t.log[t.log.length - 1]!;
    expect(heightOf(hover)).toBeCloseTo(150, 3);
    const a = t.boss.x;
    const b = trace(t.boss, 30).boss.x;
    expect(Math.abs(b - a)).toBeCloseTo(60, 3); // 0.5 秒で 60
    expect(heightOf(trace(t.boss, 30).boss)).toBeCloseTo(150, 3);
  });

  it('狙う行動では、プレイヤーの真上へ水平に近づく', () => {
    const playerX = 1000 + 230 + 150; // 範囲内の、ボスから離れた位置
    const ctx = ctxAt(playerX);
    let b = make(6);
    let dxAtAimStart = 0;
    let dxAtAimEnd = 0;
    for (let i = 0; i < ticks(0.75 + 2.0 + 1.0) + 6; i++) {
      b = stepBossScript(b, ctx, FIXED_DT).boss;
      if (b.script[b.step]!.a === 'aim' && dxAtAimStart === 0) dxAtAimStart = Math.abs(playerX - (b.x + b.w / 2));
    }
    dxAtAimEnd = Math.abs(playerX - (b.x + b.w / 2));
    expect(dxAtAimEnd).toBeLessThan(dxAtAimStart);
  });

  it('予備動作(0.5 秒)のあと、毎秒 800 で急降下して着地し、目を回して動かない', () => {
    const t = trace(make(6), ticks(0.75 + 2.0 + 1.0 + 0.5) + 60, ctxAt(1400));
    const stepsSeen = new Set(t.log.map((b) => b.script[b.step]!.a));
    expect(stepsSeen.has('drop')).toBe(true);
    expect(stepsSeen.has('dizzy')).toBe(true);
    // 目を回している間は、地面に着いていて動かない
    const dizzy = t.log.filter((b) => b.script[b.step]!.a === 'dizzy');
    expect(dizzy.length).toBeGreaterThan(5);
    for (const d of dizzy) expect(d.y + d.h).toBe(GROUND_Y);
    expect(new Set(dizzy.map((d) => d.x)).size).toBe(1);
  });

  it('目を回している間は、予備動作・踏めない状態の目印が立っていない(踏める)', () => {
    const t = trace(make(6), ticks(0.75 + 2.0 + 1.0 + 0.5) + 60, ctxAt(1400));
    const dizzy = t.log.find((b) => b.script[b.step]!.a === 'dizzy')!;
    expect(bossFlags(dizzy)).toEqual({ hidden: false, stompImmune: false, harmless: false, telegraph: false, crouch: false, staggered: false, bounceOnly: false });
  });

  it('1.2 秒の目を回したあと、再び上昇する', () => {
    const lap = ticks(0.75 + 2.0 + 1.0 + 0.5) + ticks(0.3) + ticks(1.2) + 80;
    const t = trace(make(6), lap, ctxAt(1400));
    const steps = t.log.map((b) => b.script[b.step]!.a);
    const afterDizzy = steps.slice(steps.lastIndexOf('dizzy'));
    expect(afterDizzy).toContain('rise');
  });
});

describe('コロリン(丸まって転がる)', () => {
  it('1.5 秒往復したあと、毎秒 260 で転がり、転がっている間は踏めない(stompImmune)', () => {
    const t = trace(make(7), ticks(1.5) + 6);
    expect(bossFlags(t.boss).stompImmune).toBe(true);
    const x = t.boss.x;
    const after = trace(t.boss, 30).boss;
    expect(Math.abs(after.x - x)).toBeGreaterThan(100);
  });

  it('転がりが範囲の端に達すると反転し、範囲の外へは出ない', () => {
    let b = make(7);
    let reversed = false;
    for (let i = 0; i < ticks(1.5 + 2.0) + 6; i++) {
      const next = stepBossScript(b, ctxAt(-100000), FIXED_DT).boss;
      if (b.script[b.step]!.a === 'roll' && next.dir !== b.dir) reversed = true;
      b = next;
      expect(b.x).toBeGreaterThanOrEqual(1000 - 1e-6);
      expect(b.x).toBeLessThanOrEqual(1000 + 470 + 1e-6);
    }
    expect(reversed).toBe(true);
  });

  it('2.0 秒転がったあと、止まって 1.2 秒目を回し、その間は踏める', () => {
    const t = trace(make(7), ticks(1.5 + 2.0) + 6);
    expect(t.boss.script[t.boss.step]!.a).toBe('dizzy');
    expect(bossFlags(t.boss).stompImmune).toBe(false);
    const x = t.boss.x;
    expect(trace(t.boss, ticks(1.2) - 8).boss.x).toBe(x);
  });
});

describe('9 体は、すべて異なる動きをする', () => {
  it('行動の流れ(順番)が、9 体で重複しない', () => {
    const shapes = BOSS_DEFS.slice(0, 9).map((d) => JSON.stringify(d.script));
    expect(new Set(shapes).size).toBe(9);
  });

  it('それぞれが、なんらかの特徴的な行動(もぐる・跳ぶ・突進・弾・衝撃波・放物線・浮上・転がり)を持つ', () => {
    const features = BOSS_DEFS.slice(0, 9).map((d) => d.script!.map((s) => s.a).filter((a) => a !== 'patrol' && a !== 'rest' && a !== 'telegraph'));
    for (const f of features) expect(f.length).toBeGreaterThan(0);
    const all = new Set(features.flat());
    for (const a of ['burrow', 'jump', 'dash', 'shot', 'wave', 'lob', 'rise', 'drop', 'roll']) expect(all.has(a as never)).toBe(true);
  });

  it('プレイヤーの幅を考慮しても、衝撃波は、どれもジャンプでよけられる高さ(24)', () => {
    const t = trace(make(4), ticks(1.2) + 120);
    for (const s of t.spawns) expect(s.p.h).toBeLessThan(PLAYER_HEIGHT);
    expect(PLAYER_WIDTH).toBe(40);
  });
});
