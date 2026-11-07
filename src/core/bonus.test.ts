import { describe, expect, it } from 'vitest';
import {
  BONUS_WORLD,
  createBonus,
  exitPlayer,
  inHiddenHole,
  itemRect,
  spawnAt,
  stepBonus,
  type BonusItem,
  type BonusState,
} from './bonus';
import {
  BONUS_DURATION,
  BONUS_GROUND_Y,
  BONUS_ITEM_SIZE,
  BONUS_KINDS,
  BONUS_START_X,
  BONUS_VENTS,
  BONUS_WIDTH,
  FIXED_DT,
  GROUND_Y,
  HIDDEN_HOLE_WIDTH,
  HIDDEN_HOLE_X,
  JUMP_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  STONE_STUN_TIME,
  WORLD_WIDTH,
} from './config';
import { NO_INPUT, type InputState } from './input';
import { createPlayer } from './player';

const RIGHT: InputState = { ...NO_INPUT, right: true };
const JUMP: InputState = { ...NO_INPUT, jump: true };

function fresh(): BonusState {
  return createBonus({ x: 100, y: GROUND_Y - PLAYER_HEIGHT });
}

/** 入力を与えながら n 回更新する(終了・HP・無敵も追う)。 */
function run(b: BonusState, n: number, input: InputState = NO_INPUT, hp = PLAYER_MAX_HP, inv = 0) {
  let s = { bonus: b, hp, hitInvuln: inv, done: false };
  for (let i = 0; i < n; i++) s = stepBonus(s.bonus, s.hp, s.hitInvuln, input, FIXED_DT);
  return s;
}

/** プレイヤーの位置に、指定の種類のアイテムを重ねた状態(石・ハートの接触テスト用)。 */
function withItemOnPlayer(kind: 'heart' | 'stone', extra: Partial<BonusState> = {}): BonusState {
  const b = fresh();
  const item: BonusItem = {
    kind,
    x: b.player.x + 5,
    y: b.player.y + 5,
    vx: 0,
    vy: 0,
    alive: true,
  };
  return { ...b, items: [item], t: 0.1, spawned: 1, ...extra };
}

describe('ボーナスの入場(隠し穴)', () => {
  const onGround = (cx: number) => ({ ...createPlayer(cx - PLAYER_WIDTH / 2), onGround: true });

  it('隠し穴は横幅の真ん中にある', () => {
    expect(HIDDEN_HOLE_X + HIDDEN_HOLE_WIDTH / 2).toBe(WORLD_WIDTH / 2);
  });
  it('範囲の中で地面に立つと入場できる', () => {
    expect(inHiddenHole(onGround(WORLD_WIDTH / 2))).toBe(true);
  });
  it('範囲の外(手前・奥)では入場できない', () => {
    expect(inHiddenHole(onGround(HIDDEN_HOLE_X - 1))).toBe(false);
    expect(inHiddenHole(onGround(HIDDEN_HOLE_X + HIDDEN_HOLE_WIDTH))).toBe(false);
  });
  it('空中では入場できない', () => {
    expect(inHiddenHole({ ...onGround(WORLD_WIDTH / 2), onGround: false })).toBe(false);
  });
  it('退場の位置は、隠し穴の中央の地面の上', () => {
    const p = exitPlayer({ width: WORLD_WIDTH, groundY: GROUND_Y });
    expect(p.x + PLAYER_WIDTH / 2).toBe(WORLD_WIDTH / 2);
    expect(p.y + PLAYER_HEIGHT).toBe(GROUND_Y);
  });
});

describe('飛び出しのスケジュール(決定的)', () => {
  it('同じ n は、何度呼んでも同じ結果', () => {
    for (let n = 0; n < 20; n++) expect(spawnAt(n)).toEqual(spawnAt(n));
  });
  it('最初は 1 秒後で、その後 0.6 秒おき', () => {
    expect(spawnAt(0).time).toBe(1);
    expect(spawnAt(1).time).toBeCloseTo(1.6, 9);
    expect(spawnAt(10).time).toBeCloseTo(7, 9);
  });
  it('口は 6 か所を順に、種類は表の順番で出る', () => {
    for (let n = 0; n < 16; n++) {
      expect(spawnAt(n).x).toBe(BONUS_VENTS[n % BONUS_VENTS.length]);
      expect(spawnAt(n).kind).toBe(BONUS_KINDS[n % BONUS_KINDS.length]);
    }
  });
  it('30 秒の間に、ハートも石も複数が飛び出す', () => {
    const kinds: string[] = [];
    for (let n = 0; spawnAt(n).time <= BONUS_DURATION; n++) kinds.push(spawnAt(n).kind);
    expect(kinds.filter((k) => k === 'heart').length).toBeGreaterThanOrEqual(5);
    expect(kinds.filter((k) => k === 'stone').length).toBeGreaterThanOrEqual(5);
  });
});

