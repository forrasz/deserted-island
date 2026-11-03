import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, createBoss, type Boss } from './boss';
import {
  ENEMY_SIZE,
  FIXED_DT,
  GROUND_Y,
  HIT_BOUNCE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  RAFT_PARTS_REQUIRED,
  STOMP_BOUNCE_SPEED,
} from './config';
import { createEnemy, type Enemy } from './enemy';
import type { EnemyKind } from './enemy-defs';
import { createFlow, stepFlow } from './flow';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { createPlayer, type Player } from './player';
import { STAGE } from './stage';

const H = PLAYER_HEIGHT;
const ENTER: InputState = { ...NO_INPUT, confirm: true };

const empty = { bosses: [], enemies: [] };

/** 敵もボスもいない状態に、指定の敵・ボスだけを置く。 */
function world(enemies: Enemy[] = [], bosses: Boss[] = [], over: Partial<GameState> = {}): GameState {
  return { ...createGame(undefined, empty), bosses, enemies, ...over };
}

function enemy(kind: EnemyKind, x: number): Enemy {
  return createEnemy(kind, x, x, x); // 範囲 0 = その場から動かない(往復の幅がない)
}

function falling(e: Enemy, gap = 5, vy = 300): Player {
  return { x: e.x, y: e.y - H - gap, vx: 0, vy, onGround: false };
}

function stillBoss(x: number, def = BOSS_DEFS[0]!, over: Partial<Boss> = {}): Boss {
  return { ...createBoss(x, x, x, GROUND_Y, def), vx: 0, ...over };
}

function run(s: GameState, input: InputState, n: number): GameState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = stepGame(cur, input, FIXED_DT);
  return cur;
}

describe('初期状態(ステージの配置から)', () => {
  it('ボスが 10 体、ザコ敵が 30 体以上、すべて生存している', () => {
    const g = createGame();
    expect(g.bosses).toHaveLength(10);
    expect(g.enemies.length).toBeGreaterThanOrEqual(30);
    expect(g.bosses.every((b) => b.alive && b.hp === b.maxHp)).toBe(true);
    expect(g.enemies.every((e) => e.alive && !e.hidden)).toBe(true);
    expect(g.parts).toEqual([]);
    expect(g.partsCollected).toBe(0);
  });

  it('ボスの体力・速さは、定義どおり(先のボスほど強い)', () => {
    const g = createGame();
    expect(g.bosses.map((b) => b.maxHp)).toEqual(BOSS_DEFS.map((d) => d.maxHp));
    expect(g.bosses.map((b) => b.speed)).toEqual(BOSS_DEFS.map((d) => d.speed));
  });

  it('ボスとザコ敵の位置は、ステージの配置に一致する', () => {
    const g = createGame();
    expect(g.bosses.map((b) => b.x)).toEqual(STAGE.bosses.map((b) => b.x));
    expect(g.enemies.map((e) => [e.kind, e.x])).toEqual(STAGE.enemies.map((e) => [e.kind, e.x]));
  });

  it('更新すると、ザコ敵とボスが動く(プレイヤーが遠くても)', () => {
    const g0 = createGame();
    const g = run(g0, NO_INPUT, 60);
    expect(g.bosses[0]!.x).not.toBe(g0.bosses[0]!.x);
    const scurrier = g.enemies.findIndex((e) => e.kind === 'scurrier');
    expect(g.enemies[scurrier]!.x).not.toBe(g0.enemies[scurrier]!.x);
  });
});

