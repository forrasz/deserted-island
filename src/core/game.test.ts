import { describe, expect, it } from 'vitest';
import { createBoss, type Boss } from './boss';
import {
  BOSS_HEIGHT,
  BOSS_INVULN_TIME,
  BOSS_MAX_HP,
  BOSS_WIDTH,
  FIXED_DT,
  GROUND_Y,
  PART_HEIGHT,
  PART_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  STOMP_BOUNCE_SPEED,
  STOMP_TOLERANCE,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { createPlayer, stepPlayer, type Player, type WorldBounds } from './player';
import { createPart } from './raft-part';

const JUMP: InputState = { ...NO_INPUT, jump: true };
const RIGHT: InputState = { ...NO_INPUT, right: true };

/** ボスを動かさず x=1000 に固定した状態。 */
function stillBoss(over: Partial<Boss> = {}): Boss {
  return { ...createBoss(1000, 1000, 1000), vx: 0, ...over };
}

function withBoss(boss: Boss, player: Player, extra: Partial<GameState> = {}): GameState {
  return { ...createGame(), bosses: [boss], enemies: [], player, ...extra };
}

/** ボスの真上(x が重なる位置)で、指定の高さ・速度の空中プレイヤー。 */
function airPlayerAbove(boss: Boss, gap: number, vy: number): Player {
  return {
    x: boss.x + 20,
    y: boss.y - PLAYER_HEIGHT - gap,
    vx: 0,
    vy,
    onGround: false,
  };
}

function run(s: GameState, input: InputState, n: number): GameState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = stepGame(cur, input, FIXED_DT);
  return cur;
}

describe('createGame', () => {
  it('ボスが 1 体、地面の上に体力 3 で存在し、部品はなく所持数は 0', () => {
    const g = createGame();
    expect(g.bosses).toHaveLength(10);
    for (const b of g.bosses) {
      expect(b.alive).toBe(true);
      expect(b.hp).toBe(b.maxHp);
      expect(b.y + BOSS_HEIGHT).toBe(GROUND_Y);
    }
    expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP);
    expect(g.parts).toEqual([]);
    expect(g.partsCollected).toBe(0);
  });

  it('ボスと関係のない移動は stepPlayer と同じ結果になる', () => {
    let g = createGame();
    let p = createPlayer();
    const inputs = [RIGHT, RIGHT, JUMP, NO_INPUT, NO_INPUT, RIGHT];
    for (const input of inputs) {
      g = stepGame(g, input, FIXED_DT);
      p = stepPlayer(p, input, FIXED_DT);
      expect(g.player).toEqual(p);
    }
  });

  it('ボス生存中は何も起きなければ部品は出現しない', () => {
    const g = run(createGame(), NO_INPUT, 200);
    expect(g.parts).toEqual([]);
  });
});

