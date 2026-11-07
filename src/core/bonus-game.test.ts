import { describe, expect, it } from 'vitest';
import { BONUS_WORLD, type BonusItem } from './bonus';
import {
  BONUS_DURATION,
  BONUS_START_X,
  FIXED_DT,
  GROUND_Y,
  HIDDEN_HOLE_WIDTH,
  HIDDEN_HOLE_X,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  WORLD_WIDTH,
} from './config';
import { createFlow, stepFlow, type Flow } from './flow';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { createPlayer } from './player';
import { STAGE } from './stage';
import { validatePlacements as validatePlacementsFor } from './stage-check';

const CENTER = WORLD_WIDTH / 2;

/** 隠し穴の中央に、地面に立って落ち着いた状態(敵・ボスなし)。 */
function atHole(extra: Partial<GameState> = {}): GameState {
  const base = createGame(undefined, { bosses: [], enemies: [] });
  return { ...base, player: createPlayer(CENTER - PLAYER_WIDTH / 2), ...extra };
}

function run(g: GameState, n: number, input: InputState = NO_INPUT): GameState {
  let s = g;
  for (let i = 0; i < n; i++) s = stepGame(s, input, FIXED_DT);
  return s;
}

function inBonus(extra: Partial<GameState> = {}): GameState {
  const g = stepGame(atHole(extra), NO_INPUT, FIXED_DT);
  expect(g.bonus).not.toBeNull();
  return g;
}

