import { describe, expect, it } from 'vitest';
import {
  AIR_ACCEL_RATIO,
  COYOTE_TIME,
  FIXED_DT,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_DECEL,
  GROUND_Y,
  JUMP_BUFFER,
  JUMP_CUT_SPEED,
  JUMP_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  STOMP_BOUNCE_SPEED,
  HIT_BOUNCE_SPEED,
  TURN_ACCEL,
} from './config';
import { NO_INPUT, type InputState } from './input';
import { createPlayer, stepPlayer, type Player, type WorldBounds } from './player';

const RIGHT: InputState = { ...NO_INPUT, right: true };
const LEFT: InputState = { ...NO_INPUT, left: true };
const JUMP: InputState = { ...NO_INPUT, jump: true };
const RIGHT_JUMP: InputState = { ...NO_INPUT, right: true, jump: true };
const WORLD: WorldBounds = { width: 5000, groundY: GROUND_Y };
const FLOOR = GROUND_Y - PLAYER_HEIGHT;

const step = (p: Player, i: InputState, w: WorldBounds = WORLD): Player => stepPlayer(p, i, FIXED_DT, w);
function run(p: Player, i: InputState | ((k: number) => InputState), n: number, w: WorldBounds = WORLD): Player {
  let cur = p;
  for (let k = 0; k < n; k++) cur = step(cur, typeof i === 'function' ? i(k) : i, w);
  return cur;
}
/** 全速で走っているプレイヤー(地上)。 */
const running = (x = 200): Player => run(createPlayer(x), RIGHT, 30);
/** ジャンプを holdTicks 更新だけ押して、着地までの頂点の高さ(地面からの高さ)を返す。 */
function apex(start: Player, holdTicks: number, dirInput: InputState = NO_INPUT): number {
  let p = start;
  let min = p.y;
  for (let k = 0; k < 200; k++) {
    p = step(p, { ...dirInput, jump: k < holdTicks });
    min = Math.min(min, p.y);
    if (k > 3 && p.onGround) break;
  }
  return FLOOR - min;
}

describe('地上の加速・減速(2.1)', () => {
  it('停止から右キーを押すと、最初の更新は毎秒 30 程度で、約 0.16 秒(10 更新)で最高速に達し、それ以上は上がらない', () => {
    const p1 = step(createPlayer(100), RIGHT);
    expect(p1.vx).toBeCloseTo(GROUND_ACCEL * FIXED_DT, 6);
    expect(p1.vx).toBeLessThan(MOVE_SPEED / 5);
    expect(run(createPlayer(100), RIGHT, 9).vx).toBeLessThan(MOVE_SPEED);
    expect(run(createPlayer(100), RIGHT, 10).vx).toBe(MOVE_SPEED);
    expect(run(createPlayer(100), RIGHT, 60).vx).toBe(MOVE_SPEED);
  });

  it('左キーでも、同じように、左向きの最高速へ加速する', () => {
    expect(run(createPlayer(1000), LEFT, 10).vx).toBe(-MOVE_SPEED);
  });

  it('最高速からキーを離すと、約 0.12 秒(7 更新)で止まり、約 17 px 滑る', () => {
    const r = running();
    const stopped = run(r, NO_INPUT, 8);
    expect(stopped.vx).toBe(0);
    const slid = stopped.x - r.x;
    expect(slid).toBeGreaterThan(12);
    expect(slid).toBeLessThan(22);
    expect(slid).toBeCloseTo((MOVE_SPEED * MOVE_SPEED) / (2 * GROUND_DECEL), -1);
    expect(run(stopped, NO_INPUT, 20).x).toBe(stopped.x);
  });

  it('進む向きと反対のキーでは、毎秒 3600 のブレーキで約 0.08 秒(5 更新)で止まり、そこから加速して、約 0.23 秒で反対向きの最高速になる(離して止まってから押すより素早い)', () => {
    const r = running();
    expect(run(r, LEFT, 4).vx).toBeGreaterThan(0); // まだ右向き
    expect(run(r, LEFT, 5).vx).toBeLessThanOrEqual(0); // ブレーキで止まった
    expect(run(r, LEFT, 13).vx).toBeGreaterThan(-MOVE_SPEED);
    expect(run(r, LEFT, 15).vx).toBe(-MOVE_SPEED);
    // 同じ時間で、離して止まる(7 更新)→ 反対へ加速する(8 更新)より、ブレーキのほうが、速く反対向きに進む
    const brake = run(r, LEFT, 15);
    const release = run(run(r, NO_INPUT, 7), LEFT, 8);
    expect(brake.vx).toBeLessThan(release.vx);
    expect(TURN_ACCEL).toBeGreaterThan(GROUND_DECEL);
  });

  it('左右同時押しは、キーなしと同じで、減速して止まる', () => {
    const r = running();
    const both = run(r, { ...NO_INPUT, left: true, right: true }, 8);
    expect(both.vx).toBe(0);
  });
});

