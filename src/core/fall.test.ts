import { describe, expect, it } from 'vitest';
import { createBoss } from './boss';
import type { Rect } from './collision';
import {
  FIXED_DT,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  RESPAWN_LOCK_TIME,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import type { Player } from './player';
import { fallYOf, type WorldBounds } from './terrain';

const H = PLAYER_HEIGHT;
const W = PLAYER_WIDTH;
const GROUND = 1000;
const HEIGHT = 1080;
const RIGHT: InputState = { ...NO_INPUT, right: true };
const RIGHT_JUMP: InputState = { ...NO_INPUT, right: true, jump: true };

/** x=600 から pitWidth の穴がある世界。 */
function pitWorld(pitWidth: number, platforms: Rect[] = []): WorldBounds {
  return {
    width: 4000,
    groundY: GROUND,
    height: HEIGHT,
    solids: [
      { x: 0, y: GROUND, w: 600, h: HEIGHT - GROUND },
      { x: 600 + pitWidth, y: GROUND, w: 4000 - 600 - pitWidth, h: HEIGHT - GROUND },
    ],
    platforms,
  };
}

function game(world: WorldBounds, over: Partial<GameState> = {}): GameState {
  // ボスは撃破済みにして、邪魔にならないようにする
  return {
    ...createGame(world),
    bosses: [{ ...createBoss(2500, 2500, 2500), alive: false, hp: 0 }],
    enemies: [],
    ...over,
  };
}

function standing(x: number): Player {
  return { x, y: GROUND - H, vx: 0, vy: 0, onGround: true };
}

function run(s: GameState, input: InputState, n: number, w: WorldBounds): GameState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = stepGame(cur, input, FIXED_DT, w);
  return cur;
}

/** 穴の真上の空中で、落下ライン直前にいるプレイヤー。 */
function aboutToFall(world: WorldBounds): Player {
  return { x: 650, y: fallYOf(world) - 1, vx: 0, vy: 600, onGround: false };
}

describe('復帰位置の記録', () => {
  const w = pitWorld(180);

  it('地面の上に足元の幅全体で立っていると、その位置が記録される', () => {
    const g = stepGame(game(w, { player: standing(300) }), NO_INPUT, FIXED_DT, w);
    expect(g.respawn).toEqual({ x: 300, y: GROUND - H });
  });

  it('穴の縁(足元の一部が穴の上)では記録が更新されない', () => {
    const before = { x: 200, y: GROUND - H };
    const g = stepGame(game(w, { player: standing(590), respawn: before }), NO_INPUT, FIXED_DT, w);
    expect(g.player.onGround).toBe(true);
    expect(g.respawn).toEqual(before);
  });

  it('空中では記録が更新されない', () => {
    const before = { x: 200, y: GROUND - H };
    const air: Player = { x: 300, y: GROUND - H - 80, vx: 0, vy: -100, onGround: false };
    const g = stepGame(game(w, { player: air, respawn: before }), NO_INPUT, FIXED_DT, w);
    expect(g.respawn).toEqual(before);
  });

  it('浮島の上でも記録される', () => {
    const island: Rect = { x: 1200, y: GROUND - 100, w: 200, h: 20 };
    const wi = pitWorld(180, [island]);
    const p: Player = { x: 1250, y: island.y - H, vx: 0, vy: 0, onGround: true };
    const g = stepGame(game(wi, { player: p }), NO_INPUT, FIXED_DT, wi);
    expect(g.respawn).toEqual({ x: 1250, y: island.y - H });
  });

  it('初期状態では、スタート位置が記録されている', () => {
    const g = createGame(w);
    expect(g.respawn).toEqual({ x: g.player.x, y: g.player.y });
  });
});

describe('穴への落下と復帰', () => {
  const w = pitWorld(180);
  const safe = { x: 300, y: GROUND - H };

  it('穴に落ちて落下ラインを越えると、HPが 1 減り、記録した位置へ戻り、速度 0・無敵になる', () => {
    const g = stepGame(game(w, { player: aboutToFall(w), respawn: safe }), NO_INPUT, FIXED_DT, w);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
    expect(g.player).toEqual({ x: safe.x, y: safe.y, vx: 0, vy: 0, onGround: true });
    expect(g.hitInvuln).toBe(PLAYER_INVULN_TIME);
    expect(g.dead).toBe(false);
  });

  it('落下ラインに届くまでは、HPは変化しない', () => {
    const p: Player = { x: 650, y: GROUND + 20, vx: 0, vy: 0, onGround: false };
    const g = stepGame(game(w, { player: p, respawn: safe }), NO_INPUT, FIXED_DT, w);
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.player.x).toBe(650);
  });

  it('無敵中に穴へ落ちても、HPが 1 減り、再び安全な足場へ戻される', () => {
    const g = stepGame(
      game(w, { player: aboutToFall(w), respawn: safe, hp: 2, hitInvuln: 1.5 }),
      NO_INPUT,
      FIXED_DT,
      w,
    );
    expect(g.hp).toBe(1);
    expect(g.player.x).toBe(safe.x);
    expect(g.hitInvuln).toBe(PLAYER_INVULN_TIME);
  });

  it('HPが 1 のときに落ちると、HPが 0 になり死亡する', () => {
    const g = stepGame(game(w, { player: aboutToFall(w), respawn: safe, hp: 1 }), NO_INPUT, FIXED_DT, w);
    expect(g.hp).toBe(0);
    expect(g.dead).toBe(true);
  });

  it('地面の上に立っている間は、更新を重ねても落下ラインに達せず、HPは変化しない', () => {
    const g = run(game(w, { player: standing(300) }), NO_INPUT, 300, w);
    expect(g.hp).toBe(PLAYER_MAX_HP);
  });

  it('実際に穴へ歩いて落ちると、1 回だけ HP が減って復帰する(復帰後すぐには再び落ちない)', () => {
    let g = game(w, { player: standing(300) });
    let falls = 0;
    let prevHp = g.hp;
    for (let i = 0; i < 400; i++) {
      g = stepGame(g, i < 200 ? RIGHT : NO_INPUT, FIXED_DT, w);
      if (g.hp < prevHp) falls++;
      prevHp = g.hp;
      if (falls === 1 && g.hitInvuln > 0 && g.player.onGround) break;
    }
    expect(falls).toBe(1);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
    expect(g.player.y).toBe(GROUND - H);
  });
});

