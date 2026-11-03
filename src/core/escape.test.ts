import { describe, expect, it } from 'vitest';
import { createBoss } from './boss';
import {
  FIXED_DT,
  GROUND_Y,
  PART_HEIGHT,
  PLAYER_WIDTH,
  RAFT_PARTS_REQUIRED,
  SEA_X,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { createPlayer } from './player';
import { createPart } from './raft-part';

const RIGHT: InputState = { ...NO_INPUT, right: true };
const RIGHT_JUMP: InputState = { ...NO_INPUT, right: true, jump: true };

/** ボスを撃破済みにして、邪魔にならない状態を作る。 */
function base(over: Partial<GameState> = {}): GameState {
  return {
    ...createGame(),
    boss: { ...createBoss(), alive: false, hp: 0 },
    ...over,
  };
}

function run(s: GameState, input: InputState, n: number): GameState {
  let cur = s;
  for (let i = 0; i < n; i++) cur = stepGame(cur, input, FIXED_DT);
  return cur;
}

function groundedPart(x: number) {
  return { ...createPart(x, GROUND_Y - PART_HEIGHT), grounded: true };
}

describe('イカダの完成', () => {
  it('開始直後は未完成で、脱出もしていない', () => {
    const g = createGame();
    expect(g.raftComplete).toBe(false);
    expect(g.escaped).toBe(false);
  });

  it('部品が足りない間(所持数 0)は更新を重ねても未完成のまま', () => {
    expect(run(base(), NO_INPUT, 120).raftComplete).toBe(false);
  });

  it('必要数(1 個)を拾った同じ更新でイカダが完成する', () => {
    const player = createPlayer(500);
    const g = stepGame(base({ player, parts: [groundedPart(510)] }), NO_INPUT, FIXED_DT);
    expect(g.partsCollected).toBe(RAFT_PARTS_REQUIRED);
    expect(g.raftComplete).toBe(true);
  });

  it('完成後は更新を重ねても完成状態のまま', () => {
    const player = createPlayer(500);
    let g = stepGame(base({ player, parts: [groundedPart(510)] }), NO_INPUT, FIXED_DT);
    g = run(g, NO_INPUT, 300);
    expect(g.raftComplete).toBe(true);
  });
});

describe('イカダ未完成時は海へ入れない', () => {
  const nearShore = () => base({ player: createPlayer(SEA_X - 200) });

  it('右へ押し続けても、右辺が海の開始位置を超えず、脱出しない', () => {
    const g = run(nearShore(), RIGHT, 300);
    expect(g.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(SEA_X);
    expect(g.player.x + PLAYER_WIDTH).toBeCloseTo(SEA_X, 6);
    expect(g.escaped).toBe(false);
  });

  it('ジャンプしながらでも、空中で海の開始位置を超えない', () => {
    let g = nearShore();
    for (let i = 0; i < 400; i++) {
      g = stepGame(g, RIGHT_JUMP, FIXED_DT);
      expect(g.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(SEA_X + 1e-9);
    }
    expect(g.escaped).toBe(false);
  });

  it('海から離れている間は自由に動ける', () => {
    const g = run(base({ player: createPlayer(500) }), RIGHT, 30);
    expect(g.player.x).toBeGreaterThan(500);
  });

  it('海に接したまま更新を続けても、脱出は判定されない', () => {
    const g = run(nearShore(), RIGHT, 600);
    expect(g.escaped).toBe(false);
  });
});

describe('イカダ完成後の脱出', () => {
  it('完成していて海に達すると脱出が成立する', () => {
    const g = run(base({ player: createPlayer(SEA_X - 200), raftComplete: true, partsCollected: 1 }), RIGHT, 300);
    expect(g.escaped).toBe(true);
  });

  it('完成していても、海の手前にいる間は脱出しない', () => {
    const g = run(base({ player: createPlayer(500), raftComplete: true, partsCollected: 1 }), NO_INPUT, 60);
    expect(g.escaped).toBe(false);
  });

  it('完成後は海の領域へ入れる(右辺が海の開始位置に達する)', () => {
    const g = run(base({ player: createPlayer(SEA_X - 200), raftComplete: true, partsCollected: 1 }), RIGHT, 300);
    expect(g.player.x + PLAYER_WIDTH).toBeGreaterThanOrEqual(SEA_X);
  });

  it('海に接しているときに部品を拾うと、遅くとも次の更新までに脱出が成立する', () => {
    const player = createPlayer(SEA_X - PLAYER_WIDTH);
    const part = groundedPart(player.x + 5);
    let g = base({ player, parts: [part] });
    g = stepGame(g, RIGHT, FIXED_DT);
    g = stepGame(g, RIGHT, FIXED_DT);
    expect(g.raftComplete).toBe(true);
    expect(g.escaped).toBe(true);
  });

  it('一度脱出したら、後の更新で取り消されない', () => {
    let g = run(base({ player: createPlayer(SEA_X - 200), raftComplete: true, partsCollected: 1 }), RIGHT, 300);
    g = run(g, NO_INPUT, 60);
    expect(g.escaped).toBe(true);
  });
});
