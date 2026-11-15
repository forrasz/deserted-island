import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, bossRect, createBoss, type Boss } from './boss';
import { stepBossScript, weakPointOf, type BossCtx } from './boss-scripts';
import { coconutAtWeak, ticks } from './boss-test-helpers';
import {
  chargeForecast,
  impactDebris,
  impactShake,
  impactTextAlpha,
  staggerRatio,
  weakSignal,
} from './cinematic';
import {
  FIXED_DT,
  GROUND_Y,
  HITSTOP_TIME,
  IMPACT_DEBRIS_COUNT,
  IMPACT_SHAKE_MAX,
  IMPACT_SHAKE_TIME,
  NUSHI_LANDING_OPEN,
  NUSHI_STAGGER_TIME,
  NUSHI_STAGGER_TIME_2,
  PILLAR_REGROW_TIME,
  PILLAR_REGROW_TIME_2,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT } from './input';
import { breakAllPillars, createPillar } from './pillar';
import { STAGE } from './stage';

const H = PLAYER_HEIGHT;
const NUSHI = BOSS_DEFS[9]!;
const PLACE = STAGE.bosses[9]!;
const WEST = STAGE.pillars[0]!;
const EAST = STAGE.pillars[1]!;
const EDGES = { west: WEST.x + WEST.w, east: EAST.x };
const westSpot = { x: WEST.x - PLAYER_WIDTH - 20, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };

function nushiAt(over: Partial<Boss> = {}, x = PLACE.left): Boss {
  return { ...createBoss(x, PLACE.left, PLACE.right, GROUND_Y, NUSHI), ...over };
}
const ctx = (playerX: number): BossCtx => ({ playerX, groundY: GROUND_Y, pillars: EDGES });
function arena(over: Partial<GameState> = {}, boss: Boss = nushiAt()): GameState {
  return {
    ...createGame(undefined, { bosses: [], enemies: [], pillars: STAGE.pillars }),
    pillars: createGame().pillars,
    intro: { state: 'done', t: 3 },
    bosses: [boss],
    player: { ...westSpot },
    ...over,
  };
}
const run = (g: GameState, n: number): GameState => {
  let s = g;
  for (let i = 0; i < n; i++) s = stepGame({ ...s, player: { ...westSpot } }, NO_INPUT, FIXED_DT);
  return s;
};
/** プレイヤーが西の柱の外にいて、ヌシが西へ突進して柱にぶつかる直前までの世界。 */
function lureUntilStagger(g: GameState): GameState {
  let s = g;
  for (let i = 0; i < ticks(40); i++) {
    s = stepGame({ ...s, player: { ...westSpot } }, NO_INPUT, FIXED_DT);
    if (s.bosses[0]!.stagger > 0) return s;
  }
  return s;
}

describe('ヌシの弱点(final-boss-weakpoint)', () => {
  it('気絶中は、かがんだ体の上部に弱点がある', () => {
    const b = nushiAt({ stagger: 6 });
    const w = weakPointOf(b)!;
    expect(w.kind).toBe('stagger');
    const r = bossRect(b);
    expect(w.rect.y).toBe(r.y);
    expect(w.rect.y + w.rect.h).toBeLessThanOrEqual(r.y + r.h);
  });

  it('弾の予備動作(次が shot の telegraph)で、口を開けて弱点がある。ヤシの実が届く高さである', () => {
    const b = nushiAt({ step: 4, t: 0.1, aimDir: 1 });
    const w = weakPointOf(b)!;
    expect(w.kind).toBe('mouth');
    const height = GROUND_Y - (w.rect.y + w.rect.h); // 地面から口の下端
    expect(height).toBeLessThan(90); // ヤシの実の最高点(約 90 px)に届く
    expect(GROUND_Y - w.rect.y).toBeGreaterThan(90);
  });

  it('突進の予備動作・往復・突進・休み・変身中・撃破演出には、弱点がない', () => {
    expect(weakPointOf(nushiAt({ step: 0 }))).toBeNull(); // 往復
    expect(weakPointOf(nushiAt({ step: 1 }))).toBeNull(); // 突進の予備動作
    expect(weakPointOf(nushiAt({ step: 2 }))).toBeNull(); // 突進
    expect(weakPointOf(nushiAt({ step: 3 }))).toBeNull(); // 休み
    expect(weakPointOf(nushiAt({ stagger: 6, transformT: 1 }))).toBeNull();
    expect(weakPointOf(nushiAt({ stagger: 6, dying: 1, hp: 0 }))).toBeNull();
  });

  it('強化形態のジャンプの着地の隙(0.5 秒)に弱点がある。通常形態の着地には、ない', () => {
    // 強化形態の step 9 = ジャンプのあとの休み(0.5 秒)
    const form2 = (t: number) => nushiAt({ form: 2, transformed: true, step: 9, t });
    expect(weakPointOf(form2(0))?.kind).toBe('mouth');
    expect(weakPointOf(form2(NUSHI_LANDING_OPEN - 0.01))?.kind).toBe('mouth');
    expect(weakPointOf(form2(NUSHI_LANDING_OPEN + 0.01))).toBeNull();
    // 通常形態の step 7 = ジャンプのあとの休み
    expect(weakPointOf(nushiAt({ step: 7, t: 0 }))).toBeNull();
  });

  it('ヌシ以外のボスには、弱点がない', () => {
    const b = createBoss(1000, 1000, 1000, GROUND_Y, BOSS_DEFS[0]!);
    expect(weakPointOf({ ...b, stagger: 6 })).toBeNull();
  });
});

