import { describe, expect, it } from 'vitest';
import { createBoss, type Boss } from './boss';
import {
  BOSS_MAX_HP,
  FIXED_DT,
  HIT_BOUNCE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  STOMP_BOUNCE_SPEED,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { createPlayer, type Player } from './player';

const RIGHT: InputState = { ...NO_INPUT, right: true };

/** ボスを動かさず x=1000 に固定した状態。 */
function stillBoss(over: Partial<Boss> = {}): Boss {
  return { ...createBoss(1000, 1000, 1000), vx: 0, ...over };
}

function withBoss(boss: Boss, player: Player, extra: Partial<GameState> = {}): GameState {
  return { ...createGame(), boss, player, ...extra };
}

/** ボスの左側から、10px 重なって接触するプレイヤー(地面の上)。 */
function touchingFromLeft(boss: Boss): Player {
  return createPlayer(boss.x - PLAYER_WIDTH + 10);
}

function airPlayerAbove(boss: Boss, gap: number, vy: number): Player {
  return { x: boss.x + 20, y: boss.y - PLAYER_HEIGHT - gap, vx: 0, vy, onGround: false };
}

function run(s: GameState, input: InputState, n: number): GameState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = stepGame(cur, input, FIXED_DT);
  return cur;
}

describe('HPの初期値', () => {
  it('HPは 3、無敵時間は 0、生存状態で始まる', () => {
    const g = createGame();
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.hp).toBe(3);
    expect(g.hitInvuln).toBe(0);
    expect(g.dead).toBe(false);
  });
});

describe('ボスとの接触による被弾', () => {
  it('横から接触するとHPが 1 減り、無敵時間が設定され、小さく上へ跳ね上がる', () => {
    const boss = stillBoss();
    const g = stepGame(withBoss(boss, touchingFromLeft(boss)), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(2);
    expect(g.hitInvuln).toBe(PLAYER_INVULN_TIME);
    expect(g.player.vy).toBe(-HIT_BOUNCE_SPEED);
    expect(g.player.onGround).toBe(false);
    expect(g.boss.hp).toBe(BOSS_MAX_HP);
  });

  it('踏みつけでは被弾しない', () => {
    const boss = stillBoss();
    const g = stepGame(withBoss(boss, airPlayerAbove(boss, 5, 300)), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(3);
    expect(g.hitInvuln).toBe(0);
    expect(g.boss.hp).toBe(BOSS_MAX_HP - 1);
  });

  it('撃破済みのボスの位置を通過しても被弾しない', () => {
    const boss = stillBoss({ alive: false, hp: 0 });
    const g = run(withBoss(boss, createPlayer(boss.x + 10)), NO_INPUT, 30);
    expect(g.hp).toBe(3);
  });

  it('ボスに触れないまま更新を重ねても、HPは変化しない', () => {
    const g = run(createGame(), NO_INPUT, 300);
    expect(g.hp).toBe(3);
    expect(g.hitInvuln).toBe(0);
  });
});

describe('被弾後の無敵時間', () => {
  it('無敵中は、ボスと重なり続けても(押し戻されても)HPが追加では減らない', () => {
    const boss = stillBoss();
    let g = stepGame(withBoss(boss, touchingFromLeft(boss)), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(2);
    for (let i = 0; i < 60; i++) {
      g = stepGame(g, RIGHT, FIXED_DT); // 右へ押し続ける(1 秒間)
      expect(g.hp).toBe(2);
      expect(g.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(boss.x + 1e-6); // すり抜けない
    }
  });

  it('無敵時間は更新ごとに減っていく', () => {
    const boss = stillBoss();
    let g = stepGame(withBoss(boss, touchingFromLeft(boss)), NO_INPUT, FIXED_DT);
    const first = g.hitInvuln;
    g = stepGame({ ...g, player: createPlayer(100) }, NO_INPUT, FIXED_DT);
    expect(g.hitInvuln).toBeLessThan(first);
  });

  it('十分な時間が経過して無敵が終わると、再び被弾する', () => {
    const boss = stillBoss();
    let g = stepGame(withBoss(boss, touchingFromLeft(boss)), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(2);
    g = run(g, RIGHT, 150); // 2 秒(120 更新)を超えて押し続ける
    expect(g.hp).toBe(1);
    expect(g.hitInvuln).toBeGreaterThan(0); // 再び無敵になっている
  });

  it('無敵が終わるまでは約 2 秒かかる(1 秒では減らない)', () => {
    const boss = stillBoss();
    let g = stepGame(withBoss(boss, touchingFromLeft(boss)), NO_INPUT, FIXED_DT);
    g = run(g, RIGHT, 60);
    expect(g.hp).toBe(2);
    g = run(g, RIGHT, 70); // 合計 130 更新(約 2.17 秒)
    expect(g.hp).toBe(1);
  });

  it('無敵中でも、上から踏みつければボスにダメージが入り、プレイヤーは跳ね返る', () => {
    const boss = stillBoss({ hp: 2 });
    const g = stepGame(
      withBoss(boss, airPlayerAbove(boss, 5, 300), { hp: 2, hitInvuln: 1.5 }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.boss.hp).toBe(1);
    expect(g.player.vy).toBe(-STOMP_BOUNCE_SPEED);
    expect(g.hp).toBe(2);
  });
});

describe('HPが 0 で死亡する', () => {
  it('HPが 1 のときに被弾すると HP 0 になり、死亡状態になる', () => {
    const boss = stillBoss();
    const g = stepGame(withBoss(boss, touchingFromLeft(boss), { hp: 1 }), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(0);
    expect(g.dead).toBe(true);
  });

  it('死亡後にさらに更新(接触を含む)しても、HPは 0 を下回らない', () => {
    const boss = stillBoss();
    let g = stepGame(withBoss(boss, touchingFromLeft(boss), { hp: 1 }), NO_INPUT, FIXED_DT);
    g = run({ ...g, hitInvuln: 0 }, RIGHT, 5);
    expect(g.hp).toBe(0);
    expect(g.dead).toBe(true);
  });

  it('HPが 1 以上の間は死亡状態にならない', () => {
    const boss = stillBoss();
    const g = stepGame(withBoss(boss, touchingFromLeft(boss), { hp: 3 }), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(2);
    expect(g.dead).toBe(false);
    expect(run(createGame(), NO_INPUT, 60).dead).toBe(false);
  });

  it('3 回被弾すると死亡する(HP 3 → 2 → 1 → 0)', () => {
    const boss = stillBoss();
    let g = withBoss(boss, touchingFromLeft(boss));
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      g = stepGame({ ...g, player: touchingFromLeft(boss), hitInvuln: 0 }, NO_INPUT, FIXED_DT);
      seen.push(g.hp);
    }
    expect(seen).toEqual([2, 1, 0]);
    expect(g.dead).toBe(true);
  });
});