describe('空中の水平の動き(2.1)', () => {
  const jumpAtSpeed = (): Player => step(running(), RIGHT_JUMP); // 全速で跳んだ直後
  const hold = (i: InputState): InputState => ({ ...i, jump: true }); // 上昇の間、ジャンプを押し続ける(低いジャンプで着地してしまわないように)

  it('空中でキーを離しても、速さは変わらず、右へ進み続ける', () => {
    const j = jumpAtSpeed();
    expect(j.onGround).toBe(false);
    const a = run(j, hold(NO_INPUT), 20);
    expect(a.vx).toBe(MOVE_SPEED);
    expect(a.x - j.x).toBeCloseTo(MOVE_SPEED * 20 * FIXED_DT, 5);
  });

  it('空中で右を押し続けても、速さは最高速のまま(それ以上上がらない)', () => {
    expect(run(jumpAtSpeed(), hold(RIGHT), 20).vx).toBe(MOVE_SPEED);
  });

  it('空中で反対のキーを押し続けても、急には向きを変えられない: 0.1 秒後もまだ右向き、完全に左向きになるのは約 0.52 秒後', () => {
    const j = jumpAtSpeed();
    const airAccel = GROUND_ACCEL * AIR_ACCEL_RATIO;
    expect(run(j, hold(LEFT), 6).vx).toBeGreaterThan(0);
    expect(run(j, hold(LEFT), 6).vx).toBeCloseTo(MOVE_SPEED - airAccel * 6 * FIXED_DT, 6);
    expect(run(j, hold(LEFT), 30).vx).toBeGreaterThan(-MOVE_SPEED);
    expect(run(j, hold(LEFT), 32).vx).toBe(-MOVE_SPEED);
    // 地上(約 0.16 秒)より、はっきり遅い
    expect((2 * MOVE_SPEED) / airAccel).toBeGreaterThan(0.45);
  });

  it('空中の加速は、地上の 6 割', () => {
    expect(AIR_ACCEL_RATIO).toBe(0.6);
    const j = step(createPlayer(100), JUMP); // 止まったまま跳ぶ
    const a = step(j, RIGHT);
    expect(a.vx).toBeCloseTo(GROUND_ACCEL * AIR_ACCEL_RATIO * FIXED_DT, 6);
  });

  it('止まったまま跳んで右を押し続けると、右へ加速しながら進むが、全速で跳んだときより短い距離しか進まない', () => {
    const still = (() => {
      let p = step(createPlayer(100), RIGHT_JUMP); // 1 更新目から右を押す(まだ加速していない)
      for (let k = 0; k < 200 && !p.onGround; k++) p = step(p, { ...RIGHT, jump: k < 30 });
      return p.x - 100;
    })();
    const full = (() => {
      const start = running(100);
      let p = step(start, RIGHT_JUMP);
      for (let k = 0; k < 200 && !p.onGround; k++) p = step(p, { ...RIGHT, jump: k < 30 });
      return p.x - start.x;
    })();
    expect(still).toBeGreaterThan(50);
    expect(still).toBeLessThan(full - 20);
    expect(full).toBeGreaterThan(190);
    expect(full).toBeLessThan(260);
  });

  it('足場の端から歩いて出ると、その速さのまま進みながら落ち、空中でキーを離しても変わらない', () => {
    const w: WorldBounds = { width: 5000, groundY: GROUND_Y, height: GROUND_Y + 600, solids: [{ x: 0, y: GROUND_Y, w: 700, h: 600 }] };
    let p = run(createPlayer(300, w), RIGHT, 80, w); // 最高速で、足場の端へ
    while (p.onGround) p = step(p, RIGHT, w);
    const a = step(p, NO_INPUT, w);
    expect(a.vx).toBe(MOVE_SPEED);
    expect(step(a, NO_INPUT, w).vx).toBe(MOVE_SPEED);
  });
});