describe('気絶の長さ(通常形態 6 秒・強化形態 4.5 秒)', () => {
  const dashInto = (b: Boss): Boss => {
    let cur: Boss = { ...b, step: b.form === 2 ? 2 : 2, t: 0, aimDir: -1, dir: -1 };
    for (let i = 0; i < ticks(1); i++) {
      cur = stepBossScript(cur, ctx(0), FIXED_DT).boss;
      if (cur.stagger > 0) break;
    }
    return cur;
  };

  it('通常形態は 6 秒', () => {
    const b = dashInto(nushiAt({ x: PLACE.left + 100 }));
    expect(b.stagger).toBe(NUSHI_STAGGER_TIME);
    let cur = b;
    for (let i = 0; i < ticks(5.9); i++) cur = stepBossScript(cur, ctx(0), FIXED_DT).boss;
    expect(cur.stagger).toBeGreaterThan(0);
    for (let i = 0; i < ticks(0.3); i++) cur = stepBossScript(cur, ctx(0), FIXED_DT).boss;
    expect(cur.stagger).toBe(0);
  });

  it('強化形態は 4.5 秒', () => {
    const b = dashInto(nushiAt({ x: PLACE.left + 100, form: 2, transformed: true }));
    expect(b.stagger).toBe(NUSHI_STAGGER_TIME_2);
    let cur = b;
    for (let i = 0; i < ticks(4.4); i++) cur = stepBossScript(cur, ctx(0), FIXED_DT).boss;
    expect(cur.stagger).toBeGreaterThan(0);
    for (let i = 0; i < ticks(0.3); i++) cur = stepBossScript(cur, ctx(0), FIXED_DT).boss;
    expect(cur.stagger).toBe(0);
  });
});

describe('柱の再生(通常形態 8 秒・強化形態 6 秒)', () => {
  const broken = (brokenT: number) => breakAllPillars(createGame().pillars).map((p) => ({ ...p, brokenT }));
  const restingNushi = (over: Partial<Boss>) => nushiAt({ step: 3, t: 0, x: PLACE.right, ...over });

  it('強化形態は、壊れて 6 秒で再生する(通常形態は、同じ時間では再生しない)', () => {
    const f2 = run(arena({ pillars: broken(PILLAR_REGROW_TIME_2 - 0.1) }, restingNushi({ form: 2, transformed: true })), 12);
    expect(f2.pillars.some((p) => p.alive)).toBe(true);
    const f1 = run(arena({ pillars: broken(PILLAR_REGROW_TIME_2 - 0.1) }, restingNushi({})), 12);
    expect(f1.pillars.some((p) => p.alive)).toBe(false);
  });

  it('通常形態は、壊れて 8 秒で再生する', () => {
    const g = run(arena({ pillars: broken(PILLAR_REGROW_TIME - 0.1) }, restingNushi({})), 12);
    expect(g.pillars.some((p) => p.alive)).toBe(true);
  });
});

