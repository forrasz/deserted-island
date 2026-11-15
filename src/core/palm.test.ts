import { describe, expect, it } from 'vitest';
import { overlaps } from './collision';
import {
  COCONUT_RESPAWN_TIME,
  FIXED_DT,
  GRAVITY,
  GROUND_Y,
  JUMP_SPEED,
  PALM_CANOPY_HIGH,
  PALM_CANOPY_LOW,
  PALM_DROP_OFFSETS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { canopyRect, createPalm, stepPalms, trunkRect } from './palm';
import { createPlayer, stepPlayer, type Player } from './player';
import { STAGE } from './stage';
import { validateStage } from './stage-check';
import { coconutAtWeak, ticks } from './boss-test-helpers';
import { createBoss, BOSS_DEFS, type Boss } from './boss';

const JUMP: InputState = { ...NO_INPUT, jump: true };
const H = PLAYER_HEIGHT;
const W = PLAYER_WIDTH;

describe('ステージのヤシの木の配置', () => {
  it('10 本あり、i 番目の木は、i 番目のボスの闘技場より 150 px 以上西で、前のボスの範囲より東にある', () => {
    expect(STAGE.palms).toHaveLength(10);
    STAGE.palms.forEach((x, i) => {
      const b = STAGE.bosses[i]!;
      expect(x).toBeLessThanOrEqual(b.left - 150);
      const prev = STAGE.bosses[i - 1];
      if (prev) expect(x).toBeGreaterThanOrEqual(prev.right + prev.def.w);
    });
  });

  it('平らな地面の上で、穴・崖・浮島・ボスとザコ敵の範囲・柱と重ならない(ステージの検査を通る)', () => {
    expect(validateStage(STAGE)).toEqual([]);
    for (const x of STAGE.palms) {
      const t = trunkRect(createPalm(x), GROUND_Y);
      expect(t.y + t.h).toBe(GROUND_Y);
      for (const c of STAGE.cliffs) expect(overlaps(t, c)).toBe(false);
      for (const p of STAGE.pillars) expect(overlaps(t, p)).toBe(false);
    }
  });

  it('最後の木は、ヌシの手前(西の柱の西側)で、練習用の的は、その木と西の柱の間にある', () => {
    const last = STAGE.palms[9]!;
    const west = STAGE.pillars[0]!;
    expect(last).toBeLessThan(west.x);
    expect(STAGE.target.x).toBeGreaterThan(last);
    expect(STAGE.target.x + STAGE.target.w).toBeLessThanOrEqual(west.x);
  });

  it('ヤシの木は、プレイヤーを止めない(通り抜けられる)', () => {
    let g: GameState = { ...createGame(undefined, { bosses: [], enemies: [], palms: [1000], pillars: [] }), player: createPlayer(900) };
    for (let i = 0; i < 120; i++) g = stepGame(g, { ...NO_INPUT, right: true }, FIXED_DT);
    expect(g.player.x).toBeGreaterThan(1100);
  });
});

describe('頭突き', () => {
  const palm = createPalm(1000);
  const at = (top: number): { x: number; y: number; w: number; h: number } => ({ x: 980, y: top, w: W, h: H });

  it('梢の矩形は、幹の中心から左右 50、地面から 200〜260 の高さ', () => {
    const c = canopyRect(palm, GROUND_Y);
    expect(c).toEqual({ x: 950, y: GROUND_Y - PALM_CANOPY_HIGH, w: 100, h: PALM_CANOPY_HIGH - PALM_CANOPY_LOW });
  });

  it('上昇しながら梢に重なると、実が 1 個落ち、実がならない状態になる', () => {
    const r = stepPalms([palm], at(GROUND_Y - 230), -300, GROUND_Y, FIXED_DT);
    expect(r.drops).toEqual([{ x: 1000, y: GROUND_Y - PALM_CANOPY_LOW }]);
    expect(r.palms[0]!.ready).toBe(false);
  });

  it('下降中は落ちない。梢の下(届かない)でも落ちない', () => {
    expect(stepPalms([palm], at(GROUND_Y - 230), 100, GROUND_Y, FIXED_DT).drops).toHaveLength(0);
    expect(stepPalms([palm], at(GROUND_Y - 150), -300, GROUND_Y, FIXED_DT).drops).toHaveLength(0);
  });

  it('実がなっていない間は何も起きず、10 秒後に再びなる', () => {
    let p = stepPalms([palm], at(GROUND_Y - 230), -300, GROUND_Y, FIXED_DT).palms;
    for (let i = 0; i < ticks(5); i++) p = stepPalms(p, at(GROUND_Y - 230), -300, GROUND_Y, FIXED_DT).palms;
    expect(p[0]!.ready).toBe(false);
    expect(stepPalms(p, at(GROUND_Y - 230), -300, GROUND_Y, FIXED_DT).drops).toHaveLength(0);
    for (let i = 0; i < ticks(COCONUT_RESPAWN_TIME); i++) p = stepPalms(p, at(0), 0, GROUND_Y, FIXED_DT).palms;
    expect(p[0]!.ready).toBe(true);
  });

  /** 実際のジャンプ(キーを holdTicks 更新だけ押す)で、幹の下から頭突きできるか。 */
  function bonks(holdTicks: number): boolean {
    let g: GameState = {
      ...createGame(undefined, { bosses: [], enemies: [], palms: [1000], pillars: [] }),
      player: { ...createPlayer(980), onGround: true },
    };
    for (let i = 0; i < 90; i++) {
      g = stepGame(g, i < holdTicks ? JUMP : NO_INPUT, FIXED_DT);
      if (!g.palms[0]!.ready) return true;
    }
    return false;
  }

  it('高いジャンプ(ほぼ押し続ける)なら届いて落ち、すぐ離す低いジャンプでは落ちない', () => {
    expect(bonks(60)).toBe(true);
    expect(bonks(2)).toBe(false);
    // 最高点(約 182 + 足の高さ)が、梢の下端(200)を超える: 押し続けたときの高さの約 8 割以上が必要
    const apex = JUMP_SPEED ** 2 / (2 * GRAVITY);
    expect(apex + H).toBeGreaterThan(PALM_CANOPY_LOW);
    expect(apex).toBeLessThan(PALM_CANOPY_LOW); // 地面から立った足元では、梢の下端には届かない高さではなく、頭が届く
  });

  it('ゲームの中で、頭突きで落ちた実が地面に落ち、拾える', () => {
    let g: GameState = {
      ...createGame(undefined, { bosses: [], enemies: [], palms: [1000], pillars: [] }),
      player: { ...createPlayer(980), onGround: true },
    };
    for (let i = 0; i < 40; i++) g = stepGame(g, JUMP, FIXED_DT);
    expect(g.coconuts.length + g.held).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) g = stepGame(g, NO_INPUT, FIXED_DT);
    expect(g.held).toBe(1);
  });
});

