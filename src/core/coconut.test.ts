import { describe, expect, it } from 'vitest';
import {
  COCONUT_GRAVITY,
  COCONUT_LIFETIME,
  COCONUT_MAX_HELD,
  COCONUT_SIZE,
  FIXED_DT,
  GROUND_Y,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from './config';
import { dropCoconut, stepCoconuts, stepThrown, throwCoconut, thrownRect } from './coconut';
import { BOSS_DEFS, createBoss, type Boss } from './boss';
import { BOSS_INVULN_TIME, COCONUT_DAMAGE } from './config';
import { createEnemy } from './enemy';
import { THROW_IDLE_T } from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { STAGE } from './stage';
import { createPlayer } from './player';

const THROW: InputState = { ...NO_INPUT, throw: true };
const H = PLAYER_HEIGHT;
const none = { bosses: [], enemies: [] };

/** プレイヤーが x に立つ、敵なしで、ヤシの実が coconuts の位置にある世界。 */
function arena(over: Partial<GameState> = {}): GameState {
  return { ...createGame(undefined, { ...none }), player: createPlayer(1000), ...over };
}
const run = (g: GameState, input: InputState, n: number): GameState => {
  let s = g;
  for (let i = 0; i < n; i++) s = stepGame(s, input, FIXED_DT);
  return s;
};

describe('落ちるヤシの実と拾う', () => {
  const at = (x: number) => ({ x, y: GROUND_Y - H, w: PLAYER_WIDTH, h: H });
  const step = (cs: ReturnType<typeof dropCoconut>[], player: ReturnType<typeof at>, held: number, n = 1) => {
    let r = { coconuts: cs, held };
    for (let i = 0; i < n; i++) r = stepCoconuts(r.coconuts, player, r.held, GROUND_Y, FIXED_DT);
    return r;
  };

  it('落ちてくる実は、重力で地面まで落ちて止まり、その位置に置かれる', () => {
    const r = step([dropCoconut(1000, GROUND_Y - 200)], at(0), 0, 120);
    const c = r.coconuts[0]!;
    expect(c.landed).toBe(true);
    expect(c.y + COCONUT_SIZE).toBe(GROUND_Y);
    expect(c.x + COCONUT_SIZE / 2).toBe(1000);
  });

  it('地面に着いてから 30 秒で消える(拾われなければ)', () => {
    let r = step([dropCoconut(1000, GROUND_Y - 200)], at(0), 0, 45); // 着地(約 35 更新)
    r = step(r.coconuts, at(0), 0, Math.round(COCONUT_LIFETIME * 60) - 20);
    expect(r.coconuts).toHaveLength(1);
    r = step(r.coconuts, at(0), 0, 20);
    expect(r.coconuts).toHaveLength(0);
  });

  it('触れると拾い、手持ちが 1 個増える(落ちている途中でも拾える)', () => {
    const falling = { ...dropCoconut(1000, GROUND_Y - 70), vy: 0 };
    const r = step([falling], at(1000), 0);
    expect(r.held).toBe(1);
    expect(r.coconuts).toHaveLength(0);
  });

  it('手持ちが 2 個のときは、拾わず、地面に残る', () => {
    const r = step([dropCoconut(1000, GROUND_Y - COCONUT_SIZE)], at(1000), COCONUT_MAX_HELD, 3);
    expect(r.held).toBe(COCONUT_MAX_HELD);
    expect(r.coconuts).toHaveLength(1);
  });

  it('ゲームの始まりは、ヤシの実が落ちておらず、手持ち 0。再プレイでも同じ', () => {
    const g = createGame();
    expect(g.coconuts).toEqual([]);
    expect(g.held).toBe(0);
    expect(g.palms).toHaveLength(10);
    expect(g.target).toEqual(STAGE.target);
  });

  it('ゲームの中で、落ちてきた実を拾うと手持ちが増える', () => {
    let g = arena({ player: createPlayer(1000), coconuts: [dropCoconut(1020, GROUND_Y - 100)] });
    g = run(g, NO_INPUT, 40);
    expect(g.held).toBe(1);
    expect(g.coconuts).toHaveLength(0);
  });
});

describe('ヤシの実を投げる', () => {
  it('押した瞬間に、向いている向きへ 1 個投げ、手持ちが 1 個減る', () => {
    const g = stepGame(arena({ held: 2 }), THROW, FIXED_DT);
    expect(g.held).toBe(1);
    expect(g.thrown).toHaveLength(1);
    expect(g.thrown[0]!.vx).toBeGreaterThan(0);
    const left = stepGame(arena({ held: 2 }), { ...THROW, left: true }, FIXED_DT);
    expect(left.thrown[0]!.vx).toBeLessThan(0);
  });

  it('押し続けても連射しない(押し直したときだけ投げる)', () => {
    let g = run(arena({ held: 2 }), THROW, 60);
    expect(g.held).toBe(1);
    g = stepGame(g, NO_INPUT, FIXED_DT);
    g = stepGame(g, THROW, FIXED_DT);
    expect(g.held).toBe(0);
  });

  it('手持ちが 0 個のときは、何も起きない', () => {
    const g = stepGame(arena({ held: 0 }), THROW, FIXED_DT);
    expect(g.thrown).toHaveLength(0);
    expect(g.held).toBe(0);
  });

  it('登場演出の最中は、投げられない', () => {
    const g = stepGame(arena({ held: 2, intro: { state: 'playing', t: 0 } }), THROW, FIXED_DT);
    expect(g.held).toBe(2);
    expect(g.thrown).toHaveLength(0);
  });

  it('静止して投げると、水平に約 245 px 進んで、地面に当たって消える', () => {
    const p = createPlayer(1000);
    let t = throwCoconut(p, 1);
    const x0 = t.x;
    const y0 = t.y;
    let steps = 0;
    while (steps < 200) {
      t = stepThrown(t, FIXED_DT);
      steps++;
      if (thrownRect(t).y + thrownRect(t).h >= GROUND_Y) break;
    }
    expect(t.x - x0).toBeGreaterThan(200);
    expect(t.x - x0).toBeLessThan(300);
    expect(y0).toBeLessThan(GROUND_Y);
    const g = run(arena({ held: 1 }), THROW, 1);
    expect(g.thrown).toHaveLength(1);
    expect(run(g, NO_INPUT, 60).thrown).toHaveLength(0);
  });

  it('走りながら投げると、静止して投げたときより、水平の速さが大きい(プレイヤーの速さの半分が加わる)', () => {
    const still = throwCoconut({ x: 0, y: 0, vx: 0 }, 1);
    const run280 = throwCoconut({ x: 0, y: 0, vx: 280 }, 1);
    expect(run280.vx).toBe(still.vx + 140);
    expect(run280.vx).toBe(560);
  });

  it('重力で、上向きの速さが毎秒 1200 ずつ減る', () => {
    const t = stepThrown({ x: 0, y: 0, vx: 0, vy: -350 }, 1);
    expect(t.vy).toBe(-350 + COCONUT_GRAVITY);
  });

  it('柱に当たって消え、柱は壊れない', () => {
    const w = STAGE.pillars[0]!;
    let g = createGame();
    g = { ...g, player: createPlayer(w.x - 120), held: 1, intro: { state: 'done', t: 3 } };
    g = run(g, THROW, 1);
    g = run(g, NO_INPUT, 90);
    expect(g.thrown).toHaveLength(0);
    expect(g.pillars[0]!.alive).toBe(true);
  });

  it('投げたヤシの実が、ザコ敵に当たって、倒す(実は消える)', () => {
    const g0 = createGame(undefined, { bosses: [], enemies: [{ kind: 'plodder', x: 1250, left: 1250, right: 1250 }] });
    let g: GameState = { ...g0, player: createPlayer(1000), held: 1 };
    g = run(g, THROW, 1);
    g = run(g, NO_INPUT, 40);
    expect(g.enemies[0]!.alive).toBe(false);
    expect(g.thrown).toHaveLength(0);
  });
});

describe('投げてからの経過時間(throwT)', () => {
  it('初めは「投げていない」を表す大きな値で、再プレイでも同じ', () => {
    expect(createGame().throwT).toBe(THROW_IDLE_T);
  });

  it('投げた更新で 0 になり、更新のたびに増える', () => {
    let g = stepGame(arena({ held: 2 }), THROW, FIXED_DT);
    expect(g.throwT).toBe(0);
    g = stepGame(g, NO_INPUT, FIXED_DT);
    expect(g.throwT).toBeCloseTo(FIXED_DT, 9);
    g = run(g, NO_INPUT, 30);
    expect(g.throwT).toBeCloseTo(31 * FIXED_DT, 6);
  });

  it('手持ちが 0 個で押しても、経過時間は 0 にならない', () => {
    const g = stepGame(arena({ held: 0 }), THROW, FIXED_DT);
    expect(g.throwT).toBeGreaterThan(1);
  });

  it('投げる位置・速さ・手持ちの変化は、動きの有無に関係なく同じ', () => {
    const g = stepGame(arena({ held: 2 }), THROW, FIXED_DT);
    expect(g.held).toBe(1);
    expect(g.thrown).toHaveLength(1);
    expect(g.thrown[0]!.vx).toBeCloseTo(420, 6);
  });
});

describe('練習用の的', () => {
  it('ヤシの実が当たると反応して(光って)消え、0.4 秒後に戻る。何度でも当てられる', () => {
    const target = { x: 1100, y: GROUND_Y - 100, w: 40, h: 40 };
    let g: GameState = { ...arena({ held: 2, target }), player: createPlayer(1000) };
    g = run(g, THROW, 1);
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      g = stepGame(g, NO_INPUT, FIXED_DT);
      if (g.targetFlash > 0) hit = true;
    }
    expect(hit).toBe(true);
    expect(g.thrown).toHaveLength(0);
    g = run(g, NO_INPUT, 30);
    expect(g.targetFlash).toBe(0);
    // 2 個目
    g = stepGame(g, THROW, FIXED_DT);
    expect(g.held).toBe(0);
  });
});

