import { describe, expect, it } from 'vitest';
import { createBoss } from './boss';
import { ENDING_DURATION, FIXED_DT, PLAYER_WIDTH, RAFT_PARTS_REQUIRED, SEA_X } from './config';
import { createFlow, stepFlow, type Flow } from './flow';
import { createGame } from './game';
import { NO_INPUT, type InputState } from './input';
import { createPlayer } from './player';

const ENTER: InputState = { ...NO_INPUT, confirm: true };
const RIGHT: InputState = { ...NO_INPUT, right: true };

function run(f: Flow, input: InputState, n: number): Flow {
  let cur = f;
  for (let i = 0; i < n; i++) cur = stepFlow(cur, input, FIXED_DT);
  return cur;
}

/** プレイ中で、イカダ完成済み・海の手前にいる状態。 */
function readyToEscape(): Flow {
  const game = {
    ...createGame(),
    raftComplete: true,
    partsCollected: RAFT_PARTS_REQUIRED,
    player: createPlayer(SEA_X - 200),
    bosses: [{ ...createBoss(), alive: false, hp: 0 }],
    enemies: [],
  };
  return { phase: 'playing', game, confirmHeld: false, cheat: 0, ending: 0 };
}

/** エンディングが終わって、クリア画面になった Flow(決定キーは離れている)。 */
function cleared(): Flow {
  const f = run(readyToEscape(), RIGHT, 300);
  expect(f.phase).toBe('ending');
  const c = run(f, NO_INPUT, Math.round(ENDING_DURATION * 60) + 2);
  expect(c.phase).toBe('cleared');
  return stepFlow(c, NO_INPUT, FIXED_DT);
}

describe('タイトル', () => {
  it('起動直後はタイトルで、世界は初期状態', () => {
    const f = createFlow();
    expect(f.phase).toBe('title');
    expect(f.game).toEqual(createGame());
  });

  it('タイトル中は更新しても世界が進行しない', () => {
    const f = run(createFlow(), NO_INPUT, 120);
    expect(f.phase).toBe('title');
    expect(f.game).toEqual(createGame());
  });

  it('移動キーやスペースではプレイが始まらない', () => {
    const f = run(createFlow(), { ...NO_INPUT, right: true, left: true, jump: true }, 30);
    expect(f.phase).toBe('title');
    expect(f.game).toEqual(createGame());
  });

  it('Enter で、初期状態の新しいゲームとしてプレイが始まる', () => {
    const f = stepFlow(createFlow(), ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game).toEqual(createGame());
  });
});

describe('決定キーは押した瞬間にのみ反応する', () => {
  it('Enter を押し続けても、プレイ中に遷移もプレイヤーの移動も起きない', () => {
    let f = stepFlow(createFlow(), ENTER, FIXED_DT);
    const startX = f.game.player.x;
    f = run(f, ENTER, 120);
    expect(f.phase).toBe('playing');
    expect(f.game.player.x).toBe(startX);
  });

  it('クリア画面で Enter が押されたままでは再プレイが始まらず、離して押し直すと始まる', () => {
    // クリア画面に入った時点で Enter が押されっぱなしの状況(エンディングの間も押し続けている)
    let f = run(readyToEscape(), { ...RIGHT, confirm: true }, 300);
    expect(f.phase).toBe('ending');
    f = run(f, ENTER, Math.round(ENDING_DURATION * 60) + 2);
    expect(f.phase).toBe('cleared');
    f = run(f, ENTER, 60);
    expect(f.phase).toBe('cleared');
    f = stepFlow(f, NO_INPUT, FIXED_DT);
    f = stepFlow(f, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
  });

  it('遷移した更新ではゲームを進めない', () => {
    const f = stepFlow(createFlow(), { ...ENTER, right: true }, FIXED_DT);
    expect(f.game).toEqual(createGame());
  });
});

describe('クリア', () => {
  it('プレイ中に脱出が成立すると、エンディングになり、12 秒後にクリア画面になる', () => {
    const f = run(readyToEscape(), RIGHT, 300);
    expect(f.phase).toBe('ending');
    expect(f.game.escaped).toBe(true);
    expect(run(f, NO_INPUT, Math.round(ENDING_DURATION * 60) + 2).phase).toBe('cleared');
  });

  it('プレイ中は世界が進行する(ボスが往復し、プレイヤーが動く)', () => {
    let f: Flow = { phase: 'playing', game: createGame(), confirmHeld: false, cheat: 0, ending: 0 };
    const boss0 = f.game.bosses[0]!.x;
    f = run(f, RIGHT, 30);
    expect(f.game.bosses[0]!.x).not.toBe(boss0);
    expect(f.game.player.x).toBeGreaterThan(100);
  });

  it('クリア画面では更新しても世界が進行せず、移動・ジャンプ入力も影響しない', () => {
    const f0 = cleared();
    const f = run(f0, { ...NO_INPUT, right: true, left: true, jump: true }, 120);
    expect(f.phase).toBe('cleared');
    expect(f.game).toEqual(f0.game);
  });
});

describe('再プレイ', () => {
  it('クリア画面で Enter を押すと、すべて初期状態でプレイが始まる', () => {
    const f = stepFlow(cleared(), ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game).toEqual(createGame());
    expect(f.game.partsCollected).toBe(0);
    expect(f.game.raftComplete).toBe(false);
    expect(f.game.escaped).toBe(false);
    for (const b of f.game.bosses) expect(b.hp).toBe(b.maxHp);
    expect(f.game.parts).toEqual([]);
  });

  it('再プレイしても、もう一度クリアでき、さらに再プレイできる', () => {
    let f = stepFlow(cleared(), ENTER, FIXED_DT);
    f = stepFlow(f, NO_INPUT, FIXED_DT);
    // 2 周目: 同じ条件で脱出
    f = { ...readyToEscape(), confirmHeld: false, cheat: 0, ending: 0 };
    f = run(f, RIGHT, 300);
    expect(f.phase).toBe('ending');
    f = run(f, NO_INPUT, Math.round(ENDING_DURATION * 60) + 2);
    expect(f.phase).toBe('cleared');
    f = stepFlow(stepFlow(f, NO_INPUT, FIXED_DT), ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game).toEqual(createGame());
  });

  it('プレイヤー右辺は海の開始位置に達している(クリア時)', () => {
    const f = run(readyToEscape(), RIGHT, 300);
    expect(f.game.player.x + PLAYER_WIDTH).toBeGreaterThanOrEqual(SEA_X);
  });
});
