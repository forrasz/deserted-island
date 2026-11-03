import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, bossRect, createBoss, type Boss } from './boss';
import { bossFlags, NUSHI_FORM1, NUSHI_FORM2, stepBossScript, type BossCtx } from './boss-scripts';
import { ctxAt, ticks } from './boss-test-helpers';
import { createWave } from './projectile';
import {
  BOSS_RAGE_TIME_SCALE,
  BOSS_TRANSFORM_TIME,
  FIXED_DT,
  GROUND_Y,
  PLAYER_HEIGHT,
  STOMP_BOUNCE_SPEED,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT } from './input';
import type { Player } from './player';
import { resolveProjectileContact, type Projectile } from './projectile';

const DEF = BOSS_DEFS[9]!;
const H = PLAYER_HEIGHT;

/** 動きの観察用に、広い往復範囲のヌシを作る。 */
function nushi(over: Partial<Boss> = {}, x = 1000, left = 0, right = 8000): Boss {
  return { ...createBoss(x, left, right, GROUND_Y, DEF), ...over };
}

interface Trace {
  boss: Boss;
  log: Boss[];
  spawns: Array<{ tick: number; p: Projectile }>;
}
function trace(boss: Boss, n: number, ctx: BossCtx | ((b: Boss) => BossCtx) = ctxAt(-100000)): Trace {
  let cur = boss;
  const log: Boss[] = [];
  const spawns: Trace['spawns'] = [];
  for (let i = 0; i < n; i++) {
    const r = stepBossScript(cur, typeof ctx === 'function' ? ctx(cur) : ctx, FIXED_DT);
    cur = r.boss;
    log.push(cur);
    for (const p of r.spawns) spawns.push({ tick: i, p });
  }
  return { boss: cur, log, spawns };
}
const action = (b: Boss) => (b.form === 2 && b.script2 ? b.script2 : b.script)[b.step]!.a;