describe('穴を越えそこなって落ちたときの復帰位置', () => {
  it('縁からジャンプして落ちると、縁より手前の、足元が完全に支えられていた位置へ戻る', () => {
    const w = pitWorld(400); // ジャンプでは越えられない幅
    let g = game(w, { player: standing(400) });
    // 地面の縁まで歩き、縁(足元の一部が穴の上)に達したところでジャンプする
    for (let i = 0; i < 200 && g.player.x + W <= 600 + 8; i++) g = stepGame(g, RIGHT, FIXED_DT, w);
    const recorded = g.respawn;
    g = stepGame(g, RIGHT_JUMP, FIXED_DT, w);
    // 落下して復帰するまで
    for (let i = 0; i < 400 && g.hp === PLAYER_MAX_HP; i++) g = stepGame(g, RIGHT, FIXED_DT, w);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
    // 復帰位置: 縁の手前(右辺が地面の端 600 以下)で、足元が完全に支えられていた位置
    expect(g.player.x + W).toBeLessThanOrEqual(600 + 1e-6);
    expect(g.player.x).toBe(recorded.x);
    expect(g.player.y).toBe(GROUND - H);
  });
});

describe('復帰直後の操作不能時間', () => {
  const w = pitWorld(180);
  const safe = { x: 300, y: GROUND - H };
  const justRespawned = () =>
    stepGame(game(w, { player: aboutToFall(w), respawn: safe }), NO_INPUT, FIXED_DT, w);

  it('穴から復帰した更新で、操作不能時間が設定される', () => {
    expect(justRespawned().respawnLock).toBe(RESPAWN_LOCK_TIME);
    expect(RESPAWN_LOCK_TIME).toBe(0.4);
  });

  it('復帰直後に右キーを押し続けていても、0.4 秒の間は移動せず、復帰位置に留まる', () => {
    let g = justRespawned();
    for (let i = 0; i < 20; i++) {
      // 20 更新 = 約 0.33 秒
      g = stepGame(g, RIGHT, FIXED_DT, w);
      expect(g.player.x).toBe(safe.x);
    }
  });

  it('復帰直後のジャンプ入力では、ジャンプしない', () => {
    let g = justRespawned();
    g = stepGame(g, RIGHT_JUMP, FIXED_DT, w);
    expect(g.player.onGround).toBe(true);
    expect(g.player.y).toBe(GROUND - H);
  });

  it('0.4 秒が経過したあとは、通常どおり右へ移動する', () => {
    let g = justRespawned();
    for (let i = 0; i < 30; i++) g = stepGame(g, RIGHT, FIXED_DT, w); // 0.5 秒
    expect(g.player.x).toBeGreaterThan(safe.x);
  });

  it('復帰していない通常のプレイでは、操作不能時間はなく、すぐ移動できる', () => {
    const g = stepGame(game(w, { player: standing(300) }), RIGHT, FIXED_DT, w);
    expect(g.respawnLock).toBe(0);
    expect(g.player.x).toBeGreaterThan(300);
  });

  it('キーを押し続けて穴へ歩いても、復帰後すぐに再び落ちない(0.4 秒の間に連続して落ちない)', () => {
    let g = game(w, { player: standing(500) });
    let falls = 0;
    let prevHp = g.hp;
    let firstFallTick = -1;
    for (let i = 0; i < 120; i++) {
      g = stepGame(g, RIGHT, FIXED_DT, w);
      if (g.hp < prevHp) {
        falls++;
        if (firstFallTick < 0) firstFallTick = i;
      }
      prevHp = g.hp;
      // 最初の落下から 0.4 秒(24 更新)の間は、2 回目の落下が起きない
      if (firstFallTick >= 0 && i - firstFallTick <= 24) expect(falls).toBe(1);
    }
    expect(falls).toBeGreaterThanOrEqual(1);
  });
});