describe('踏みつけ', () => {
  it('落下中に上から重なると、ボスの体力が 1 減り上向きに跳ね返る', () => {
    const boss = stillBoss();
    const g = stepGame(withBoss(boss, airPlayerAbove(boss, 5, 300)), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP - 1);
    expect(g.player.vy).toBe(-STOMP_BOUNCE_SPEED);
    expect(g.player.onGround).toBe(false);
    expect(g.player.y + PLAYER_HEIGHT).toBe(boss.y);
  });

  it('更新前の下辺が許容量内なら踏みつけになる', () => {
    const boss = stillBoss();
    const p = airPlayerAbove(boss, -(STOMP_TOLERANCE - 1), 300); // 下辺が上辺より少し下
    const g = stepGame(withBoss(boss, p), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP - 1);
  });

  it('更新前の下辺が許容量を超えて深く重なっていれば踏みつけではない(側面扱い)', () => {
    const boss = stillBoss();
    const p = airPlayerAbove(boss, -(STOMP_TOLERANCE + 20), 300);
    const g = stepGame(withBoss(boss, p), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP);
  });

  it('上昇中の接触では踏みつけにならず、体力は減らない', () => {
    const boss = stillBoss();
    const p = airPlayerAbove(boss, -10, -500);
    const g = stepGame(withBoss(boss, p), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP);
  });

  it('跳ね返り直後の空中では、ジャンプ入力を与えても通常ジャンプは発生しない', () => {
    const boss = stillBoss();
    const stomped = stepGame(withBoss(boss, airPlayerAbove(boss, 5, 300)), NO_INPUT, FIXED_DT);
    const next = stepGame(stomped, JUMP, FIXED_DT);
    // 跳ね返りの速度から重力ぶんだけ減速しており、ジャンプ初速(-750)にはなっていない
    expect(next.player.vy).toBeGreaterThan(-STOMP_BOUNCE_SPEED);
    expect(next.player.vy).toBeLessThan(0);
  });

  it('無敵時間中は踏みつけても体力は追加で減らない(跳ね返りは起きる)', () => {
    const boss = stillBoss({ hp: 2, invuln: BOSS_INVULN_TIME });
    const g = stepGame(withBoss(boss, airPlayerAbove(boss, 5, 300)), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(2);
    expect(g.player.vy).toBe(-STOMP_BOUNCE_SPEED);
  });

  it('無敵時間の終了後は再び踏みつけでダメージが入る', () => {
    const boss = stillBoss({ hp: 2, invuln: 0 });
    const g = stepGame(withBoss(boss, airPlayerAbove(boss, 5, 300)), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(1);
  });

  it('実際のジャンプで、ボスの上に落ちて踏みつけられる', () => {
    const boss = stillBoss({ x: 300, left: 300, right: 300 });
    let g = withBoss(boss, createPlayer(300 - PLAYER_WIDTH - 40));
    // 右へ歩きながらジャンプし、ボスの上に着地する軌道
    g = stepGame(g, { ...RIGHT, jump: true }, FIXED_DT);
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) {
      g = stepGame(g, RIGHT, FIXED_DT);
      hit = g.bosses[0]!.hp < BOSS_MAX_HP;
    }
    expect(hit).toBe(true);
  });
});

describe('側面接触', () => {
  it('左から歩いて接触すると、左へ押し戻されボスの体力は変わらない', () => {
    const boss = stillBoss();
    const player: Player = { ...createPlayer(boss.x - PLAYER_WIDTH + 10), vx: 0 };
    const g = stepGame(withBoss(boss, player), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP);
    expect(g.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(boss.x);
  });

  it('右から接触すると、右へ押し戻される', () => {
    const boss = stillBoss();
    const player = createPlayer(boss.x + BOSS_WIDTH - 10);
    const g = stepGame(withBoss(boss, player), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP);
    expect(g.player.x).toBeGreaterThanOrEqual(boss.x + BOSS_WIDTH);
  });

  it('歩き続けてもボスをすり抜けない', () => {
    const boss = stillBoss();
    let g = withBoss(boss, createPlayer(boss.x - 200));
    for (let i = 0; i < 300; i++) {
      g = stepGame(g, RIGHT, FIXED_DT);
      expect(g.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(boss.x + 1e-6);
    }
    expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP);
  });

  it('押し戻しの結果、プレイヤーはワールド範囲を出ない', () => {
    const world: WorldBounds = { width: 200, groundY: GROUND_Y };
    const boss: Boss = { ...createBoss(30, 30, 30, GROUND_Y), vx: 0 };
    const player = createPlayer(0, world);
    const g = stepGame(withBoss(boss, player), NO_INPUT, FIXED_DT, world);
    expect(g.player.x).toBeGreaterThanOrEqual(0);
    expect(g.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(world.width);
  });
});

describe('撃破', () => {
  it('撃破済みのボスの位置を通過しても、押し戻しも跳ね返りも起きない', () => {
    const boss = stillBoss({ alive: false, hp: 0 });
    const player = createPlayer(boss.x + 10);
    const g = stepGame(withBoss(boss, player), NO_INPUT, FIXED_DT);
    expect(g.player.x).toBe(player.x);
    expect(g.player.vy).toBe(0);
  });
});

describe('ドロップ', () => {
  const lastHitBoss = () => stillBoss({ hp: 1 });

  it('ボスを撃破した更新で、その位置に部品が 1 個出現する', () => {
    const boss = lastHitBoss();
    const g = stepGame(withBoss(boss, airPlayerAbove(boss, 5, 300)), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.alive).toBe(false);
    expect(g.parts).toHaveLength(1);
    const part = g.parts[0]!;
    expect(part.x + PART_WIDTH / 2).toBeCloseTo(boss.x + BOSS_WIDTH / 2, 6);
    expect(part.y).toBeGreaterThanOrEqual(boss.y);
    expect(part.y + PART_HEIGHT).toBeLessThanOrEqual(boss.y + BOSS_HEIGHT + 1);
  });

  it('ドロップは 1 回だけで、その後に追加の部品は出ない', () => {
    const boss = lastHitBoss();
    let g = stepGame(withBoss(boss, airPlayerAbove(boss, 5, 300)), NO_INPUT, FIXED_DT);
    const total = () => g.parts.length + g.partsCollected;
    expect(total()).toBe(1);
    for (let i = 0; i < 300; i++) {
      g = stepGame(g, NO_INPUT, FIXED_DT);
      expect(total()).toBe(1);
    }
  });

  it('生存中のボスへのダメージ(撃破に至らない)では部品は出ない', () => {
    const boss = stillBoss({ hp: 2 });
    const g = stepGame(withBoss(boss, airPlayerAbove(boss, 5, 300)), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.alive).toBe(true);
    expect(g.parts).toHaveLength(0);
  });
});

describe('拾得', () => {
  const deadBoss = () => stillBoss({ alive: false, hp: 0 });

  it('地面の部品にプレイヤーが重なると、所持数が 1 になり部品が消える', () => {
    const player = createPlayer(500);
    const part = { ...createPart(510, GROUND_Y - PART_HEIGHT), grounded: true };
    const g = stepGame(withBoss(deadBoss(), player, { parts: [part] }), NO_INPUT, FIXED_DT);
    expect(g.partsCollected).toBe(1);
    expect(g.parts).toHaveLength(0);
  });

  it('拾得は 1 回だけで、同じ位置に留まっても所持数は増えない', () => {
    const player = createPlayer(500);
    const part = { ...createPart(510, GROUND_Y - PART_HEIGHT), grounded: true };
    const g = run(withBoss(deadBoss(), player, { parts: [part] }), NO_INPUT, 60);
    expect(g.partsCollected).toBe(1);
  });

  it('落下中の部品でも、重なれば拾得できる', () => {
    const player = createPlayer(500);
    const part = createPart(510, player.y + 5); // 空中(落下中)でプレイヤーと重なる
    const g = stepGame(withBoss(deadBoss(), player, { parts: [part] }), NO_INPUT, FIXED_DT);
    expect(g.partsCollected).toBe(1);
    expect(g.parts).toHaveLength(0);
  });

  it('離れている間は所持数が変わらず、部品は残る', () => {
    const player = createPlayer(100);
    const part = { ...createPart(900, GROUND_Y - PART_HEIGHT), grounded: true };
    const g = run(withBoss(deadBoss(), player, { parts: [part] }), NO_INPUT, 60);
    expect(g.partsCollected).toBe(0);
    expect(g.parts).toHaveLength(1);
  });
});

describe('通しの流れ', () => {
  it('3 回踏みつけて撃破 → ドロップ → 拾得で所持数が 1 になる', () => {
    let g = withBoss(stillBoss(), createPlayer(0));
    for (let hits = 0; hits < 3; hits++) {
      // ボスの真上から落下して踏みつける
      g = { ...g, player: airPlayerAbove(g.bosses[0]!, 5, 300) };
      g = stepGame(g, NO_INPUT, FIXED_DT);
      expect(g.bosses[0]!.hp).toBe(BOSS_MAX_HP - hits - 1);
      // 無敵が切れるまで待つ(その間、プレイヤーは空中でボスの上)
      g = run({ ...g, player: { ...g.player, x: 0, y: GROUND_Y - PLAYER_HEIGHT, vy: 0, onGround: true } },
        NO_INPUT, Math.ceil(BOSS_INVULN_TIME / FIXED_DT) + 1);
    }
    expect(g.bosses[0]!.alive).toBe(false);
    expect(g.parts.length + g.partsCollected).toBe(1);
    // 部品の位置まで歩いて拾う
    const target = g.parts[0]?.x ?? 0;
    g = { ...g, player: createPlayer(target - 100) };
    g = run(g, RIGHT, 200);
    expect(g.partsCollected).toBe(1);
    expect(g.parts).toHaveLength(0);
  });
});