describe('ジャンプの高さ(1.3 倍)と柱の高さ', () => {
  it('最高点は約 182 px(従来の 140 px の 1.3 倍)で、柱(260)とヌシ(250)の高さより低い', () => {
    const apex = JUMP_SPEED ** 2 / (2 * GRAVITY);
    expect(apex).toBeGreaterThan(140 * 1.3 - 3);
    expect(apex).toBeLessThan(140 * 1.3 + 3);
    expect(STAGE.pillars[0]!.h).toBeGreaterThan(apex + 50);
    expect(BOSS_DEFS[9]!.h).toBeGreaterThan(apex);
  });

  it('柱(ヤシの木の幹)には、ジャンプしても乗れない', () => {
    let p: Player = { ...createPlayer(STAGE.pillars[0]!.x - W - 1), onGround: true };
    const world = { ...STAGE.world, solids: [...(STAGE.world.solids ?? []), ...STAGE.pillars] };
    for (let i = 0; i < 300; i++) {
      p = stepPlayer(p, { ...NO_INPUT, right: true, jump: true }, FIXED_DT, world);
      expect(p.y + H).toBeGreaterThan(STAGE.pillars[0]!.y + 1 - 1e-6 - 1000); // 計算が壊れていないこと
    }
    expect(p.x + W).toBeLessThanOrEqual(STAGE.pillars[0]!.x + 1e-6);
  });
});