// ---- ザコ敵とボスに当たる(coconut-damage-all) ----

describe('ヤシの実が当たる相手とダメージ(1)', () => {
  /** 動かない相手の矩形の中心に、止まったヤシの実を置いた世界(次の更新で命中する)。 */
  const nothing = { bosses: [], enemies: [] };
  const world = (over: Partial<GameState>): GameState => ({
    ...createGame(undefined, nothing),
    player: createPlayer(100),
    ...over,
  });
  const at = (x: number, y: number) => ({ x, y, vx: 0, vy: 0 });
  const stillBoss = (def: number, over: Partial<Boss> = {}): Boss => ({
    ...createBoss(1000, 1000, 1000, GROUND_Y, BOSS_DEFS[def]!),
    vx: 0,
    ...over,
  });

  it('ダメージの定数は 1', () => {
    expect(COCONUT_DAMAGE).toBe(1);
  });

  it('ザコ敵は、1 回で倒れ、ヤシの実は消え、部品は落ちない', () => {
    const e = createEnemy('plodder', 1000, 1000, 1000);
    const g = stepGame(world({ enemies: [e], thrown: [at(1010, GROUND_Y - 30)] }), NO_INPUT, FIXED_DT);
    expect(g.enemies[0]!.alive).toBe(false);
    expect(g.thrown).toHaveLength(0);
    expect(g.parts).toHaveLength(0);
  });

  it('隠れているザコ敵には当たらず、通り抜ける', () => {
    const e = { ...createEnemy('hider', 1000, 1000, 1000), phase: 'hidden' as const, hidden: true };
    const g = stepGame(world({ enemies: [e], thrown: [at(1010, GROUND_Y - 30)] }), NO_INPUT, FIXED_DT);
    expect(g.enemies[0]!.alive).toBe(true);
    expect(g.thrown).toHaveLength(1);
  });

  it('ボス(ヌシ以外)は、体力が 1 減り、ヤシの実は消える', () => {
    const b = stillBoss(0); // 体力 3
    const g = stepGame(world({ bosses: [b], thrown: [at(1020, b.y + 40)] }), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(b.hp - 1);
    expect(g.thrown).toHaveLength(0);
  });

  it('体力 1 のボスを倒すと、部品が 1 個落ちる', () => {
    const b = stillBoss(0, { hp: 1 });
    const g = stepGame(world({ bosses: [b], thrown: [at(1020, b.y + 40)] }), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.alive).toBe(false);
    expect(g.parts).toHaveLength(1);
  });

  it('命中の直後(無敵時間)は、続けて当たってもダメージを受けず、ヤシの実は消える', () => {
    const b = stillBoss(0);
    let g = stepGame(world({ bosses: [b], thrown: [at(1020, b.y + 40)] }), NO_INPUT, FIXED_DT);
    g = stepGame({ ...g, thrown: [at(1020, b.y + 40)] }, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(b.hp - 1);
    expect(g.thrown).toHaveLength(0);
    // 無敵時間が終われば、また減る
    for (let i = 0; i < Math.round(BOSS_INVULN_TIME * 60) + 2; i++) g = stepGame(g, NO_INPUT, FIXED_DT);
    g = stepGame({ ...g, thrown: [at(1020, g.bosses[0]!.y + 40)] }, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(b.hp - 2);
  });

  it('転がっているボス(踏めない)にも当たる', () => {
    // ボス 8 番目(コロリン)の行動の流れの中の、転がる段階
    const def = BOSS_DEFS.findIndex((d) => d.kind === 'kororin');
    const base = stillBoss(def);
    const rollStep = base.script.findIndex((s) => s.a === 'roll');
    expect(rollStep).toBeGreaterThanOrEqual(0);
    const b = { ...base, step: rollStep, t: 0 };
    const g = stepGame(world({ bosses: [b], thrown: [at(b.x + 20, b.y + 40)] }), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(b.hp - 1);
  });

  it('もぐっているボスには当たらず、通り抜ける', () => {
    const base = stillBoss(0);
    const burrowStep = base.script.findIndex((s) => s.a === 'burrow');
    expect(burrowStep).toBeGreaterThanOrEqual(0);
    const b = { ...base, step: burrowStep, t: 0 };
    const g = stepGame(world({ bosses: [b], thrown: [at(1020, b.y + 40)] }), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(b.hp);
    expect(g.thrown).toHaveLength(1);
  });

  it('ヌシの体(弱点のない状態)に当たってもダメージはなく、ヤシの実は消える', () => {
    const b: Boss = { ...createBoss(1000, 1000, 1000, GROUND_Y, BOSS_DEFS[9]!), vx: 0 };
    const g = stepGame(world({ bosses: [b], thrown: [at(1020, b.y + 100)] }), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(12);
    expect(g.thrown).toHaveLength(0);
  });

  it('プレイヤーには当たらず、通り抜ける', () => {
    const p = createPlayer(1000);
    const g = stepGame(world({ player: p, thrown: [at(1010, p.y + 20)] }), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(createGame().hp);
    expect(g.thrown).toHaveLength(1);
  });
});