describe('ボーナスの入場(ゲーム)', () => {
  it('初期状態は、ボーナスの最中でも使用済みでもない', () => {
    const g = createGame();
    expect(g.bonus).toBeNull();
    expect(g.bonusUsed).toBe(false);
  });

  it('隠し穴の上に立つと始まり、広間の左端に立ち、HPは変わらない', () => {
    const g = stepGame(atHole({ hp: 3 }), NO_INPUT, FIXED_DT);
    expect(g.bonus).not.toBeNull();
    expect(g.bonus!.player.x).toBe(BONUS_START_X);
    expect(g.hp).toBe(3);
    expect(g.bonus!.t).toBe(0);
  });

  it('範囲の手前の地面を歩いているだけでは、始まらない', () => {
    const g = stepGame(
      atHole({ player: createPlayer(HIDDEN_HOLE_X - PLAYER_WIDTH - 20) }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.bonus).toBeNull();
  });

  it('空中で隠し穴の真上を通過しているだけでは、始まらない(着地すると始まる)', () => {
    const base = atHole();
    const air = { ...base.player, y: GROUND_Y - PLAYER_HEIGHT - 200, vy: 0, onGround: false };
    let g = stepGame({ ...base, player: air }, NO_INPUT, FIXED_DT);
    expect(g.bonus).toBeNull();
    g = run(g, 120);
    expect(g.bonus).not.toBeNull(); // 着地した
  });

  it('入場時の本編の復帰位置(入口に立っている安全な足場)を保存する', () => {
    const g = stepGame(atHole({ respawn: { x: 5, y: 6 } }), NO_INPUT, FIXED_DT);
    expect(g.bonus!.saved.respawn).toEqual({ x: CENTER - PLAYER_WIDTH / 2, y: GROUND_Y - PLAYER_HEIGHT });
  });
});

describe('本編の状態の保存と復帰', () => {
  it('ボーナスの間、ザコ敵・ボスは動かず、体力も変わらない', () => {
    const full = createGame();
    const g0 = stepGame({ ...full, player: createPlayer(CENTER - PLAYER_WIDTH / 2) }, NO_INPUT, FIXED_DT);
    expect(g0.bonus).not.toBeNull();
    const g1 = run(g0, 10 * 60);
    expect(g1.enemies).toEqual(g0.enemies);
    expect(g1.bosses).toEqual(g0.bosses);
    expect(g1.projectiles).toEqual(g0.projectiles);
  });

  it('終わると地上の隠し穴の中央に立ち、拾得数・倒した敵は保たれる', () => {
    let g = inBonus({ partsCollected: 3 });
    g = run(g, (BONUS_DURATION + 1) * 60);
    expect(g.bonus).toBeNull();
    expect(g.bonusUsed).toBe(true);
    expect(g.partsCollected).toBe(3);
    expect(g.player.x + PLAYER_WIDTH / 2).toBe(CENTER);
    expect(g.player.y + PLAYER_HEIGHT).toBe(GROUND_Y);
  });

  it('復帰位置(穴に落ちたときの戻り先)は、ボーナスの中で変わらず、地上へ戻ると入場時の値に戻る', () => {
    const g0 = inBonus();
    const saved = g0.bonus!.saved.respawn;
    const g = run(g0, (BONUS_DURATION + 1) * 60);
    expect(g.respawn).toEqual(saved);
  });
});

describe('1 回のプレイで 1 回だけ', () => {
  it('遊んだあとに、同じ隠し穴の上に立っても、再び始まらない', () => {
    let g = inBonus();
    g = run(g, (BONUS_DURATION + 1) * 60);
    expect(g.bonus).toBeNull();
    g = run(g, 30);
    expect(g.bonus).toBeNull();
    expect(g.bonusUsed).toBe(true);
  });

  it('HPと無敵時間を引き継いで戻る', () => {
    const g0 = inBonus({ hp: 4, hitInvuln: 1 });
    const g = run(g0, (BONUS_DURATION + 1) * 60);
    expect(g.hp).toBeGreaterThanOrEqual(4);
    expect(g.hitInvuln).toBe(0);
  });
});

describe('石でHPが 0 になる(Flow)', () => {
  function stoneOnPlayer(hp: number): GameState {
    const g = inBonus({ hp });
    const item: BonusItem = {
      kind: 'stone',
      x: g.bonus!.player.x + 5,
      y: g.bonus!.player.y + 5,
      vx: 0,
      vy: 0,
      alive: true,
    };
    return { ...g, bonus: { ...g.bonus!, items: [item], t: 0.1, spawned: 1 } };
  }

  it('HPが 1 のとき石に当たると、ゲームオーバーになる', () => {
    const flow: Flow = { phase: 'playing', game: stoneOnPlayer(1), confirmHeld: false };
    const next = stepFlow(flow, NO_INPUT, FIXED_DT);
    expect(next.phase).toBe('gameover');
    expect(next.game.hp).toBe(0);
  });

  it('HPが 2 なら、プレイが続き、HPは 1 で、無敵になる', () => {
    const flow: Flow = { phase: 'playing', game: stoneOnPlayer(2), confirmHeld: false };
    const next = stepFlow(flow, NO_INPUT, FIXED_DT);
    expect(next.phase).toBe('playing');
    expect(next.game.hp).toBe(1);
    expect(next.game.hitInvuln).toBe(PLAYER_INVULN_TIME);
  });

  it('ボーナスを遊んだあとでも、やり直すと未使用に戻る', () => {
    const flow: Flow = { phase: 'playing', game: stoneOnPlayer(1), confirmHeld: false };
    const over = stepFlow(flow, NO_INPUT, FIXED_DT);
    expect(over.game.bonusUsed).toBe(true);
    const again = stepFlow(over, { ...NO_INPUT, confirm: true }, FIXED_DT);
    expect(again.phase).toBe('playing');
    expect(again.game.bonusUsed).toBe(false);
    expect(again.game.bonus).toBeNull();
    expect(again.game.hp).toBe(PLAYER_MAX_HP);
  });

  it('初期の Flow では、ボーナスは未使用', () => {
    expect(createFlow().game.bonusUsed).toBe(false);
  });
});

describe('ステージの検査(隠し穴)', () => {
  it('隠し穴は、平らな地面の上で、敵・ボスの往復範囲と重ならない(検査が通る)', () => {
    expect(validatePlacementsFor(STAGE)).toEqual([]);
    expect(HIDDEN_HOLE_X + HIDDEN_HOLE_WIDTH / 2).toBe(CENTER);
  });

  it('隠し穴の上に敵の範囲があると、検査が違反を報告する', () => {
    const bad = {
      ...STAGE,
      enemies: [...STAGE.enemies, { kind: 'plodder' as const, x: CENTER, left: CENTER - 20, right: CENTER + 20 }],
    };
    expect(validatePlacementsFor(bad).some((e) => e.includes('隠し穴'))).toBe(true);
  });

  it('広間の世界は、床だけの平らな世界', () => {
    expect(BONUS_WORLD.solids).toBeUndefined();
  });
});
