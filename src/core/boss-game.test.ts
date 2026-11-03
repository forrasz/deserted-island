import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, createBoss, type Boss } from './boss';
import type { BossStep } from './boss-scripts';
import { bossWith } from './boss-test-helpers';
import {
  FIXED_DT,
  GROUND_Y,
  HIT_BOUNCE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  STOMP_BOUNCE_SPEED,
} from './config';
import { stepFlow, type Flow } from './flow';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { createPlayer, type Player } from './player';
import { createShot, createWave, type Projectile } from './projectile';

const H = PLAYER_HEIGHT;
const ENTER: InputState = { ...NO_INPUT, confirm: true };
const none = { bosses: [], enemies: [] };

function world(bosses: Boss[], player: Player, over: Partial<GameState> = {}): GameState {
  return { ...createGame(undefined, none), bosses, player, ...over };
}

/** 動かない(往復範囲が 1 点)ボス。行動の流れだけを指定する。 */
function boss(script: BossStep[], x = 3000): Boss {
  return bossWith(script, {}, x, x, x);
}

function falling(b: Boss, gap = 5, vy = 300): Player {
  return { x: b.x + 20, y: b.y - H - gap, vx: 0, vy, onGround: false };
}

function run(s: GameState, n: number, input: InputState = NO_INPUT): GameState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = stepGame(cur, input, FIXED_DT);
  return cur;
}

