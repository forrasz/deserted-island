import { describe, expect, it } from 'vitest';
import type { Rect } from './collision';
import {
  FIXED_DT,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from './config';
import { NO_INPUT, type InputState } from './input';
import { stepPlayer, type Player } from './player';
import type { WorldBounds } from './terrain';

const H = PLAYER_HEIGHT;
const W = PLAYER_WIDTH;
const RIGHT: InputState = { ...NO_INPUT, right: true };
const LEFT: InputState = { ...NO_INPUT, left: true };
const JUMP: InputState = { ...NO_INPUT, jump: true };
const RIGHT_JUMP: InputState = { ...NO_INPUT, right: true, jump: true };

const GROUND = 1000;
const HEIGHT = 1080;

function world(over: Partial<WorldBounds> = {}): WorldBounds {
  return {
    width: 3000,
    groundY: GROUND,
    height: HEIGHT,
    solids: [{ x: 0, y: GROUND, w: 3000, h: HEIGHT - GROUND }],
    platforms: [],
    ...over,
  };
}

function standing(x: number, y = GROUND - H): Player {
  return { x, y, vx: 0, vy: 0, onGround: true };
}

function run(p: Player, input: InputState, n: number, w: WorldBounds): Player {
  let cur = p;
  for (let i = 0; i < n; i++) cur = stepPlayer(cur, input, FIXED_DT, w);
  return cur;
}

describe('崖(壁)', () => {
  const cliff: Rect = { x: 600, y: GROUND - 100, w: 200, h: 100 };
  const w = world({ solids: [{ x: 0, y: GROUND, w: 3000, h: HEIGHT - GROUND }, cliff] });

  it('横から崖に向かって歩き続けても、崖の側面で止まり、中に入らない', () => {
    const p = run(standing(300), RIGHT, 300, w);
    expect(p.x + W).toBeLessThanOrEqual(cliff.x + 1e-6);
    expect(p.x + W).toBeCloseTo(cliff.x, 5);
    expect(p.onGround).toBe(true);
  });

  it('崖の右側からも、側面で止まる', () => {
    const p = run(standing(1000), LEFT, 300, w);
    expect(p.x).toBeGreaterThanOrEqual(cliff.x + cliff.w - 1e-6);
  });

  it('壁際でジャンプして右へ押し続けると、崖の上面に着地し、地面に接している状態になる', () => {
    let p = standing(cliff.x - W - 20);
    let landedOnTop = false;
    for (let i = 0; i < 120; i++) {
      p = stepPlayer(p, i === 0 ? RIGHT_JUMP : RIGHT, FIXED_DT, w);
      if (p.onGround && Math.abs(p.y + H - cliff.y) < 0.5) landedOnTop = true;
    }
    expect(landedOnTop).toBe(true);
    expect(p.vy).toBeGreaterThanOrEqual(0);
  });

  it('崖の上を歩いて端を越えると落下し、地面に降りる', () => {
    const top = standing(650, cliff.y - H);
    const p = run(top, RIGHT, 200, w);
    expect(p.x).toBeGreaterThan(cliff.x + cliff.w);
    expect(p.y + H).toBeCloseTo(GROUND, 5);
  });

  it('崖の上にとどまっている間、位置は変化しない', () => {
    const top = standing(650, cliff.y - H);
    const p = run(top, NO_INPUT, 60, w);
    expect(p).toEqual({ ...top, vy: 0, onGround: true });
  });
});

describe('崖の下面(頭ぶつけ)', () => {
  const ceiling: Rect = { x: 500, y: GROUND - 140, w: 300, h: 30 }; // 下面は GROUND - 110
  const w = world({ solids: [{ x: 0, y: GROUND, w: 3000, h: HEIGHT - GROUND }, ceiling] });

  it('崖の真下でジャンプすると、下面で上昇が止まり、通り抜けない', () => {
    let p = standing(600);
    let minTop = Infinity;
    let bonked = false;
    for (let i = 0; i < 60; i++) {
      const prevVy = p.vy;
      p = stepPlayer(p, i === 0 ? JUMP : NO_INPUT, FIXED_DT, w);
      minTop = Math.min(minTop, p.y);
      if (prevVy < 0 && p.vy >= 0) bonked = true;
    }
    expect(minTop).toBeGreaterThanOrEqual(ceiling.y + ceiling.h - 1e-6);
    expect(bonked).toBe(true);
    expect(p.y + H).toBeCloseTo(GROUND, 5);
  });
});

describe('浮島(下から抜けられる足場)', () => {
  const island: Rect = { x: 500, y: GROUND - 100, w: 200, h: 20 };
  const w = world({ platforms: [island] });

  it('真下からジャンプすると、上昇中は通り抜け、下降して上面に着地する', () => {
    let p = standing(560);
    let passedThrough = false;
    let landed = false;
    for (let i = 0; i < 120; i++) {
      p = stepPlayer(p, i === 0 ? JUMP : NO_INPUT, FIXED_DT, w);
      if (p.vy < 0 && p.y + H < island.y + island.h && p.y + H > island.y) passedThrough = true;
      if (p.onGround && Math.abs(p.y + H - island.y) < 0.5) landed = true;
    }
    expect(passedThrough).toBe(true);
    expect(landed).toBe(true);
    expect(p.y + H).toBeCloseTo(island.y, 5);
  });

  it('浮島の上に立っている間は、動かない', () => {
    const onIsland = standing(560, island.y - H);
    const p = run(onIsland, NO_INPUT, 60, w);
    expect(p.y).toBe(island.y - H);
    expect(p.onGround).toBe(true);
  });

  it('浮島の上からジャンプできる', () => {
    const onIsland = standing(560, island.y - H);
    const p = stepPlayer(onIsland, JUMP, FIXED_DT, w);
    expect(p.vy).toBeLessThan(0);
    expect(p.onGround).toBe(false);
  });

  it('崖の上からジャンプできる', () => {
    const cliff: Rect = { x: 500, y: GROUND - 100, w: 200, h: 100 };
    const w2 = world({ solids: [{ x: 0, y: GROUND, w: 3000, h: HEIGHT - GROUND }, cliff] });
    const p = stepPlayer(standing(560, cliff.y - H), JUMP, FIXED_DT, w2);
    expect(p.vy).toBeLessThan(0);
  });

  it('空中では、足場の上からでもジャンプしない(二重ジャンプ禁止)', () => {
    let p = stepPlayer(standing(560, island.y - H), JUMP, FIXED_DT, w);
    p = stepPlayer(p, JUMP, FIXED_DT, w);
    expect(p.vy).toBeGreaterThan(-JUMP_SPEED); // 初速(-750)にはならず、重力で減速している
  });

  it('横から浮島に触れても、水平方向では止まらず、通り抜ける', () => {
    // 浮島の厚みの範囲の高さを、空中で水平に通過する(下降中は着地しない高さから開始)
    const mid = island.y + 5 - H + 30;
    let p: Player = { x: 400, y: mid - 20, vx: 0, vy: -200, onGround: false };
    let minVy = 0;
    for (let i = 0; i < 25; i++) {
      p = stepPlayer(p, RIGHT, FIXED_DT, w);
      minVy = Math.min(minVy, p.vy);
    }
    expect(p.x).toBeGreaterThan(400 + 25 * MOVE_SPEED * FIXED_DT - 1);
  });

  it('浮島の上面より低い位置から落下しても、浮島には着地せず地面に降りる', () => {
    // 下辺が浮島の上面より 30px 下から、落下を始める
    const start: Player = { x: 560, y: island.y + 30 - H, vx: 0, vy: 0, onGround: false };
    let p = start;
    let landedOnIsland = false;
    for (let i = 0; i < 90; i++) {
      p = stepPlayer(p, NO_INPUT, FIXED_DT, w);
      if (p.onGround && Math.abs(p.y + H - island.y) < 0.5) landedOnIsland = true;
    }
    expect(landedOnIsland).toBe(false);
    expect(p.y + H).toBeCloseTo(GROUND, 5);
  });
});

describe('落下速度の上限', () => {
  it('高さ 1000 から落ちても、上限を超えず、途中の薄い浮島に着地する(すり抜けない)', () => {
    const thin: Rect = { x: 0, y: 700, w: 3000, h: 6 };
    const w = world({ platforms: [thin], height: 1700, solids: [{ x: 0, y: 1620, w: 3000, h: 80 }], groundY: 1620 });
    let p: Player = { x: 100, y: 0, vx: 0, vy: 0, onGround: false };
    let maxVy = 0;
    let landed = false;
    for (let i = 0; i < 400 && !landed; i++) {
      p = stepPlayer(p, NO_INPUT, FIXED_DT, w);
      maxVy = Math.max(maxVy, p.vy);
      if (p.onGround) landed = true;
    }
    expect(maxVy).toBeLessThanOrEqual(MAX_FALL_SPEED);
    expect(landed).toBe(true);
    expect(p.y + H).toBeCloseTo(thin.y, 5);
  });

  it('落下速度が上限に達したあとも、上限を超えない', () => {
    const w = world({ height: 4000, groundY: 3900, solids: [{ x: 0, y: 3900, w: 3000, h: 100 }] });
    let p: Player = { x: 100, y: 0, vx: 0, vy: 0, onGround: false };
    let maxVy = 0;
    for (let i = 0; i < 200; i++) {
      p = stepPlayer(p, NO_INPUT, FIXED_DT, w);
      maxVy = Math.max(maxVy, p.vy);
      expect(p.vy).toBeLessThanOrEqual(MAX_FALL_SPEED);
    }
    expect(maxVy).toBe(MAX_FALL_SPEED); // 上限に達する(頭打ちになる)
    expect(p.onGround).toBe(true); // 最後は地面に着地している
  });
});
