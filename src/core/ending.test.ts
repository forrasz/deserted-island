import { describe, expect, it } from 'vitest';
import { createBoss } from './boss';
import { KONAMI_CODE } from './cheat';
import { ENDING_DURATION, FIXED_DT, RAFT_PARTS_REQUIRED, SEA_X } from './config';
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

/** 海のすぐ手前にいて、イカダが完成している(右へ進むと脱出する)プレイ中の Flow。 */
function escaping(): Flow {
  return {
    phase: 'playing',
    game: {
      ...createGame(),
      raftComplete: true,
      partsCollected: RAFT_PARTS_REQUIRED,
      player: createPlayer(SEA_X - 200),
      bosses: [{ ...createBoss(), alive: false, hp: 0 }],
      enemies: [],
    },
    confirmHeld: false,
    cheat: 0,
    ending: 0,
  };
}
/** 脱出が成立して、エンディングに入った、その更新の Flow。 */
const inEnding = (): Flow => {
  let f = escaping();
  for (let i = 0; i < 600 && f.phase === 'playing'; i++) f = stepFlow(f, RIGHT, FIXED_DT);
  expect(f.phase).toBe('ending');
  return f;
};

describe('脱出のあとにエンディングが流れる(4.1)', () => {
  it('初期の Flow は、エンディングの経過 0', () => {
    expect(createFlow().ending).toBe(0);
  });

  it('脱出が成立した直後は、エンディングで、クリア画面ではない', () => {
    const f = inEnding();
    expect(f.game.escaped).toBe(true);
    expect(f.ending).toBe(0);
  });

  it('エンディングの経過時間が進み、12 秒で、クリア画面になる(11.9 秒ではまだ)', () => {
    const f = inEnding();
    const t0 = f.ending;
    const mid = run(f, NO_INPUT, 60);
    expect(mid.phase).toBe('ending');
    expect(mid.ending - t0).toBeCloseTo(1, 6);
    const almost = run(f, NO_INPUT, Math.round(ENDING_DURATION * 60) - 5);
    expect(almost.phase).toBe('ending');
    const done = run(almost, NO_INPUT, 10);
    expect(done.phase).toBe('cleared');
  });

  it('スキップできない: 決定・移動・ジャンプを入力し続けても、エンディングは進み、飛ばされない', () => {
    let f = inEnding();
    for (let i = 0; i < 60 * 6; i++) {
      f = stepFlow(f, { ...ENTER, right: true, jump: true }, FIXED_DT);
      expect(f.phase).toBe('ending');
    }
    expect(f.ending).toBeGreaterThan(5);
    // 決定を離して押し直しても、飛ばせない
    f = stepFlow(stepFlow(f, NO_INPUT, FIXED_DT), ENTER, FIXED_DT);
    expect(f.phase).toBe('ending');
  });

  it('エンディングの間は、世界(ボス・敵・プレイヤー・HP・無敵時間)が変化しない', () => {
    const f = inEnding();
    const g = run(f, { ...RIGHT, jump: true }, 120).game;
    expect(g.player).toEqual(f.game.player);
    expect(g.bosses).toEqual(f.game.bosses);
    expect(g.enemies).toEqual(f.game.enemies);
    expect(g.hp).toBe(f.game.hp);
    expect(g.hitInvuln).toBe(f.game.hitInvuln);
  });

  it('エンディングの間は、隠しコマンドも受け付けない', () => {
    const f = stepFlow(inEnding(), NO_INPUT, FIXED_DT, KONAMI_CODE);
    expect(f.game.invincible).toBe(false);
    expect(f.cheat).toBe(0);
  });

  it('エンディングが終わったクリア画面から、決定でやり直すと、すべて初期状態に戻る', () => {
    let f = run(inEnding(), NO_INPUT, Math.round(ENDING_DURATION * 60) + 2);
    expect(f.phase).toBe('cleared');
    f = stepFlow(f, NO_INPUT, FIXED_DT);
    f = stepFlow(f, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.ending).toBe(0);
    expect(f.game).toEqual(createGame());
    expect(f.game.intro).toEqual({ state: 'sleeping', t: 0 });
  });
});