describe('ボスが出す弾・衝撃波', () => {
  it('ボスが弾を撃った更新で、projectiles に弾が加わり、次の更新から動く', () => {
    const b = boss([{ a: 'shot', speed: 260, tops: [48] }]);
    const g0 = world([b], createPlayer(100));
    const g1 = stepGame(g0, NO_INPUT, FIXED_DT);
    expect(g1.projectiles).toHaveLength(1);
    const x1 = g1.projectiles[0]!.x;
    const g2 = stepGame(g1, NO_INPUT, FIXED_DT);
    expect(g2.projectiles[0]!.x).not.toBe(x1);
  });

  it('弾はプレイヤーのいる側へ向かう(プレイヤーが左なら左へ)', () => {
    const b = boss([{ a: 'shot', speed: 260, tops: [48] }]);
    const g = stepGame(world([b], createPlayer(100)), NO_INPUT, FIXED_DT);
    expect(g.projectiles[0]!.vx).toBeLessThan(0);
    const right = stepGame(world([b], createPlayer(6000)), NO_INPUT, FIXED_DT);
    expect(right.projectiles[0]!.vx).toBeGreaterThan(0);
  });

  it('弾に当たるとHPが 1 減り、2 秒の無敵になり、弾は消える', () => {
    const shot = createShot(1000, GROUND_Y - 48, 0);
    const g = stepGame(world([], createPlayer(1000), { projectiles: [shot] }), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
    expect(g.hitInvuln).toBe(PLAYER_INVULN_TIME);
    expect(g.projectiles).toHaveLength(0);
    expect(g.player.vy).toBe(-HIT_BOUNCE_SPEED);
  });

  it('無敵中は弾に当たっても被弾せず、弾は進み続ける', () => {
    const shot = createShot(1000, GROUND_Y - 48, 0);
    const g = stepGame(
      world([], createPlayer(1000), { projectiles: [shot], hitInvuln: 1.5, hp: 2 }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.hp).toBe(2);
    expect(g.projectiles).toHaveLength(1);
  });

  it('衝撃波は、ジャンプして上にいれば被弾しない', () => {
    const w = createWave(1000, GROUND_Y, 0);
    const airborne: Player = { x: 1000, y: GROUND_Y - H - 40, vx: 0, vy: 0, onGround: false };
    const g = stepGame(world([], airborne, { projectiles: [w] }), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(PLAYER_MAX_HP);
  });

  it('ボスの接触と弾の命中が同じ更新でも、被弾は 1 回だけ', () => {
    const b = boss([{ a: 'patrol', time: 100 }], 1000);
    const shot = createShot(1000 - PLAYER_WIDTH + 10, GROUND_Y - 48, 0);
    const g = stepGame(
      world([b], createPlayer(1000 - PLAYER_WIDTH + 10), { projectiles: [shot] }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
  });

  it('寿命の尽きた弾は、取り除かれる(projectiles から消える)', () => {
    const old: Projectile = { ...createShot(1000, GROUND_Y - 48, 0), life: FIXED_DT / 2 };
    const g = stepGame(world([], createPlayer(5000), { projectiles: [old] }), NO_INPUT, FIXED_DT);
    expect(g.projectiles).toHaveLength(0);
  });

  it('倒されたボスは、弾を出さない', () => {
    const dead: Boss = { ...boss([{ a: 'wave', speed: 300 }]), alive: false, hp: 0 };
    const g = run(world([dead], createPlayer(100)), 30);
    expect(g.projectiles).toHaveLength(0);
  });
});

describe('踏めない状態・触れない状態', () => {
  it('もぐっているボスには、踏んでも横から触れても何も起きない(体力・被弾・押し戻し)', () => {
    const b = boss([{ a: 'burrow', time: 100 }], 1000);
    const side = stepGame(world([b], createPlayer(1000 - PLAYER_WIDTH + 10)), NO_INPUT, FIXED_DT);
    expect(side.hp).toBe(PLAYER_MAX_HP);
    expect(side.player.x).toBe(1000 - PLAYER_WIDTH + 10); // 押し戻されない
    const top = stepGame(world([b], falling(b)), NO_INPUT, FIXED_DT);
    expect(top.bosses[0]!.hp).toBe(b.hp);
    expect(top.hp).toBe(PLAYER_MAX_HP);
    expect(top.player.vy).not.toBe(-STOMP_BOUNCE_SPEED);
  });

  it('転がっているボスは、踏んでもダメージがなく、跳ね返りもなく、通常の接触として被弾する', () => {
    const b = boss([{ a: 'roll', time: 100, speed: 260 }], 1000);
    const g = stepGame(world([b], falling(b, 5, 300)), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(b.hp);
    expect(g.player.vy).not.toBe(-STOMP_BOUNCE_SPEED);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
  });

  it('転がっているボスは、無敵のあいだは被弾しないが、押し戻される', () => {
    const b = boss([{ a: 'roll', time: 100, speed: 260 }], 1000);
    const g = stepGame(
      world([b], createPlayer(1000 - PLAYER_WIDTH + 10), { hitInvuln: 1.5 }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it('変身中のボスは、踏むと跳ね返るがダメージがなく、触れても被弾せず、押し戻されない', () => {
    const b: Boss = { ...createBoss(1000, 1000, 1000, GROUND_Y, BOSS_DEFS[9]!), transformed: true, transformT: 1 };
    const top = stepGame(world([b], falling(b)), NO_INPUT, FIXED_DT);
    expect(top.bosses[0]!.hp).toBe(12);
    expect(top.player.vy).toBe(-STOMP_BOUNCE_SPEED);
    expect(top.hp).toBe(PLAYER_MAX_HP);
    const side = stepGame(world([b], createPlayer(1000 - PLAYER_WIDTH + 10)), NO_INPUT, FIXED_DT);
    expect(side.hp).toBe(PLAYER_MAX_HP);
    expect(side.player.x).toBe(1000 - PLAYER_WIDTH + 10);
  });

  it('通常の状態(往復・休み・目を回している)のボスは、踏むと体力が 1 減る', () => {
    for (const step of [
      { a: 'patrol', time: 100 },
      { a: 'rest', time: 100 },
      { a: 'dizzy', time: 100 },
    ] as BossStep[]) {
      const b = boss([step], 1000);
      const g = stepGame(world([b], falling(b)), NO_INPUT, FIXED_DT);
      expect(g.bosses[0]!.hp).toBe(b.hp - 1);
      expect(g.player.vy).toBe(-STOMP_BOUNCE_SPEED);
    }
  });
});

describe('再プレイでの弾の初期化', () => {
  it('弾が出ているままゲームオーバーになっても、再プレイを開始すると、弾はなくなる', () => {
    const shot = createShot(1000, GROUND_Y - 48, 260);
    const dead: Flow = {
      phase: 'gameover',
      game: { ...world([], createPlayer(100)), projectiles: [shot], hp: 0, dead: true },
      confirmHeld: false,
    };
    const f = stepFlow(dead, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game.projectiles).toEqual([]);
    expect(f.game).toEqual(createGame());
  });

  it('ゲームオーバー画面の間は、弾が動かない', () => {
    const shot = createShot(1000, GROUND_Y - 48, 260);
    const dead: Flow = {
      phase: 'gameover',
      game: { ...world([], createPlayer(100)), projectiles: [shot], hp: 0, dead: true },
      confirmHeld: false,
    };
    let f = dead;
    for (let i = 0; i < 60; i++) f = stepFlow(f, NO_INPUT, FIXED_DT);
    expect(f.game.projectiles[0]!.x).toBe(shot.x);
  });

  it('クリア画面の間も、弾が動かない', () => {
    const shot = createShot(1000, GROUND_Y - 48, 260);
    let f: Flow = { phase: 'cleared', game: { ...world([], createPlayer(100)), projectiles: [shot], escaped: true }, confirmHeld: false };
    for (let i = 0; i < 60; i++) f = stepFlow(f, NO_INPUT, FIXED_DT);
    expect(f.game.projectiles[0]!.x).toBe(shot.x);
  });

  it('初期状態には、弾がない', () => {
    expect(createGame().projectiles).toEqual([]);
  });
});