describe('ヌシ: 通常形態の流れ(5.1)', () => {
  it('定義: 往復 → 予備動作 → 突進 → 休み → 予備動作 → 弾 → ジャンプ → 休み', () => {
    expect(NUSHI_FORM1.map((s) => s.a)).toEqual([
      'patrol', 'telegraph', 'dash', 'rest', 'telegraph', 'shot', 'jump', 'rest',
    ]);
    expect(DEF.script).toBe(NUSHI_FORM1);
    expect(DEF.script2).toBe(NUSHI_FORM2);
  });

  it('1.2 秒往復(毎秒 100)したあと、0.8 秒の予備動作で止まる', () => {
    const t = trace(nushi(), ticks(1.2) + 4);
    expect(action(t.boss)).toBe('telegraph');
    expect(bossFlags(t.boss).telegraph).toBe(true);
    const x = t.boss.x;
    expect(trace(t.boss, ticks(0.8) - 6).boss.x).toBe(x);
  });

  it('予備動作のあと、プレイヤーの方向へ毎秒 400 で、往復範囲の中を突進する', () => {
    const t = trace(nushi(), ticks(1.2 + 0.8) + 3, ctxAt(7000));
    const start = t.boss.x;
    const dashed = trace(t.boss, 30, ctxAt(7000)).boss;
    expect(dashed.x - start).toBeCloseTo(400 * 0.5, -1);
    // 範囲の端の近くでは、外へは出ない
    const near = nushi({}, 7950, 0, 8000);
    let cur = near;
    for (let i = 0; i < 600; i++) {
      cur = stepBossScript(cur, ctxAt(9000), FIXED_DT).boss;
      expect(cur.x).toBeLessThanOrEqual(8000);
    }
  });

  it('突進のあと 1.0 秒休み、その間は動かず、踏める', () => {
    const t = trace(nushi(), ticks(1.2 + 0.8 + 1.0) + 4, ctxAt(7000));
    expect(action(t.boss)).toBe('rest');
    expect(bossFlags(t.boss)).toEqual({ hidden: false, stompImmune: false, harmless: false, telegraph: false, crouch: true });
    const x = t.boss.x;
    expect(trace(t.boss, ticks(1.0) - 5, ctxAt(7000)).boss.x).toBe(x);
  });

  it('直進弾を 3 発、同じ更新で、高さを変えて出す(低・中・高)', () => {
    const t = trace(nushi(), ticks(1.2 + 0.8 + 1.0 + 1.0 + 0.5) + 6, ctxAt(7000));
    expect(t.spawns).toHaveLength(3);
    const tick = t.spawns[0]!.tick;
    expect(t.spawns.every((s) => s.tick === tick)).toBe(true);
    expect(t.spawns.every((s) => s.p.kind === 'shot' && s.p.vx === 280)).toBe(true);
    const tops = t.spawns.map((s) => s.p.y).sort((a, b) => b - a); // 低い弾(y が大きい)から
    expect(new Set(tops).size).toBe(3);
  });

  it('一番低い弾だけが、地面に立つプレイヤーに当たり、他の 2 発は頭上を通る', () => {
    const t = trace(nushi(), ticks(1.2 + 0.8 + 1.0 + 1.0 + 0.5) + 6, ctxAt(7000));
    const shots = t.spawns.map((s) => s.p).sort((a, b) => b.y - a.y);
    const standing: Player = { x: shots[0]!.x, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };
    const hits = shots.map((p) => resolveProjectileContact(standing, [{ ...p, x: standing.x }], false).hit);
    expect(hits).toEqual([true, false, false]);
  });

  it('ジャンプして着地した更新で、衝撃波(毎秒 300)を左右へ出し、そのあと 0.8 秒休む', () => {
    const t = trace(nushi(), ticks(1.2 + 0.8 + 1.0 + 1.0 + 0.5) + 150, ctxAt(7000));
    const waves = t.spawns.filter((s) => s.p.kind === 'wave');
    expect(waves).toHaveLength(2);
    expect(waves.map((w) => w.p.vx).sort((a, b) => a - b)).toEqual([-300, 300]);
    expect(waves[0]!.tick).toBe(waves[1]!.tick);
    // 着地の前に、衝撃波は出ていない
    expect(t.spawns.filter((s) => s.p.kind === 'wave' && s.tick < waves[0]!.tick)).toHaveLength(0);
  });

  it('大きさは 200×250 で、ジャンプしても地面より下へ沈まない', () => {
    let b = nushi();
    for (let i = 0; i < 1500; i++) {
      b = stepBossScript(b, ctxAt(7000), FIXED_DT).boss;
      expect(b.y + b.h).toBeLessThanOrEqual(GROUND_Y + 1e-6);
      expect([b.w, b.h]).toEqual([200, 250]);
    }
  });
});

