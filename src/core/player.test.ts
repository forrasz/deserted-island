import { describe, expect, it } from 'vitest';
import { FIXED_DT, GROUND_Y, MOVE_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH } from './config';
import { NO_INPUT, type InputState } from './input';
import { createPlayer, stepPlayer, type Player, type WorldBounds } from './player';

const RIGHT: InputState = { ...NO_INPUT, right: true };
const LEFT: InputState = { ...NO_INPUT, left: true };
const JUMP: InputState = { ...NO_INPUT, jump: true };
const FLOOR = GROUND_Y - PLAYER_HEIGHT;
const WORLD: WorldBounds = { width: 1000, groundY: GROUND_Y };

function run(p: Player, input: InputState, n: number, world?: WorldBounds): Player {
  let cur = p;
  for (let i = 0; i < n; i++) cur = stepPlayer(cur, input, FIXED_DT, world);
  return cur;
}

describe('開始時の配置', () => {
  it('プレイヤーは地面の上に静止して立っている', () => {
    const p = createPlayer();
    expect(p.y).toBe(FLOOR);
    expect(p.onGround).toBe(true);
    expect(run(p, NO_INPUT, 30).y).toBe(FLOOR);
  });
});

describe('左右移動', () => {
  it('右キーで x が更新ごとに増加する', () => {
    let p = createPlayer(100);
    for (let i = 0; i < 10; i++) {
      const next = stepPlayer(p, RIGHT);
      expect(next.x).toBeGreaterThan(p.x);
      p = next;
    }
  });

  it('左キーで x が更新ごとに減少する', () => {
    let p = createPlayer(500);
    for (let i = 0; i < 10; i++) {
      const next = stepPlayer(p, LEFT);
      expect(next.x).toBeLessThan(p.x);
      p = next;
    }
  });

  it('1 秒間の移動距離は移動速度に等しい', () => {
    const p = run(createPlayer(100), RIGHT, 60);
    expect(p.x).toBeCloseTo(100 + MOVE_SPEED, 5);
  });

  it('キーを離すと x が変化しなくなる', () => {
    const moving = run(createPlayer(100), RIGHT, 10);
    const stopped = run(moving, NO_INPUT, 10);
    expect(stopped.x).toBe(moving.x);
  });

  it('左右同時押しでは x が変化しない', () => {
    const p = createPlayer(300);
    expect(run(p, { ...NO_INPUT, left: true, right: true }, 10).x).toBe(300);
  });
});

describe('ジャンプと重力', () => {
  it('地面でジャンプすると上昇し、頂点の後に下降する', () => {
    let p = stepPlayer(createPlayer(), JUMP);
    expect(p.onGround).toBe(false);
    expect(p.y).toBeLessThan(FLOOR);

    let minY = p.y;
    let wentUp = false;
    let wentDown = false;
    for (let i = 0; i < 200 && !p.onGround; i++) {
      const next = stepPlayer(p, NO_INPUT);
      if (next.y < p.y) wentUp = true;
      if (next.y > p.y) wentDown = true;
      minY = Math.min(minY, next.y);
      p = next;
    }
    expect(wentUp || p.y < FLOOR).toBe(true);
    expect(wentDown).toBe(true);
    expect(minY).toBeLessThan(FLOOR);
  });

  it('軌道は放物線(上向き速度が単調に減少する)', () => {
    let p = stepPlayer(createPlayer(), JUMP);
    for (let i = 0; i < 10; i++) {
      const next = stepPlayer(p, NO_INPUT);
      expect(next.vy).toBeGreaterThan(p.vy);
      p = next;
    }
  });

  it('空中ではジャンプ入力を与えても上向き速度は与えられない', () => {
    const air = run(stepPlayer(createPlayer(), JUMP), NO_INPUT, 40);
    expect(air.onGround).toBe(false);
    const next = stepPlayer(air, JUMP);
    expect(next.vy).toBeGreaterThan(air.vy);
  });

  it('空中でも水平移動できる', () => {
    const air = stepPlayer(createPlayer(100), JUMP);
    const next = stepPlayer(air, RIGHT);
    expect(next.onGround).toBe(false);
    expect(next.x).toBeGreaterThan(air.x);
  });
});

describe('着地', () => {
  it('ジャンプ後に地面へ戻り、垂直速度が 0 になる', () => {
    const landed = run(stepPlayer(createPlayer(), JUMP), NO_INPUT, 200);
    expect(landed.onGround).toBe(true);
    expect(landed.vy).toBe(0);
    expect(landed.y).toBe(FLOOR);
  });

  it('地面を貫通しない', () => {
    let p = createPlayer();
    for (let i = 0; i < 300; i++) {
      p = stepPlayer(p, i % 90 === 0 ? JUMP : NO_INPUT);
      expect(p.y).toBeLessThanOrEqual(FLOOR);
    }
  });

  it('着地後、再びジャンプできる', () => {
    const landed = run(stepPlayer(createPlayer(), JUMP), NO_INPUT, 200);
    const again = stepPlayer(landed, JUMP);
    expect(again.onGround).toBe(false);
    expect(again.y).toBeLessThan(FLOOR);
  });

  it('スペースを押し続けると着地後に再ジャンプする', () => {
    let p = createPlayer();
    let jumps = 0;
    for (let i = 0; i < 300; i++) {
      const next = stepPlayer(p, JUMP);
      if (p.onGround && !next.onGround) jumps++;
      p = next;
    }
    expect(jumps).toBeGreaterThanOrEqual(2);
  });
});

describe('ワールドの両端', () => {
  it('左端で左へ押し続けても x は 0 未満にならない', () => {
    const p = run(createPlayer(0, WORLD), LEFT, 30, WORLD);
    expect(p.x).toBe(0);
  });

  it('右端で右へ押し続けても右辺はワールド幅を超えない', () => {
    const p = run(createPlayer(WORLD.width - PLAYER_WIDTH, WORLD), RIGHT, 30, WORLD);
    expect(p.x + PLAYER_WIDTH).toBeLessThanOrEqual(WORLD.width);
    expect(p.x).toBe(WORLD.width - PLAYER_WIDTH);
  });

  it('長く歩いても両端を出ない', () => {
    const right = run(createPlayer(0, WORLD), RIGHT, 1000, WORLD);
    expect(right.x + PLAYER_WIDTH).toBeLessThanOrEqual(WORLD.width);
    const left = run(right, LEFT, 1000, WORLD);
    expect(left.x).toBeGreaterThanOrEqual(0);
  });
});