describe('広間とプレイヤー', () => {
  it('入場直後は、左端の床の上で、時間 0・アイテムなし', () => {
    const b = fresh();
    expect(b.player.x).toBe(BONUS_START_X);
    expect(b.player.y + PLAYER_HEIGHT).toBe(BONUS_GROUND_Y);
    expect(b.t).toBe(0);
    expect(b.items).toEqual([]);
    expect(BONUS_WORLD.width).toBe(BONUS_WIDTH);
  });
  it('本編と同じ速さ(毎秒 280)で右へ動く', () => {
    const b = fresh();
    const r = run(b, 60, RIGHT);
    expect(r.bonus.player.x - b.player.x).toBeCloseTo(MOVE_SPEED, 0);
  });
  it('本編と同じ初速でジャンプする', () => {
    const r = run(fresh(), 1, JUMP);
    expect(r.bonus.player.vy).toBeLessThan(0);
    expect(Math.abs(r.bonus.player.vy)).toBeGreaterThan(JUMP_SPEED - 100);
  });
  it('左端でさらに左へ動いても、広間の外へは出ない', () => {
    const r = run(fresh(), 120, { ...NO_INPUT, left: true });
    expect(r.bonus.player.x).toBe(0);
  });
});

describe('ハートと石の飛び出し・落下', () => {
  it('1 秒たつと最初のものが口の位置から上向きに飛び出す', () => {
    const r = run(fresh(), 60);
    expect(r.bonus.items).toHaveLength(1);
    const it = r.bonus.items[0]!;
    expect(it.kind).toBe(spawnAt(0).kind);
    expect(it.vy).toBeLessThan(0);
    expect(it.x + BONUS_ITEM_SIZE / 2).toBeCloseTo(spawnAt(0).x, 5);
  });
  it('放物線を描いて、いったん昇ってから落ちる', () => {
    let s = run(fresh(), 60);
    const ys: number[] = [];
    for (let i = 0; i < 40; i++) {
      s = run(s.bonus, 1);
      ys.push(s.bonus.items.find((x) => x.x < 700)?.y ?? NaN);
    }
    const minY = Math.min(...ys.filter((y) => !Number.isNaN(y)));
    expect(minY).toBeLessThan(BONUS_GROUND_Y - BONUS_ITEM_SIZE - 100);
  });
  it('床に落ちたら消える(約 1 秒で最初のものは消える)', () => {
    let s = run(fresh(), 60);
    expect(s.bonus.items.filter((x) => x.x < 700)).toHaveLength(1);
    s = run(s.bonus, 70);
    expect(s.bonus.items.filter((x) => x.x < 700 && x.vy > 0 && x.y > BONUS_GROUND_Y - 40)).toHaveLength(0);
    expect(s.bonus.items.length).toBeLessThan(4);
  });
  it('同じ入力で 2 回遊ぶと、同じ時刻に同じ状態になる', () => {
    const a = run(fresh(), 200, RIGHT);
    const b = run(fresh(), 200, RIGHT);
    expect(a.bonus.items).toEqual(b.bonus.items);
    expect(a.bonus.player).toEqual(b.bonus.player);
  });
});