describe('ザコ敵との接触(統合)', () => {
  it('上から踏むと敵が倒れ、HP は減らず、部品もドロップしない', () => {
    const e = enemy('plodder', 1000);
    const g = stepGame(world([e], [], { player: falling(e) }), NO_INPUT, FIXED_DT);
    expect(g.enemies[0]!.alive).toBe(false);
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.parts).toHaveLength(0);
    expect(g.player.vy).toBe(-STOMP_BOUNCE_SPEED);
  });

  it('横から触れるとHPが 1 減り、2 秒の無敵になり、小さく跳ね上がる', () => {
    const e = enemy('plodder', 1000);
    const player = createPlayer(e.x - PLAYER_WIDTH + 10);
    const g = stepGame(world([e], [], { player }), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
    expect(g.hitInvuln).toBe(PLAYER_INVULN_TIME);
    expect(g.player.vy).toBe(-HIT_BOUNCE_SPEED);
  });

  it('無敵の間は、重なったまま更新しても被弾せず、敵を通り抜けられる(押し戻されない)', () => {
    const e = enemy('plodder', 1000);
    let g = stepGame(world([e], [], { player: createPlayer(e.x - PLAYER_WIDTH + 10) }), NO_INPUT, FIXED_DT);
    for (let i = 0; i < 60; i++) g = stepGame(g, { ...NO_INPUT, right: true }, FIXED_DT);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
    expect(g.player.x).toBeGreaterThan(e.x + ENEMY_SIZE); // 通り抜けた
  });

  it('無敵が終わったあとに重なっていると、再び被弾する', () => {
    const e = enemy('plodder', 1000);
    let g = stepGame(world([e], [], { player: createPlayer(e.x - PLAYER_WIDTH + 10) }), NO_INPUT, FIXED_DT);
    // 無敵が切れるまで待ち(その間は敵と重なる位置に戻す)、再び接触させる
    for (let i = 0; i < 130; i++) {
      g = stepGame({ ...g, player: createPlayer(e.x - PLAYER_WIDTH + 10) }, NO_INPUT, FIXED_DT);
    }
    expect(g.hp).toBe(PLAYER_MAX_HP - 2);
  });

  it('HP が 1 のときに触れると、HP 0 で死亡する', () => {
    const e = enemy('plodder', 1000);
    const g = stepGame(
      world([e], [], { player: createPlayer(e.x - PLAYER_WIDTH + 10), hp: 1 }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.hp).toBe(0);
    expect(g.dead).toBe(true);
  });

  it('ボスとザコ敵に同時に触れても、被弾は 1 回だけ', () => {
    const boss = stillBoss(1000);
    const e = enemy('plodder', 1000 + 80 - 10);
    const player: Player = { ...createPlayer(1000 + 80 - 20) }; // ボスの右側、敵の左側に重なる
    const g = stepGame(world([e], [boss], { player }), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
  });

  it('ザコ敵は、プレイヤーの位置に反応して動く(ねぼすけが近づくと突進する)', () => {
    const sleeper = createEnemy('sleeper', 1500, 0, 5000);
    const player = createPlayer(1500 + 100); // 水平 100 ほど右
    const g = run(world([sleeper], [], { player }), NO_INPUT, 10);
    expect(g.enemies[0]!.x).toBeGreaterThan(1500);
  });
});

describe('ボスごとのドロップと部品 10 個', () => {
  it('倒したボスだけが部品を 1 個落とし、他のボスは影響を受けない', () => {
    const a = stillBoss(1000, BOSS_DEFS[0]!, { hp: 1 });
    const b = stillBoss(3000, BOSS_DEFS[1]!);
    const g = stepGame(world([], [a, b], { player: falling(createEnemy('plodder', 1000, 1000, 1000), 5, 300) }), NO_INPUT, FIXED_DT);
    // 1 体目の真上から落ちて踏みつけ(体力 1 → 撃破)
    const g2 = stepGame(
      world([], [a, b], { player: { x: a.x + 20, y: a.y - H - 5, vx: 0, vy: 300, onGround: false } }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.parts).toHaveLength(0); // ボスを踏んでいない更新では、何も落ちない
    expect(g2.bosses[0]!.alive).toBe(false);
    expect(g2.bosses[1]!.alive).toBe(true);
    expect(g2.bosses[1]!.hp).toBe(BOSS_DEFS[1]!.maxHp);
    expect(g2.parts).toHaveLength(1);
  });

  it('生存中のボスの部品は存在せず、倒したあとの追加のドロップもない', () => {
    const a = stillBoss(1000, BOSS_DEFS[0]!, { hp: 1 });
    let g = stepGame(
      world([], [a], { player: { x: a.x + 20, y: a.y - H - 5, vx: 0, vy: 300, onGround: false } }),
      NO_INPUT,
      FIXED_DT,
    );
    const total = () => g.parts.length + g.partsCollected;
    expect(total()).toBe(1);
    g = run({ ...g, player: createPlayer(100) }, NO_INPUT, 300);
    expect(total()).toBe(1);
  });

  it('10 体すべてを倒すと、部品が合計 10 個ドロップされる', () => {
    const bosses = BOSS_DEFS.map((def, k) => stillBoss(1000 + k * 600, def, { hp: 1 }));
    let g = world([], bosses);
    for (let k = 0; k < 10; k++) {
      const b = g.bosses[k]!;
      g = stepGame(
        { ...g, player: { x: b.x + 20, y: b.y - H - 5, vx: 0, vy: 300, onGround: false } },
        NO_INPUT,
        FIXED_DT,
      );
      expect(g.bosses[k]!.alive).toBe(false);
      expect(g.parts.length + g.partsCollected).toBe(k + 1);
    }
    expect(g.bosses.every((b) => !b.alive)).toBe(true);
    expect(g.parts.length + g.partsCollected).toBe(10);
    expect(RAFT_PARTS_REQUIRED).toBe(10);
  });

  it('部品を 9 個では、イカダは未完成で、10 個目を拾うと完成する', () => {
    const part = { x: 500, y: GROUND_Y - 24, vy: 0, grounded: true };
    const near = createPlayer(500);
    const nine = stepGame(world([], [], { player: createPlayer(100), partsCollected: 9 }), NO_INPUT, FIXED_DT);
    expect(nine.raftComplete).toBe(false);
    const ten = stepGame(world([], [], { player: near, partsCollected: 9, parts: [part] }), NO_INPUT, FIXED_DT);
    expect(ten.partsCollected).toBe(10);
    expect(ten.raftComplete).toBe(true);
  });
});

describe('再プレイでの初期化', () => {
  it('敵とボスを倒したあと、クリア画面から再プレイすると、すべて初期状態に戻る', () => {
    const g0 = createGame();
    const killed = {
      ...g0,
      enemies: g0.enemies.map((e, i) => (i < 5 ? { ...e, alive: false } : e)),
      bosses: g0.bosses.map((b, i) => (i < 3 ? { ...b, alive: false, hp: 0 } : b)),
      parts: [{ x: 500, y: 100, vy: 0, grounded: false }],
      partsCollected: 4,
      escaped: true,
    };
    const f = stepFlow({ phase: 'cleared', game: killed, confirmHeld: false }, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game).toEqual(createGame());
    expect(f.game.enemies.every((e) => e.alive)).toBe(true);
    expect(f.game.bosses.every((b) => b.alive && b.hp === b.maxHp)).toBe(true);
    expect(f.game.parts).toEqual([]);
    expect(f.game.partsCollected).toBe(0);
  });

  it('ゲームオーバー画面からの再プレイでも、敵とボスと部品が初期状態に戻る', () => {
    const g0 = createGame();
    const dead = {
      ...g0,
      hp: 0,
      dead: true,
      enemies: g0.enemies.map((e) => ({ ...e, alive: false })),
    };
    const f = stepFlow({ phase: 'gameover', game: dead, confirmHeld: false }, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game).toEqual(createGame());
  });

  it('createFlow の初期の世界も、ステージの配置どおり', () => {
    expect(createFlow().game).toEqual(createGame());
  });
});