describe('可変ジャンプ(2.2)', () => {
  it('押し続けると、頂点の高さは約 182 px(従来の 140 px の 1.3 倍)', () => {
    const h = apex(createPlayer(100), 60);
    expect(h).toBeGreaterThan(170);
    expect(h).toBeLessThan(188);
    expect(Math.abs(h - (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY))).toBeLessThan(8); // 離散化で、少し低い
  });

  it('すぐ離すと、低いジャンプ(約 40 px 付近)になる(押し続けたときの約 3 分の 1 以下)', () => {
    const low = apex(createPlayer(100), 1);
    const full = apex(createPlayer(100), 60);
    expect(low).toBeGreaterThan(25);
    expect(low).toBeLessThan(60);
    expect(low).toBeLessThan(full / 2);
  });

  it('押している時間が長いほど、頂点が高くなる(単調に増える)', () => {
    const heights = [1, 3, 6, 9, 12, 20, 60].map((t) => apex(createPlayer(100), t));
    for (let i = 1; i < heights.length; i++) expect(heights[i]!).toBeGreaterThanOrEqual(heights[i - 1]!);
    expect(heights[heights.length - 1]!).toBeGreaterThan(heights[0]! + 80);
  });

  it('離した更新から、上向きの速さが毎秒 400 に打ち切られる', () => {
    let p = step(createPlayer(100), JUMP); // 初速 -750 に重力の 1 更新ぶん
    expect(p.vy).toBeLessThan(-700);
    p = step(p, NO_INPUT);
    expect(p.vy).toBeGreaterThan(-JUMP_CUT_SPEED - 1);
    expect(p.vy).toBeLessThan(-JUMP_CUT_SPEED + GRAVITY * FIXED_DT + 1);
  });

  it('下降中にキーを離しても、落下の速さは変わらない', () => {
    const down: Player = { x: 100, y: 1000, vx: 0, vy: 300, onGround: false };
    const held = step(down, JUMP);
    const released = step(down, NO_INPUT);
    expect(released.vy).toBe(held.vy);
  });

  it('踏みつけの跳ね返り(-600)は、ジャンプを押していると高く、離していると低く(-400 で打ち切り)なる', () => {
    const bounce: Player = { x: 100, y: FLOOR - 200, vx: 0, vy: -STOMP_BOUNCE_SPEED, onGround: false };
    const height = (holding: boolean): number => {
      let p = bounce;
      let min = p.y;
      for (let k = 0; k < 200 && !(k > 2 && p.onGround); k++) {
        p = step(p, { ...NO_INPUT, jump: holding });
        min = Math.min(min, p.y);
      }
      return bounce.y - min;
    };
    const high = height(true);
    const low = height(false);
    expect(high).toBeGreaterThan(low + 30);
    expect(Math.abs(high - (STOMP_BOUNCE_SPEED * STOMP_BOUNCE_SPEED) / (2 * GRAVITY))).toBeLessThan(8);
  });

  it('被弾の跳ね上がり(-350)は、キーを離していても、打ち切りの影響を受けない', () => {
    const hit: Player = { x: 100, y: FLOOR - 200, vx: 0, vy: -HIT_BOUNCE_SPEED, onGround: false };
    const a = step(hit, NO_INPUT);
    const b = step(hit, JUMP);
    expect(a.vy).toBe(b.vy);
  });
});