describe('ハートを取るとHPが回復する', () => {
  it('HPが 3 なら 4 になり、ハートは消える', () => {
    const r = stepBonus(withItemOnPlayer('heart'), 3, 0, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(4);
    expect(r.bonus.items).toHaveLength(0);
  });
  it('HPが最大でも、ハートは消え、HPは変わらない', () => {
    const r = stepBonus(withItemOnPlayer('heart'), PLAYER_MAX_HP, 0, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(PLAYER_MAX_HP);
    expect(r.bonus.items).toHaveLength(0);
  });
  it('空中でも取れる', () => {
    const b = withItemOnPlayer('heart');
    const air = { ...b, player: { ...b.player, y: b.player.y - 80, vy: -100, onGround: false } };
    const item = { ...air.items[0]!, y: air.player.y + 5 };
    const r = stepBonus({ ...air, items: [item] }, 2, 0, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(3);
  });
  it('無敵中でも取れる', () => {
    const r = stepBonus(withItemOnPlayer('heart'), 3, 1, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(4);
  });
});

describe('石に当たるとダメージと硬直', () => {
  it('HP -1・無敵 2 秒・硬直 1.5 秒・石は消え・小さく跳ね上がる', () => {
    const r = stepBonus(withItemOnPlayer('stone'), 5, 0, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(4);
    expect(r.hitInvuln).toBe(PLAYER_INVULN_TIME);
    expect(r.bonus.stun).toBe(STONE_STUN_TIME);
    expect(r.bonus.items).toHaveLength(0);
    expect(r.bonus.player.vy).toBeLessThan(0);
  });
  it('硬直の間は、右移動とジャンプの入力を受け付けない(重力は働く)', () => {
    let s = stepBonus(withItemOnPlayer('stone'), 5, 0, NO_INPUT, FIXED_DT);
    // 床に戻るまで待つ(硬直 1.5 秒の中で)
    s = run(s.bonus, 30, NO_INPUT, s.hp, s.hitInvuln);
    const x0 = s.bonus.player.x;
    expect(s.bonus.player.onGround).toBe(true);
    const moved = run(s.bonus, 20, { ...RIGHT, jump: true }, s.hp, s.hitInvuln);
    expect(moved.bonus.player.x).toBe(x0);
    expect(moved.bonus.player.onGround).toBe(true);
  });
  it('1.5 秒たつと、右へ動ける', () => {
    let s = stepBonus(withItemOnPlayer('stone', { t: 0.1 }), 5, 0, NO_INPUT, FIXED_DT);
    s = run(s.bonus, 91, NO_INPUT, s.hp, s.hitInvuln);
    expect(s.bonus.stun).toBe(0);
    const x0 = s.bonus.player.x;
    const moved = run(s.bonus, 10, RIGHT, s.hp, s.hitInvuln);
    expect(moved.bonus.player.x).toBeGreaterThan(x0);
  });
  it('無敵中の石は、HPを減らさず、硬直もさせず、消えずに通り過ぎる', () => {
    const r = stepBonus(withItemOnPlayer('stone'), 5, 1, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(5);
    expect(r.bonus.stun).toBe(0);
    expect(r.bonus.items).toHaveLength(1);
  });
  it('同じ更新で 2 つの石に重なっても、被弾は 1 回', () => {
    const b = withItemOnPlayer('stone');
    const second: BonusItem = { ...b.items[0]!, x: b.items[0]!.x + 3 };
    const r = stepBonus({ ...b, items: [...b.items, second] }, 5, 0, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(4);
  });
  it('HPが 1 のときに当たると 0 になる', () => {
    const r = stepBonus(withItemOnPlayer('stone'), 1, 0, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(0);
  });
  it('離れた位置の石には当たらない', () => {
    const b = fresh();
    const far: BonusItem = { kind: 'stone', x: 1500, y: 200, vx: 0, vy: 0, alive: true };
    const r = stepBonus({ ...b, items: [far], t: 0.1, spawned: 1 }, 5, 0, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(5);
  });
});

describe('退場', () => {
  it('30 秒の時間切れで終わる(29 秒では終わらない)', () => {
    const before = run(fresh(), 29 * 60);
    expect(before.done).toBe(false);
    const after = run(before.bonus, 60);
    expect(after.done).toBe(true);
  });
  it('右端の出口に着くと、時間が残っていても終わる', () => {
    const b = fresh();
    const near = { ...b, player: { ...b.player, x: BONUS_WIDTH - PLAYER_WIDTH - 60 } };
    const r = run(near, 60, RIGHT);
    expect(r.done).toBe(true);
    expect(r.bonus.t).toBeLessThan(BONUS_DURATION);
  });
  it('終わるまでは done にならない(開始直後)', () => {
    expect(run(fresh(), 1).done).toBe(false);
  });
  it('HPと無敵時間は、そのまま引き継がれる', () => {
    const r = run(fresh(), 10, NO_INPUT, 4, 1.5);
    expect(r.hp).toBe(4);
    expect(r.hitInvuln).toBeCloseTo(1.5 - 10 * FIXED_DT, 9);
  });
  it('itemRect は、アイテムの大きさの正方形', () => {
    const r = itemRect({ kind: 'heart', x: 10, y: 20, vx: 0, vy: 0, alive: true });
    expect(r).toEqual({ x: 10, y: 20, w: BONUS_ITEM_SIZE, h: BONUS_ITEM_SIZE });
  });
});