describe('闘技場の木(柱)にヌシが突進すると、実が落ちてくる', () => {
  const NUSHI = BOSS_DEFS[9]!;
  const PLACE = STAGE.bosses[9]!;
  const WEST = STAGE.pillars[0]!;
  const EAST = STAGE.pillars[1]!;
  const spot = { x: WEST.x - W - 20, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true };

  function arena(over: Partial<GameState> = {}, boss: Boss = createBoss(PLACE.left, PLACE.left, PLACE.right, GROUND_Y, NUSHI)): GameState {
    return {
      ...createGame(undefined, { bosses: [], enemies: [], pillars: STAGE.pillars }),
      pillars: createGame().pillars,
      intro: { state: 'done', t: 3 },
      bosses: [boss],
      player: { ...spot },
      ...over,
    };
  }
  function lure(g0: GameState): GameState {
    let g = g0;
    for (let i = 0; i < ticks(40); i++) {
      g = stepGame({ ...g, player: { ...spot } }, NO_INPUT, FIXED_DT);
      if (g.bosses[0]!.stagger > 0) return g;
    }
    return g;
  }

  it('突進が当たった更新で、両方の木の外側に、2 個ずつ(計 4 個)の実が落ち始める', () => {
    const before = arena();
    expect(before.coconuts).toHaveLength(0);
    const g = lure(before);
    expect(g.coconuts).toHaveLength(4);
    const west = g.coconuts.filter((c) => c.x < WEST.x).map((c) => WEST.x - (c.x + 10));
    const east = g.coconuts.filter((c) => c.x > EAST.x).map((c) => c.x + 10 - (EAST.x + EAST.w));
    expect(west.sort((a, b) => a - b)).toEqual([...PALM_DROP_OFFSETS]);
    expect(east.sort((a, b) => a - b)).toEqual([...PALM_DROP_OFFSETS]);
    expect(g.coconuts.every((c) => !c.landed)).toBe(true);
  });

  it('ヒットストップの間は動かず、そのあとで落ち始め、気絶の間に拾って頭へ投げられる', () => {
    let g = lure(arena());
    const y0 = g.coconuts[0]!.y;
    for (let i = 0; i < ticks(0.2); i++) g = stepGame({ ...g, player: { ...spot } }, NO_INPUT, FIXED_DT);
    expect(g.coconuts[0]!.y).toBe(y0); // まだ止まっている
    for (let i = 0; i < ticks(0.4); i++) g = stepGame({ ...g, player: { ...spot } }, NO_INPUT, FIXED_DT);
    expect(g.coconuts[0]!.y).toBeGreaterThan(y0); // 落ち始めた
    // 落ちた実を拾う(プレイヤーは柱の外側で、実の上にいる)
    const target = g.coconuts.filter((c) => c.x < WEST.x)[0]!;
    for (let i = 0; i < ticks(1.5); i++) g = stepGame({ ...g, player: { ...spot, x: target.x - 10 } }, NO_INPUT, FIXED_DT);
    expect(g.held).toBeGreaterThan(0);
    expect(g.bosses[0]!.stagger).toBeGreaterThan(0); // まだ気絶中
    g = { ...g, thrown: coconutAtWeak(g.bosses[0]!), player: { ...spot } };
    g = stepGame(g, NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(8);
  });

  it('突進が当たらない間(ヌシが眠っている・往復だけの間)は、実は落ちない', () => {
    let g = arena({ intro: { state: 'sleeping', t: 0 } }, createBoss(PLACE.left, PLACE.left, PLACE.right, GROUND_Y, NUSHI));
    g = { ...g, player: { ...spot, x: 1000 } };
    for (let i = 0; i < ticks(3); i++) g = stepGame({ ...g, player: { ...spot, x: 1000 } }, NO_INPUT, FIXED_DT);
    expect(g.coconuts).toHaveLength(0);
  });
});
