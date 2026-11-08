import { describe, expect, it } from 'vitest';
import { bossRect, BOSS_DEFS, createBoss, type Boss } from './boss';
import { bossFlags, NUSHI_FORM1, stepBossScript, type BossCtx } from './boss-scripts';
import { finishDying, ticks } from './boss-test-helpers';
import type { Rect } from './collision';
import {
  FIXED_DT,
  FINAL_PILLAR_HEIGHT,
  FINAL_PILLAR_WIDTH,
  GROUND_Y,
  NUSHI_STAGGER_TIME,
  PILLAR_REGROW_TIME,
  PLAYER_HEIGHT,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { breakAllPillars, breakPillar, createPillar, pillarEdges, standingPillarRects, stepPillars } from './pillar';
import { createWave } from './projectile';
import { STAGE } from './stage';
import { validatePlacements } from './stage-check';

const H = PLAYER_HEIGHT;
const W = PLAYER_WIDTH;
const NUSHI = BOSS_DEFS[9]!;
const PLACE = STAGE.bosses[9]!;
const WEST = STAGE.pillars[0]!; // 西の入口の柱
const EAST = STAGE.pillars[1]!; // 東の出口の柱
const WEST_EDGE = WEST.x + WEST.w; // 西の柱の東の縁(= 往復範囲の左端)
const EAST_EDGE = EAST.x; // 東の柱の西の縁
const RIGHT: InputState = { ...NO_INPUT, right: true };
const JUMP: InputState = { ...NO_INPUT, jump: true };
const EDGES = { west: WEST_EDGE, east: EAST_EDGE };

const westSpot = { x: WEST.x - W - 20, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };
const eastSpot = { x: EAST.x + EAST.w + 20, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };

function nushiAt(over: Partial<Boss> = {}, x = PLACE.left): Boss {
  return { ...createBoss(x, PLACE.left, PLACE.right, GROUND_Y, NUSHI), ...over };
}
const ctx = (playerX: number, pillars: BossCtx['pillars'] = EDGES): BossCtx => ({ playerX, groundY: GROUND_Y, pillars });

/** 予備動作(0.8 秒)を終えて、突進の最初の状態にしたヌシ。player が西なら西向き、東なら東向き。 */
function dashing(b: Boss, playerX: number, pillars: BossCtx['pillars'] = EDGES): Boss {
  let cur: Boss = { ...b, step: 1, t: 0 }; // step 1 = telegraph
  for (let i = 0; i < ticks(0.8) + 2; i++) cur = stepBossScript(cur, ctx(playerX, pillars), FIXED_DT).boss;
  return cur;
}

describe('ステージの柱の配置', () => {
  it('柱は 2 本(西の入口・東の出口)で、大きさは幅 60・高さ 180、地面の上に立つ', () => {
    expect(STAGE.pillars).toHaveLength(2);
    for (const p of STAGE.pillars) {
      expect([p.w, p.h]).toEqual([FINAL_PILLAR_WIDTH, FINAL_PILLAR_HEIGHT]);
      expect(p.y + p.h).toBe(GROUND_Y);
    }
  });

  it('西の柱の東の縁が往復範囲の左端、東の柱の西の縁がヌシの本体の右端(範囲の右端 + 200)で、範囲の幅は 300', () => {
    expect(WEST_EDGE).toBe(PLACE.left);
    expect(EAST_EDGE).toBe(PLACE.right + PLACE.def.w);
    expect(PLACE.right - PLACE.left).toBe(300);
  });

  it('柱の高さ(180)は、ジャンプの最高点(約 140)より高い', () => {
    expect(FINAL_PILLAR_HEIGHT).toBeGreaterThan((750 * 750) / (2 * 2000));
  });
});

describe('突進が柱に当たると気絶する(boss-scripts)', () => {
  const dashUntilStagger = (b: Boss, playerX: number, pillars: BossCtx['pillars'] = EDGES): Boss => {
    let cur = b;
    for (let i = 0; i < ticks(1.0); i++) {
      cur = stepBossScript(cur, ctx(playerX, pillars), FIXED_DT).boss;
      if (cur.stagger > 0) break;
    }
    return cur;
  };

  it('西向きの突進が、往復範囲の左端(西の柱)に達すると、気絶に入る', () => {
    const b = dashing(nushiAt({}, PLACE.left + 150), WEST.x - 50);
    expect(b.aimDir).toBe(-1);
    const cur = dashUntilStagger(b, WEST.x - 50);
    expect(cur.stagger).toBeCloseTo(NUSHI_STAGGER_TIME, 1);
    expect(cur.x).toBeCloseTo(PLACE.left, 6);
    expect(bossFlags(cur).staggered).toBe(true);
  });

  it('東向きの突進が、本体の右端が東の柱に達すると、気絶に入る', () => {
    const b = dashing(nushiAt({}, PLACE.left + 150), EAST.x + 200);
    expect(b.aimDir).toBe(1);
    const cur = dashUntilStagger(b, EAST.x + 200);
    expect(cur.stagger).toBeCloseTo(NUSHI_STAGGER_TIME, 1);
    expect(cur.x + cur.w).toBeCloseTo(EAST_EDGE, 6);
  });

  it('柱がなければ、突進は範囲の端で止まるだけで、気絶しない', () => {
    const none = { west: null, east: null };
    const w = dashUntilStagger(dashing(nushiAt({}, PLACE.left + 150), WEST.x - 50, none), WEST.x - 50, none);
    const e = dashUntilStagger(dashing(nushiAt({}, PLACE.left + 150), EAST.x + 200, none), EAST.x + 200, none);
    expect([w.stagger, e.stagger]).toEqual([0, 0]);
  });

  it('向かう側の柱だけが当たる(西向きの突進で、西の柱がなければ、東の柱があっても気絶しない)', () => {
    const onlyEast = { west: null, east: EAST_EDGE };
    const cur = dashUntilStagger(dashing(nushiAt({}, PLACE.left + 150), WEST.x - 50, onlyEast), WEST.x - 50, onlyEast);
    expect(cur.stagger).toBe(0);
  });

  it('気絶中は、その場で動かず、弾も衝撃波も出さない', () => {
    let b = nushiAt({ stagger: 6 });
    const x = b.x;
    for (let i = 0; i < ticks(5.5); i++) {
      const r = stepBossScript(b, ctx(WEST.x - 50), FIXED_DT);
      expect(r.spawns).toEqual([]);
      b = r.boss;
      expect(b.x).toBe(x);
    }
    expect(b.stagger).toBeGreaterThan(0);
  });

  it('6 秒たつと回復し、通常の行動の最初(往復)から始める', () => {
    let b = nushiAt({ stagger: 6, step: 5, t: 0.3 });
    for (let i = 0; i < ticks(6) + 2; i++) b = stepBossScript(b, ctx(WEST.x - 50), FIXED_DT).boss;
    expect(b.stagger).toBe(0);
    expect(NUSHI_FORM1[b.step]!.a).toBe('patrol');
  });

  it('通常ボスの突進は、柱があっても気絶しない', () => {
    const oogui = createBoss(1000, 1000, 1400, GROUND_Y, BOSS_DEFS[2]!);
    let cur: Boss = { ...oogui, step: 1, t: 0, aimDir: -1, x: 1200 };
    for (let i = 0; i < ticks(1.5); i++) cur = stepBossScript(cur, ctx(500, { west: 1000, east: 1480 }), FIXED_DT).boss;
    expect(cur.stagger).toBe(0);
  });
});

describe('柱の基本動作(pillar.ts)', () => {
  const pillars = STAGE.pillars.map((r) => createPillar(r, (PLACE.left + PLACE.right + PLACE.def.w) / 2));

  it('西の柱と東の柱に分かれる', () => {
    expect(pillars.map((p) => p.side)).toEqual(['west', 'east']);
  });

  it('立っている柱の矩形と縁が分かる。壊れると、なくなる', () => {
    expect(standingPillarRects(pillars)).toHaveLength(2);
    expect(pillarEdges(pillars)).toEqual(EDGES);
    const w = breakPillar(pillars, 'west');
    expect(pillarEdges(w)).toEqual({ west: null, east: EAST_EDGE });
    expect(pillarEdges(breakAllPillars(pillars))).toEqual({ west: null, east: null });
  });

  const base = {
    anyStaggered: false,
    blockers: [] as Rect[],
    playerLeft: WEST.x - 60,
    playerRight: WEST.x - 20,
    bossAlive: true,
  };
  const regrown = (broken: ReturnType<typeof breakPillar>, c: typeof base, sec: number) => {
    let ps = broken;
    for (let i = 0; i < ticks(sec) + 2; i++) ps = stepPillars(ps, c, FIXED_DT);
    return ps;
  };

  it('壊れてから 8 秒より前は、条件が整っていても再生しない', () => {
    expect(regrown(breakPillar(pillars, 'west'), base, PILLAR_REGROW_TIME - 1)[0]!.alive).toBe(false);
  });

  it('西の柱は、8 秒たち、プレイヤーが西側にいて、条件が整うと再生する', () => {
    expect(regrown(breakPillar(pillars, 'west'), base, PILLAR_REGROW_TIME)[0]!.alive).toBe(true);
  });

  it('東の柱は、プレイヤーが東側にいるときに再生する(西側では再生しない)', () => {
    const east = { ...base, playerLeft: EAST.x + EAST.w + 20, playerRight: EAST.x + EAST.w + 60 };
    expect(regrown(breakPillar(pillars, 'east'), east, PILLAR_REGROW_TIME)[1]!.alive).toBe(true);
    expect(regrown(breakPillar(pillars, 'east'), base, PILLAR_REGROW_TIME)[1]!.alive).toBe(false);
  });

  const blocked = (over: Partial<typeof base>) =>
    regrown(breakPillar(pillars, 'west'), { ...base, ...over }, PILLAR_REGROW_TIME)[0]!.alive;
  it('ヌシが気絶している間は、再生しない', () => {
    expect(blocked({ anyStaggered: true })).toBe(false);
  });
  it('プレイヤーが柱の位置に重なっている間は、再生しない', () => {
    expect(blocked({ blockers: [{ x: WEST.x + 10, y: WEST.y + 50, w: 40, h: 56 }] })).toBe(false);
  });
  it('ヌシが柱の位置に重なっている間は、再生しない', () => {
    expect(blocked({ blockers: [{ x: WEST.x - 100, y: GROUND_Y - 100, w: 200, h: 100 }] })).toBe(false);
  });
  it('プレイヤーが闘技場の中(柱の内側)にいる間は、再生しない', () => {
    expect(blocked({ playerLeft: WEST_EDGE + 100, playerRight: WEST_EDGE + 140 })).toBe(false);
  });
  it('ヌシが倒されたあとは、再生しない', () => {
    expect(blocked({ bossAlive: false })).toBe(false);
  });
  it('立っている柱は、そのまま変わらない', () => {
    expect(stepPillars(pillars, base, FIXED_DT)[0]).toBe(pillars[0]);
  });
});

// ---- ゲームの中での柱 ----

function arena(over: Partial<GameState> = {}, boss: Boss = nushiAt()): GameState {
  return {
    ...createGame(undefined, { bosses: [], enemies: [], pillars: STAGE.pillars }),
    // ヌシの範囲から、柱の西・東を決めるため、ヌシの配置を渡して作った柱を使う
    pillars: createGame().pillars,
    intro: { state: 'done', t: 3 }, // 登場演出は済んだ状態から始める
    bosses: [boss],
    player: { ...westSpot },
    ...over,
  };
}
function run(g: GameState, n: number, input: InputState = NO_INPUT): GameState {
  let s = g;
  for (let i = 0; i < n; i++) s = stepGame(s, input, FIXED_DT);
  return s;
}
const deadNushi = () => nushiAt({ alive: false, hp: 0 });

describe('柱は通れない地形(game)', () => {
  it('ゲーム開始時には、闘技場の入口と出口に、柱が 1 本ずつ立っている', () => {
    const g = createGame();
    expect(g.pillars.map((p) => [p.side, p.alive])).toEqual([['west', true], ['east', true]]);
  });

  it('西から来たプレイヤーは、西の柱の手前で止まり、ジャンプしても越えられない', () => {
    let g = arena({}, nushiAt({ x: PLACE.right, alive: true, hp: 12, stagger: 6 })); // 気絶中で動かないヌシ
    g = { ...g, bosses: [{ ...g.bosses[0]!, alive: false }] };
    for (let i = 0; i < 240; i++) g = stepGame(g, i % 50 < 2 ? { ...RIGHT, ...JUMP } : RIGHT, FIXED_DT);
    expect(g.player.x + W).toBeLessThanOrEqual(WEST.x + 1e-6);
  });

  it('西の柱が壊れていれば、通り抜けて、闘技場の中へ入れる(東の柱の手前で止まる)', () => {
    let g = arena({ pillars: breakPillar(arena().pillars, 'west') }, deadNushi());
    g = { ...g, pillars: breakPillar(arena().pillars, 'west') };
    g = run(g, 400, RIGHT);
    expect(g.player.x).toBeGreaterThan(WEST_EDGE);
    expect(g.player.x + W).toBeLessThanOrEqual(EAST.x + 1e-6);
  });

  it('ヌシがいなくなったあとは(柱がすべて崩れていれば)、東へ通り抜けられる', () => {
    let g = arena({}, deadNushi());
    g = { ...g, pillars: breakAllPillars(g.pillars) };
    g = run(g, 600, RIGHT);
    expect(g.player.x).toBeGreaterThan(EAST.x + EAST.w);
  });
});

describe('柱は弾と衝撃波を止める(game)', () => {
  it('東から来た衝撃波は、西の柱に当たって消え、柱の西側のプレイヤーには当たらない', () => {
    const wave = createWave(PLACE.left + 20, GROUND_Y, -300);
    let g = arena({ projectiles: [wave] }, deadNushi());
    g = run(g, 60);
    expect(g.projectiles).toHaveLength(0);
    expect(g.hp).toBe(PLAYER_MAX_HP);
  });

  it('柱が壊れていれば、衝撃波はそのまま進む', () => {
    const wave = createWave(PLACE.left + 20, GROUND_Y, -300);
    let g = arena({ projectiles: [wave], player: { ...westSpot, x: 23000 } }, deadNushi());
    g = { ...g, pillars: breakAllPillars(g.pillars) };
    g = run(g, 10);
    expect(g.projectiles).toHaveLength(1);
  });
});

describe('柱を使った戦い(game)', () => {
  /** プレイヤーを spot に立たせたまま、ヌシが気絶するまで進める。 */
  function lureUntilStagger(g: GameState, spot: typeof westSpot, maxSec = 40): GameState {
    let s = g;
    for (let i = 0; i < ticks(maxSec); i++) {
      s = stepGame({ ...s, player: { ...spot } }, NO_INPUT, FIXED_DT);
      if (s.bosses[0]!.stagger > 0) return s;
    }
    return s;
  }
  /** 気絶中のヌシを、かがんだ上辺へ落ちて踏む。 */
  function stompStaggered(g: GameState): GameState {
    const r = bossRect(g.bosses[0]!);
    return stepGame(
      { ...g, player: { x: g.bosses[0]!.x + 90, y: r.y - H - 5, vx: 0, vy: 300, onGround: false } },
      NO_INPUT,
      FIXED_DT,
    );
  }

  it('西の柱の手前に立つと、ヌシは西の柱へ突進して、柱が壊れ(衝撃で両方とも崩れ)、気絶する', () => {
    const g = lureUntilStagger(arena(), westSpot);
    expect(g.bosses[0]!.stagger).toBeGreaterThan(0);
    expect(g.pillars.map((p) => p.alive)).toEqual([false, false]); // 衝撃で、両方崩れる
    expect(g.hp).toBe(PLAYER_MAX_HP); // 柱に守られていて、被弾しない
  });

  it('東の柱の外側に立っても、ヌシは東の柱へ突進して、柱が壊れ(両方とも崩れ)、気絶する', () => {
    const g = lureUntilStagger(arena(), eastSpot);
    expect(g.bosses[0]!.stagger).toBeGreaterThan(0);
    expect(g.pillars.map((p) => p.alive)).toEqual([false, false]);
    expect(g.hp).toBe(PLAYER_MAX_HP);
  });

  it('柱を壊さずに、休みの間に踏んでも、ヌシの体力は減らない', () => {
    const b = nushiAt({ step: 3, t: 0 }); // 休み
    const g = stepGame(
      arena({ player: { x: b.x + 90, y: b.y - H - 5, vx: 0, vy: 300, onGround: false } }, b),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.bosses[0]!.hp).toBe(12);
  });

  it('誘って、踏む、を 3 回くり返すと、体力 12 のヌシが倒れ、部品が落ち、柱はすべて崩れて、もう立たない(2 回目で変身する)', () => {
    let g = arena();
    const hps: number[] = [];
    for (let round = 0; round < 3; round++) {
      g = lureUntilStagger(g, round % 2 === 0 ? westSpot : eastSpot, 60);
      expect(g.bosses[0]!.stagger).toBeGreaterThan(0);
      g = stompStaggered(g);
      hps.push(g.bosses[0]!.hp);
      if (round === 0) expect(g.bosses[0]!.transformed).toBe(false);
      if (g.bosses[0]!.alive) g = run({ ...g, player: { ...westSpot } }, ticks(2));
    }
    expect(hps).toEqual([8, 4, 0]);
    expect(g.bosses[0]!.alive).toBe(true); // 撃破演出の間
    g = finishDying(g);
    expect(g.bosses[0]!.alive).toBe(false);
    expect(g.parts.length + g.partsCollected).toBe(1);
    expect(g.pillars.every((p) => !p.alive)).toBe(true);
    g = run({ ...g, player: { ...westSpot } }, ticks(15));
    expect(g.pillars.every((p) => !p.alive)).toBe(true); // 倒したあとは、再生しない
  });

  it('柱が壊れたあと、プレイヤーが外側へ戻って 8 秒以上たつと、柱が再び立つ(立ったあと、また突進で壊れることもある)', () => {
    let g = lureUntilStagger(arena(), westSpot);
    g = stompStaggered(g); // 起き上がりのあと、気絶が解ける
    let regrew = false;
    for (let i = 0; i < ticks(12); i++) {
      g = stepGame({ ...g, player: { ...westSpot } }, NO_INPUT, FIXED_DT);
      if (g.pillars[0]!.alive) regrew = true;
    }
    expect(regrew).toBe(true);
  });

  it('プレイヤーが闘技場の中(西の柱の内側)にいる間は、西の柱は再生しない', () => {
    let g = lureUntilStagger(arena(), westSpot);
    g = stompStaggered(g);
    const inside = { x: WEST_EDGE + 20, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };
    for (let i = 0; i < ticks(12); i++) g = stepGame({ ...g, player: inside }, NO_INPUT, FIXED_DT);
    expect(g.pillars[0]!.alive).toBe(false);
  });
});

describe('起き上がり(気絶が解けるとき)', () => {
  it('踏まれたあと、0.5 秒は、続けて踏んでもダメージを受けない', () => {
    const b = nushiAt({ stagger: 6 });
    const r = bossRect(b);
    const stomp = (boss: Boss): GameState =>
      stepGame(
        {
          ...createGame(undefined, { bosses: [], enemies: [] }),
          bosses: [boss],
          player: { x: boss.x + 90, y: bossRect(boss).y - H - 5, vx: 0, vy: 300, onGround: false },
        },
        NO_INPUT,
        FIXED_DT,
      );
    expect(r.h).toBe(100);
    const first = stomp(b);
    expect(first.bosses[0]!.hp).toBe(8);
    const second = stomp(first.bosses[0]!);
    expect(second.bosses[0]!.hp).toBe(8); // ダメージなし
    expect(second.player.vy).toBeLessThan(0); // 跳ね返りだけ
  });

  it('プレイヤーが立った姿の矩形と重なっていると、離れるまで、かがんだまま起き上がらない', () => {
    const b = nushiAt({ stagger: 0.01 });
    const inside = { x: b.x + 80, y: GROUND_Y - 100 - H, vx: 0, vy: 0, onGround: true };
    let g: GameState = { ...arena({ player: inside }, b) };
    for (let i = 0; i < 30; i++) g = stepGame({ ...g, player: inside }, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.stagger).toBeGreaterThan(0);
    expect(bossRect(g.bosses[0]!).h).toBe(100);
    expect(g.hp).toBe(PLAYER_MAX_HP); // 被弾しない
    // 離れると、起き上がる
    const away = { x: WEST.x - 80, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };
    g = stepGame({ ...g, player: away }, NO_INPUT, FIXED_DT);
    g = stepGame({ ...g, player: away }, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.stagger).toBe(0);
    expect(bossRect(g.bosses[0]!).h).toBe(250);
  });
});

describe('ステージの検査(柱とヌシの闘技場)', () => {
  it('現在のステージは、検査を通る', () => {
    expect(validatePlacements(STAGE)).toEqual([]);
  });

  it('柱が 2 本ないと、違反を報告する', () => {
    expect(validatePlacements({ ...STAGE, pillars: [WEST] }).some((e) => e.includes('2 本'))).toBe(true);
  });

  it('西の柱の東の縁が、往復範囲の左端とずれていると、違反を報告する', () => {
    const bad = { ...STAGE, pillars: [{ ...WEST, x: WEST.x - 40 }, EAST] };
    expect(validatePlacements(bad).some((e) => e.includes('西の柱'))).toBe(true);
  });

  it('東の柱が、ヌシの本体の右端とずれていると、違反を報告する', () => {
    const bad = { ...STAGE, pillars: [WEST, { ...EAST, x: EAST.x + 40 }] };
    expect(validatePlacements(bad).some((e) => e.includes('東の柱'))).toBe(true);
  });

  it('往復範囲が突進の距離(400)より広いと、違反を報告する', () => {
    const wide = { ...STAGE.bosses[9]!, right: STAGE.bosses[9]!.left + 500 };
    const bad = { ...STAGE, bosses: [...STAGE.bosses.slice(0, 9), wide] };
    expect(validatePlacements(bad).some((e) => e.includes('突進'))).toBe(true);
  });
});