describe('ヌシ: 形態変化(5.2)', () => {
  it('体力が 7 の間は、変身に入らない', () => {
    const t = trace(nushi({ hp: 7 }), 30);
    expect(t.boss.transformT).toBe(0);
    expect(t.boss.transformed).toBe(false);
  });

  it('体力が 6 になると、変身に入る(安全な状態: harmless)', () => {
    const b = stepBossScript(nushi({ hp: 6 }), ctxAt(5000), FIXED_DT).boss;
    expect(b.transformT).toBeGreaterThan(0);
    expect(b.transformed).toBe(true);
    expect(bossFlags(b).harmless).toBe(true);
  });

  it('変身中の 1.5 秒間は、その場で動かず(攻撃もしない)、終わると強化形態の最初の行動になる', () => {
    let b = nushi({ hp: 6 });
    const x = b.x;
    let formAfter: number = 1;
    let spawned = 0;
    for (let i = 0; i < ticks(BOSS_TRANSFORM_TIME) + 4; i++) {
      const r = stepBossScript(b, ctxAt(5000), FIXED_DT);
      b = r.boss;
      spawned += r.spawns.length;
      if (b.transformT > 0) expect(b.x).toBe(x);
      formAfter = b.form;
    }
    expect(spawned).toBe(0);
    expect(formAfter).toBe(2);
    expect(b.transformT).toBe(0);
    expect(b.step).toBeLessThanOrEqual(1);
    expect(action(b)).toBe('patrol');
  });

  it('変身は 1 回だけ(強化形態で体力がさらに減っても、再び変身しない)', () => {
    let b = nushi({ hp: 6 });
    for (let i = 0; i < ticks(BOSS_TRANSFORM_TIME) + 6; i++) b = stepBossScript(b, ctxAt(5000), FIXED_DT).boss;
    expect(b.form).toBe(2);
    b = { ...b, hp: 3 };
    for (let i = 0; i < 100; i++) {
      b = stepBossScript(b, ctxAt(5000), FIXED_DT).boss;
      expect(b.transformT).toBe(0);
      expect(b.form).toBe(2);
    }
  });

  it('変身中は、踏んでも体力が 6 のまま変わらない(ゲーム内の踏みつけ)', () => {
    const b = nushi({ hp: 6 }, 1000, 1000, 1000);
    const s: GameState = {
      ...createGame(undefined, { bosses: [], enemies: [] }),
      bosses: [b],
      player: { x: 1090, y: b.y - H - 5, vx: 0, vy: 300, onGround: false },
    };
    const g = stepGame(s, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.transformT).toBeGreaterThan(0);
    expect(g.bosses[0]!.hp).toBe(6);
    expect(g.player.vy).toBe(-STOMP_BOUNCE_SPEED); // 跳ね返るだけ
    expect(g.hp).toBe(3); // 被弾もしない
  });

  it('体力が 7 から、踏みつけで 6 になったら、次の更新で変身に入る', () => {
    const b = nushi({ hp: 7 }, 1000, 1000, 1000);
    const base = createGame(undefined, { bosses: [], enemies: [] });
    let g: GameState = {
      ...base,
      bosses: [b],
      player: { x: 1090, y: b.y - H - 5, vx: 0, vy: 300, onGround: false },
    };
    g = stepGame(g, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(6);
    g = stepGame({ ...g, player: { ...g.player, x: 5000, y: GROUND_Y - H } }, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.transformT).toBeGreaterThan(0);
  });
});

describe('ヌシ: 強化形態(5.3)', () => {
  const times = (script: typeof NUSHI_FORM1, a: string) =>
    script.filter((s) => s.a === a).map((s) => ('time' in s ? s.time : 0));

  it('往復・予備動作・休みの時間が、通常形態の 0.6 倍', () => {
    expect(BOSS_RAGE_TIME_SCALE).toBe(0.6);
    expect(times(NUSHI_FORM2, 'patrol')[0]).toBeCloseTo(times(NUSHI_FORM1, 'patrol')[0]! * 0.6, 6);
    expect(times(NUSHI_FORM2, 'telegraph')[0]).toBeCloseTo(times(NUSHI_FORM1, 'telegraph')[0]! * 0.6, 6);
    expect(times(NUSHI_FORM2, 'rest')[0]).toBeCloseTo(times(NUSHI_FORM1, 'rest')[0]! * 0.6, 6);
  });

  it('突進が連続で 2 回ある', () => {
    expect(NUSHI_FORM2.filter((s) => s.a === 'dash')).toHaveLength(2);
    expect(NUSHI_FORM1.filter((s) => s.a === 'dash')).toHaveLength(1);
  });

  const raged = (): Boss => ({
    ...nushi({ hp: 5 }),
    transformed: true,
    form: 2,
    step: 0,
    t: 0,
  });

  it('直進弾が 5 発、同じ更新で、高さを変えて出る', () => {
    const lap = NUSHI_FORM2.slice(0, 7).reduce((a, s) => a + ('time' in s ? s.time : 0), 0);
    const t = trace(raged(), ticks(lap) + 8, ctxAt(7000));
    const shots = t.spawns.filter((s) => s.p.kind === 'shot');
    expect(shots).toHaveLength(5);
    expect(new Set(shots.map((s) => s.p.y)).size).toBe(5);
    expect(new Set(shots.map((s) => s.tick)).size).toBe(1);
  });

  it('衝撃波が、約 0.5 秒おきに 2 回(左右 1 つずつ)出る', () => {
    const t = trace(raged(), ticks(12), ctxAt(7000));
    const waveTicks = [...new Set(t.spawns.filter((s) => s.p.kind === 'wave').map((s) => s.tick))].slice(0, 2);
    expect(waveTicks).toHaveLength(2);
    expect(Math.abs(waveTicks[1]! - waveTicks[0]! - ticks(0.5))).toBeLessThanOrEqual(3);
    const firstTwo = t.spawns.filter((s) => s.p.kind === 'wave' && waveTicks.includes(s.tick));
    expect(firstTwo).toHaveLength(4);
  });

  it('強化形態の形態は 2 で、体力が減っても形態 2 のまま行動を続ける', () => {
    let b = raged();
    for (let i = 0; i < 600; i++) {
      b = stepBossScript(b, ctxAt(7000), FIXED_DT).boss;
      expect(b.form).toBe(2);
    }
  });
});

describe('ヌシ: 撃破と再プレイ(5.4)', () => {
  const none = { bosses: [], enemies: [] };

  it('撃破されたヌシは、更新しても新しい弾や衝撃波を出さない', () => {
    const dead = { ...raged2(), alive: false, hp: 0 };
    for (let i = 0; i < 600; i++) {
      const r = stepBossScript(dead, ctxAt(7000), FIXED_DT);
      expect(r.spawns).toEqual([]);
    }
  });

  function raged2(): Boss {
    return { ...nushi({ hp: 5 }), transformed: true, form: 2 };
  }

  it('撃破で、中央に部品を 1 個ドロップする(ゲーム内)', () => {
    const b = { ...nushi({ hp: 1, transformed: true, form: 2 }, 1000, 1000, 1000) };
    let g: GameState = {
      ...createGame(undefined, none),
      bosses: [b],
      player: { x: 1090, y: b.y - H - 5, vx: 0, vy: 300, onGround: false },
    };
    g = stepGame(g, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.alive).toBe(false);
    expect(g.parts).toHaveLength(1);
    expect(g.parts[0]!.x + 12).toBeCloseTo(1100, 6);
  });

  it('撃破後も、すでに飛んでいる弾は、通常の消滅の条件で消える(新しい弾は出ない)', () => {
    const b = { ...nushi({ hp: 1, transformed: true, form: 2 }, 1000, 1000, 1000) };
    const wave = createWave(3000, GROUND_Y, 0);
    let g: GameState = {
      ...createGame(undefined, none),
      bosses: [b],
      projectiles: [wave],
      player: { x: 1090, y: b.y - H - 5, vx: 0, vy: 300, onGround: false },
    };
    g = stepGame(g, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.alive).toBe(false);
    for (let i = 0; i < ticks(2) + 10; i++) g = stepGame({ ...g, player: { ...g.player, x: 9000, y: GROUND_Y - H, vy: 0 } }, NO_INPUT, FIXED_DT);
    expect(g.projectiles).toHaveLength(0);
  });

  it('再プレイで、ヌシは体力 12・形態 1・変身前に戻り、弾はなくなる', () => {
    const g = createGame();
    const b = g.bosses[9]!;
    expect(b.hp).toBe(12);
    expect(b.maxHp).toBe(12);
    expect(b.form).toBe(1);
    expect(b.transformed).toBe(false);
    expect(b.transformT).toBe(0);
    expect(b.step).toBe(0);
    expect(g.projectiles).toEqual([]);
    expect(b.y + b.h).toBe(GROUND_Y);
  });
});

describe('ヌシ: 休みの間は身をかがめて、ジャンプで踏める高さになる', () => {
  const JUMP_APEX = (750 * 750) / (2 * 2000); // プレイヤーのジャンプの最高点(約 140)

  it('立っている間の高さは 250 で、ジャンプの最高点より高く、地面からのジャンプでは踏めない', () => {
    const b = nushi();
    expect(bossRect(b).h).toBe(250);
    expect(JUMP_APEX).toBeLessThan(250);
  });

  it('休んでいる間は、高さが 100 になり、下辺は地面のまま、上辺はジャンプの最高点より低い', () => {
    const t = trace(nushi(), ticks(1.2 + 0.8 + 1.0) + 4, ctxAt(7000));
    expect(action(t.boss)).toBe('rest');
    const r = bossRect(t.boss);
    expect(r.h).toBe(100);
    expect(r.y + r.h).toBe(GROUND_Y);
    expect(GROUND_Y - r.y).toBeLessThan(JUMP_APEX);
  });

  it('休みが終わると、高さは 250 に戻る', () => {
    const t = trace(nushi(), ticks(1.2 + 0.8 + 1.0 + 1.0) + 6, ctxAt(7000));
    expect(action(t.boss)).not.toBe('rest');
    expect(bossRect(t.boss).h).toBe(250);
  });

  it('変身中・撃破されたボスなど、休み以外では、かがまない', () => {
    expect(bossRect({ ...nushi({ hp: 6 }), transformT: 1 }).h).toBe(250);
    expect(bossFlags(nushi()).crouch).toBe(false);
  });

  it('通常ボスは、休んでもかがまない(高さ 100 のまま)', () => {
    const b = createBoss(1000, 0, 5000, GROUND_Y, BOSS_DEFS[2]!);
    expect(bossRect(b)).toEqual({ x: 1000, y: GROUND_Y - 100, w: 80, h: 100 });
    expect(b.restH).toBeUndefined();
  });

  it('ゲーム内: 休んでいる間は、ジャンプの最高点付近から落ちて、踏める(体力が 1 減り、跳ね返る)', () => {
    const resting = nushi({ step: 3, t: 0 }, 1000, 1000, 1000); // step 3 = rest
    expect(action(resting)).toBe('rest');
    const r = bossRect(resting);
    const falling: Player = { x: 1090, y: r.y - H - 5, vx: 0, vy: 300, onGround: false };
    const s: GameState = {
      ...createGame(undefined, { bosses: [], enemies: [] }),
      bosses: [resting],
      player: { ...falling },
    };
    const g = stepGame(s, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(11);
    expect(g.player.vy).toBe(-STOMP_BOUNCE_SPEED);
  });

  it('ゲーム内: 立っている間(往復)は、同じ高さから落ちても、上辺に届かず、踏めない(側面として扱われる)', () => {
    const standing = nushi({}, 1000, 1000, 1000); // step 0 = patrol
    expect(action(standing)).toBe('patrol');
    const falling: Player = { x: 1090, y: GROUND_Y - 100 - H - 20, vx: 0, vy: 300, onGround: false };
    const s: GameState = {
      ...createGame(undefined, { bosses: [], enemies: [] }),
      bosses: [standing],
      player: falling,
    };
    const g = stepGame(s, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(12);
  });

  it('撃破時の部品は、かがんだ矩形の中央にドロップする', () => {
    const resting = nushi({ step: 3, t: 0, hp: 1 }, 1000, 1000, 1000);
    const r = bossRect(resting);
    const s: GameState = {
      ...createGame(undefined, { bosses: [], enemies: [] }),
      bosses: [{ ...resting, transformed: true, form: 2, script: NUSHI_FORM2, step: 5 }],
      player: { x: 1090, y: r.y - H - 5, vx: 0, vy: 300, onGround: false },
    };
    const g = stepGame(s, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.alive).toBe(false);
    expect(g.parts).toHaveLength(1);
  });
});