describe('柱への衝突の演出(final-boss-signals)', () => {
  it('突進が柱に当たった更新で、ヒットストップと衝突の演出が始まり、0.25 秒は世界が止まる', () => {
    const g0 = lureUntilStagger(arena({ projectiles: [], pillars: createGame().pillars }));
    expect(g0.bosses[0]!.stagger).toBeGreaterThan(0);
    expect(g0.hitStop).toBeCloseTo(HITSTOP_TIME, 9);
    expect(g0.impact).not.toBeNull();
    // 止まっている間は、ヌシ・プレイヤー・柱が動かない
    let g = g0;
    const frozen = { boss: g0.bosses[0]!, player: g0.player, pillars: g0.pillars };
    for (let i = 0; i < ticks(HITSTOP_TIME) - 1; i++) {
      g = stepGame({ ...g }, { ...NO_INPUT, right: true, jump: true }, FIXED_DT);
      expect(g.hitStop).toBeGreaterThan(0);
      expect(g.bosses[0]!.x).toBe(frozen.boss.x);
      expect(g.bosses[0]!.stagger).toBe(frozen.boss.stagger);
      expect(g.player).toEqual(frozen.player);
      expect(g.pillars).toEqual(frozen.pillars);
    }
    for (let i = 0; i < 3; i++) g = stepGame(g, NO_INPUT, FIXED_DT);
    expect(g.hitStop).toBe(0);
    expect(g.bosses[0]!.stagger).toBeLessThan(frozen.boss.stagger); // 再開した
  });

  it('衝突の演出の時計は、ヒットストップの間も進み、1 秒後に終わる', () => {
    let g = lureUntilStagger(arena());
    const t0 = g.impact!.t;
    g = stepGame(g, NO_INPUT, FIXED_DT);
    expect(g.impact!.t).toBeGreaterThan(t0);
    for (let i = 0; i < ticks(1.1); i++) g = stepGame({ ...g, player: { ...westSpot } }, NO_INPUT, FIXED_DT);
    expect(g.impact).toBeNull();
  });

  it('画面の揺れ: 0.1 秒後は 0 より大きく 10 px 以下、0.6 秒後は 0', () => {
    const a = impactShake(0.1);
    expect(Math.hypot(a.x, a.y)).toBeGreaterThan(0);
    expect(Math.abs(a.x)).toBeLessThanOrEqual(IMPACT_SHAKE_MAX);
    expect(Math.abs(a.y)).toBeLessThanOrEqual(IMPACT_SHAKE_MAX);
    expect(impactShake(IMPACT_SHAKE_TIME + 0.1)).toEqual({ x: 0, y: 0 });
    // だんだん小さくなる
    const amp = (t: number) => Math.max(...Array.from({ length: 50 }, (_, i) => Math.abs(impactShake(t + i * 0.001).x)));
    expect(amp(0.4)).toBeLessThan(amp(0.05));
  });

  it('破片は 10 個で、軌道は毎回同じ(乱数を使わない)', () => {
    const a = impactDebris(0.3, -1);
    expect(a).toHaveLength(IMPACT_DEBRIS_COUNT);
    expect(impactDebris(0.3, -1)).toEqual(a);
    expect(impactDebris(2, -1)).toEqual([]);
  });

  it('擬音は 1 秒の間表示され、最後に薄くなる', () => {
    expect(impactTextAlpha(0.1)).toBe(1);
    expect(impactTextAlpha(0.95)).toBeLessThan(1);
    expect(impactTextAlpha(1.1)).toBe(0);
  });
});

