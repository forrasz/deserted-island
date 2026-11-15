import { describe, expect, it } from 'vitest';
import { FIXED_DT, GROUND_Y, MOVE_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH } from './config';
import { NO_INPUT, type InputState } from './input';
import { createPlayer, stepPlayer, type Player, type WorldBounds } from './player';

const RIGHT: InputState = { ...NO_INPUT, right: true };
const LEFT: InputState = { ...NO_INPUT, left: true };
const JUMP: InputState = { ...NO_INPUT, jump: true };
const RIGHT_JUMP: InputState = { ...NO_INPUT, right: true, jump: true };
const WORLD: WorldBounds = { width: 2000, groundY: GROUND_Y };

const step = (p: Player, i: InputState, w: WorldBounds = WORLD): Player => stepPlayer(p, i, FIXED_DT, w);
/** ジャンプして、空中の各更新で inputs[k] を与え続ける(最初の更新だけ jumpInput)。着地までの軌跡を返す。 */
function flight(start: Player, jumpInput: InputState, air: (k: number) => InputState, w: WorldBounds = WORLD): Player[] {
  const out: Player[] = [];
  let p = step(start, jumpInput, w);
  out.push(p);
  for (let k = 0; k < 200 && !p.onGround; k++) {
    p = step(p, air(k), w);
    out.push(p);
  }
  return out;
}

describe('ジャンプの軌道は踏み切りで確定する(player-movement)', () => {
  it('右へ押しながら跳ぶと、空中でキーを押し続けても離しても、軌跡は同じ', () => {
    const base = createPlayer(100);
    const hold = flight(base, RIGHT_JUMP, () => RIGHT);
    const release = flight(base, RIGHT_JUMP, () => NO_INPUT);
    expect(release.map((p) => [p.x, p.y])).toEqual(hold.map((p) => [p.x, p.y]));
  });

  it('空中で反対のキーを押しても、向きは変わらず、止まりもしない', () => {
    const base = createPlayer(100);
    const same = flight(base, RIGHT_JUMP, () => RIGHT);
    const opposite = flight(base, RIGHT_JUMP, () => LEFT);
    expect(opposite.map((p) => p.x)).toEqual(same.map((p) => p.x));
    expect(opposite[opposite.length - 1]!.x).toBeGreaterThan(100 + 150);
  });

  it('空中の水平の速さは、踏み切りと同じ(毎秒 280)で、着地まで変わらない', () => {
    const traj = flight(createPlayer(100), RIGHT_JUMP, (k) => (k % 2 ? LEFT : NO_INPUT));
    for (let i = 1; i < traj.length - 1; i++) expect(traj[i]!.x - traj[i - 1]!.x).toBeCloseTo(MOVE_SPEED * FIXED_DT, 6);
  });

  it('止まった状態で跳ぶと、空中で右キーを押し続けても、真上に跳んで真下に着地する', () => {
    const traj = flight(createPlayer(100), JUMP, () => RIGHT);
    expect(traj.every((p) => p.x === 100)).toBe(true);
    expect(traj[traj.length - 1]!.onGround).toBe(true);
  });

  it('左へ押しながら跳ぶと、左へ同じ速さで進む', () => {
    const traj = flight(createPlayer(1000), { ...NO_INPUT, left: true, jump: true }, () => RIGHT);
    for (let i = 1; i < traj.length - 1; i++) expect(traj[i]!.x - traj[i - 1]!.x).toBeCloseTo(-MOVE_SPEED * FIXED_DT, 6);
  });

  it('跳んだ距離は、従来と同じ(約 210 px)', () => {
    const traj = flight(createPlayer(100), RIGHT_JUMP, () => RIGHT);
    const dx = traj[traj.length - 1]!.x - 100;
    expect(dx).toBeGreaterThan(190);
    expect(dx).toBeLessThan(230);
  });

  it('足場の端から歩いて出ると、その速さのまま右へ進みながら落ち、空中でキーを離しても変わらない', () => {
    const w: WorldBounds = {
      width: 2000,
      groundY: GROUND_Y,
      height: GROUND_Y + 600,
      solids: [{ x: 0, y: GROUND_Y, w: 500, h: 600 }],
    };
    let p: Player = { x: 460, y: GROUND_Y - PLAYER_HEIGHT, vx: 0, vy: 0, onGround: true };
    let leftEdge: Player | undefined;
    for (let i = 0; i < 60; i++) {
      p = step(p, RIGHT, w);
      if (!p.onGround && !leftEdge) leftEdge = p;
    }
    expect(leftEdge).toBeDefined();
    const a = step(p, NO_INPUT, w);
    const b = step(a, LEFT, w);
    expect(a.x - p.x).toBeCloseTo(MOVE_SPEED * FIXED_DT, 6);
    expect(b.x - a.x).toBeCloseTo(MOVE_SPEED * FIXED_DT, 6);
  });

  it('静止して足場から落ちる(速さ 0)と、空中でキーを押しても真下に落ちる', () => {
    const w: WorldBounds = { width: 2000, groundY: GROUND_Y, height: GROUND_Y + 600, solids: [{ x: 0, y: GROUND_Y, w: 500, h: 600 }] };
    let p: Player = { x: 600, y: GROUND_Y - 200, vx: 0, vy: 0, onGround: false };
    for (let i = 0; i < 10; i++) p = step(p, RIGHT, w);
    expect(p.x).toBe(600);
  });
});

describe('地上の移動は従来どおり', () => {
  it('地上では、キーですぐに動き、離すとすぐに止まる', () => {
    let p = createPlayer(100);
    p = step(p, RIGHT);
    expect(p.x).toBeCloseTo(100 + MOVE_SPEED * FIXED_DT, 6);
    const stopped = step(p, NO_INPUT);
    expect(stopped.x).toBe(p.x);
  });

  it('着地した次の更新からは、キーで動ける', () => {
    let p = flight(createPlayer(100), RIGHT_JUMP, () => NO_INPUT).pop()!;
    expect(p.onGround).toBe(true);
    const x = p.x;
    p = step(p, LEFT);
    expect(p.x).toBeLessThan(x);
  });

  it('長押しの連続ジャンプでは、着地した次の更新で、新しい向きが踏み切りの速さになる', () => {
    let p = flight(createPlayer(100), RIGHT_JUMP, () => RIGHT).pop()!;
    p = step(p, { ...NO_INPUT, left: true, jump: true });
    expect(p.onGround).toBe(false);
    const next = step(p, RIGHT);
    expect(next.x).toBeLessThan(p.x); // 左向きに確定している
  });
});

describe('空中でワールドの端にぶつかる', () => {
  it('右端の壁にぶつかったら、水平の速さが 0 になり、端に沿って落ちる', () => {
    const w: WorldBounds = { width: 300, groundY: GROUND_Y };
    let p = createPlayer(250, w);
    p = step(p, RIGHT_JUMP, w);
    let sawZero = false;
    for (let i = 0; i < 100; i++) {
      p = step(p, RIGHT, w);
      expect(p.x + PLAYER_WIDTH).toBeLessThanOrEqual(300 + 1e-6);
      if (!p.onGround && p.vx === 0) sawZero = true;
    }
    expect(sawZero).toBe(true);
    expect(p.onGround).toBe(true);
  });
});