describe('入力の猶予(2.3)', () => {
  /** 足場(x < 700)の端から、最高速で歩いて出て、離れた直後(最初の空中の更新)のプレイヤーと、その世界。 */
  function offLedge(): { p: Player; w: WorldBounds } {
    const w: WorldBounds = {
      width: 5000,
      groundY: GROUND_Y,
      height: GROUND_Y + 800,
      solids: [{ x: 0, y: GROUND_Y, w: 700, h: 800 }],
    };
    let p = run(createPlayer(300, w), RIGHT, 80, w);
    while (p.onGround) p = step(p, RIGHT, w);
    return { p, w };
  }

  it('足場を離れて 0.05 秒(3 更新)後は、ジャンプできる(コヨーテタイム)', () => {
    const { p, w } = offLedge();
    const later = run(p, RIGHT, 3, w);
    expect(later.onGround).toBe(false);
    const j = step(later, RIGHT_JUMP, w);
    expect(j.vy).toBeLessThan(-JUMP_SPEED + 100);
  });

  it('足場を離れて 0.15 秒(9 更新)後は、ジャンプできない', () => {
    const { p, w } = offLedge();
    const later = run(p, RIGHT, 9, w);
    const j = step(later, RIGHT_JUMP, w);
    expect(j.vy).toBeGreaterThan(0);
    expect(COYOTE_TIME).toBe(0.1);
  });

  it('ジャンプしたあとには、コヨーテタイムはなく、二重ジャンプはできない', () => {
    const j = step(running(), RIGHT_JUMP);
    const later = run(j, RIGHT, 3);
    const again = step(later, RIGHT_JUMP);
    expect(again.vy).toBeGreaterThan(later.vy); // 新しい上向きの速度は与えられない
    expect(later.coyote).toBe(0);
  });

  /** 地面から高さ y で、静止して落ちるプレイヤーが、着地するまでの更新数。 */
  function ticksToLand(): number {
    let p: Player = { x: 100, y: FLOOR - 60, vx: 0, vy: 0, onGround: false };
    let k = 0;
    while (!p.onGround && k < 200) {
      p = step(p, NO_INPUT);
      k++;
    }
    return k;
  }

  it('着地の 0.05 秒(3 更新)前にジャンプを押して、着地の前に離すと、ジャンプしない(小ジャンプも起きない)', () => {
    const n = ticksToLand();
    let p: Player = { x: 100, y: FLOOR - 60, vx: 0, vy: 0, onGround: false };
    for (let k = 0; k < n - 1; k++) p = step(p, k === n - 4 ? JUMP : NO_INPUT); // 着地の 3 更新前に 1 更新だけ押す
    expect(p.onGround).toBe(false);
    let q = step(p, NO_INPUT); // 着地の更新
    expect(q.onGround).toBe(true);
    for (let k = 0; k < 5; k++) {
      q = step(q, NO_INPUT);
      expect(q.onGround).toBe(true);
      expect(q.y).toBe(FLOOR);
    }
  });

  it('階段の 1 段へ跳び、着地の直前に押してすぐ離しても、着地でジャンプせず、段の上に立つ', () => {
    const STEP_TOP = GROUND_Y - 60;
    const w: WorldBounds = {
      width: 5000,
      groundY: GROUND_Y,
      height: GROUND_Y + 800,
      solids: [
        { x: 0, y: GROUND_Y, w: 5000, h: 800 },
        { x: 300, y: STEP_TOP, w: 200, h: 60 },
      ],
    };
    // 段の真上、少し高い所から落ちる
    let p: Player = { x: 350, y: STEP_TOP - PLAYER_HEIGHT - 40, vx: 0, vy: 0, onGround: false };
    let landedAt = -1;
    let pressedCount = 0;
    for (let k = 0; k < 120 && landedAt < 0; k++) {
      // 着地までの数更新のあいだに、1 更新だけ押す(すぐ離す)
      const probe = step(p, NO_INPUT, w);
      const pressing = !probe.onGround && probe.vy > 0 && STEP_TOP - PLAYER_HEIGHT - p.y < 30 && STEP_TOP - PLAYER_HEIGHT - p.y > 25;
      if (pressing) pressedCount++;
      p = step(p, pressing ? JUMP : NO_INPUT, w);
      if (p.onGround) landedAt = k;
    }
    expect(landedAt).toBeGreaterThan(0);
    expect(pressedCount).toBeGreaterThan(0);
    for (let k = 0; k < 5; k++) {
      p = step(p, NO_INPUT, w);
      expect(p.onGround).toBe(true);
      expect(p.vy).toBe(0);
      expect(p.y).toBe(STEP_TOP - PLAYER_HEIGHT);
    }
  });

  it('着地の瞬間まで押し続けていれば、高いジャンプをする', () => {
    const n = ticksToLand();
    let p: Player = { x: 100, y: FLOOR - 60, vx: 0, vy: 0, onGround: false };
    for (let k = 0; k < n + 2; k++) p = step(p, k >= n - 4 ? JUMP : NO_INPUT);
    let q = p;
    let min = q.y;
    for (let k = 0; k < 100 && !q.onGround; k++) {
      q = step(q, JUMP);
      min = Math.min(min, q.y);
    }
    expect(FLOOR - min).toBeGreaterThan(110);
  });

  it('着地の 0.3 秒前に押して離したジャンプは、先行入力の範囲外で、ジャンプしない', () => {
    const w: WorldBounds = WORLD;
    let p: Player = { x: 100, y: FLOOR - 400, vx: 0, vy: 0, onGround: false };
    let k = 0;
    let jumped = false;
    p = step(p, JUMP, w); // 空中で押す(0.3 秒以上前)
    while (!p.onGround && k < 300) {
      p = step(p, NO_INPUT, w);
      k++;
    }
    expect(p.onGround).toBe(true);
    const after = step(p, NO_INPUT, w);
    jumped = after.vy < 0;
    expect(jumped).toBe(false);
    expect(JUMP_BUFFER).toBe(0.1);
  });

  it('長押しの連続ジャンプ: 押し続けていると、着地した更新で再びジャンプする', () => {
    let p = step(createPlayer(100), JUMP);
    let relanded = false;
    let rejumped = false;
    for (let k = 0; k < 200 && !rejumped; k++) {
      const next = step(p, JUMP);
      if (!p.onGround && next.onGround) relanded = true;
      if (relanded && !next.onGround && next.vy < 0) rejumped = true;
      p = next;
    }
    expect(relanded).toBe(true);
    expect(rejumped).toBe(true);
  });
});