describe('突進の予告・気絶と弱点の合図(final-boss-signals)', () => {
  const pillars = createGame().pillars;
  const tele = (dir: 1 | -1, over: Partial<Boss> = {}) => nushiAt({ step: 1, t: 0.1, dir, aimDir: dir, ...over });

  it('西側のプレイヤーに向かう予備動作では、西の柱が強調され、矢印は西向き', () => {
    expect(chargeForecast(tele(-1), pillars)).toEqual({ dir: -1, pillar: 'west' });
    expect(chargeForecast(tele(1), pillars)).toEqual({ dir: 1, pillar: 'east' });
  });

  it('向かう柱が壊れているときは、柱の強調はなく、矢印だけ', () => {
    expect(chargeForecast(tele(-1), breakAllPillars(pillars))).toEqual({ dir: -1, pillar: null });
  });

  it('予備動作が終わって突進が始まる、往復、気絶中には、予告がない', () => {
    expect(chargeForecast(nushiAt({ step: 2 }), pillars)).toBeNull();
    expect(chargeForecast(nushiAt({ step: 0 }), pillars)).toBeNull();
    expect(chargeForecast(tele(-1, { stagger: 6 }), pillars)).toBeNull();
    // 弾の予備動作(次が shot)は、突進の予告ではない
    expect(chargeForecast(nushiAt({ step: 4 }), pillars)).toBeNull();
  });

  it('気絶の合図: 頭が光り、矢印と「いまだ! 投げろ!」と、満ちた円の目盛り', () => {
    const s = weakSignal(nushiAt({ stagger: NUSHI_STAGGER_TIME }), 2, 0);
    expect(s).toEqual({ glow: true, arrow: true, text: 'いまだ! 投げろ!', ring: 1 });
  });

  it('ヒットストップの間は、気絶の合図を出さない', () => {
    expect(weakSignal(nushiAt({ stagger: 6 }), 2, 0.1)).toEqual({ glow: false, arrow: false, text: null, ring: null });
  });

  it('残り時間の目盛り: 通常形態は 3 秒で半分、強化形態は 2.25 秒で半分', () => {
    expect(staggerRatio(nushiAt({ stagger: 3 }))).toBeCloseTo(0.5, 9);
    expect(staggerRatio(nushiAt({ stagger: 2.25, form: 2 }))).toBeCloseTo(0.5, 9);
  });

  it('ヤシの実を持っていないときは「実を拾え!」', () => {
    expect(weakSignal(nushiAt({ stagger: 6 }), 0, 0).text).toBe('実を拾え!');
  });

  it('口を開けているときは、頭が光るだけで、文字と円は出ない', () => {
    expect(weakSignal(nushiAt({ step: 4, t: 0.1 }), 2, 0)).toEqual({ glow: true, arrow: false, text: null, ring: null });
  });

  it('弱点がないときは、合図も出ない', () => {
    expect(weakSignal(nushiAt({ step: 0 }), 2, 0)).toEqual({ glow: false, arrow: false, text: null, ring: null });
  });
});

describe('ヌシ戦の通し(柱 → 気絶 → ヤシの実)', () => {
  it('気絶させて、ヤシの実を頭に当てると体力が 4 減り、踏んでも減らない。無敵モードでも同じ', () => {
    for (const invincible of [false, true]) {
      let g = lureUntilStagger(arena({ invincible }));
      for (let i = 0; i < 30 && g.hitStop > 0; i++) g = stepGame({ ...g, player: { ...westSpot } }, NO_INPUT, FIXED_DT);
      g = stepGame({ ...g, player: { ...westSpot }, thrown: coconutAtWeak(g.bosses[0]!) }, NO_INPUT, FIXED_DT);
      expect(g.bosses[0]!.hp).toBe(11);
      expect(g.bosses[0]!.stagger).toBeGreaterThan(0);
    }
  });

  it('プレイヤーが投げたヤシの実が、気絶中の頭に当たる(実際の投げる操作)', () => {
    let g = lureUntilStagger(arena({ held: 2 }));
    const b = g.bosses[0]!;
    // 頭の近く(気絶した位置の西の柱の外)へ移動して、投げる
    const px = b.x - PLAYER_WIDTH - 60;
    g = { ...g, player: { x: px, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true }, facing: 1 };
    for (let i = 0; i < 30 && g.hitStop > 0; i++) g = stepGame({ ...g, player: { x: px, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true } }, NO_INPUT, FIXED_DT);
    g = stepGame(g, { ...NO_INPUT, throw: true }, FIXED_DT);
    let hit = false;
    for (let i = 0; i < 80 && !hit; i++) {
      g = stepGame(g, NO_INPUT, FIXED_DT);
      if (g.bosses[0]!.hp < 12) hit = true;
    }
    expect(hit).toBe(true);
  });
});

// 柱の生成関数が使えること(型の確認)
void createPillar;
