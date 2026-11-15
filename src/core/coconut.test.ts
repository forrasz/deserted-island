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

  it('ザコ敵には当たらず、通り抜ける', () => {
    const g0 = createGame(undefined, { bosses: [], enemies: [{ kind: 'plodder', x: 1100, left: 1100, right: 1100 }] });
    let g: GameState = { ...g0, player: createPlayer(1000), held: 1 };
    g = run(g, THROW, 1);
    const hp = g.enemies[0]!.alive;
    g = run(g, NO_INPUT, 10);
    expect(g.enemies[0]!.alive).toBe(hp);
    expect(g.thrown).toHaveLength(1);
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
