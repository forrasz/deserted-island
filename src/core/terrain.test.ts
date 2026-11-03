import { describe, expect, it } from 'vitest';
import type { Rect } from './collision';
import {
  fallYOf,
  isFullySupported,
  platformsOf,
  resolveHorizontal,
  resolveVertical,
  solidsOf,
  worldHeightOf,
  type WorldBounds,
} from './terrain';

const W = 40;
const H = 56;

describe('WorldBounds の取得(地形の省略)', () => {
  const flat: WorldBounds = { width: 1000, groundY: 460 };

  it('地形を省略した世界は、groundY の平らな地面 1 枚として扱われる', () => {
    expect(solidsOf(flat)).toEqual([{ x: 0, y: 460, w: 1000, h: 80 }]);
    expect(platformsOf(flat)).toEqual([]);
  });

  it('高さを省略すると、地面の上面の 80 下になり、落下ラインはその下になる', () => {
    expect(worldHeightOf(flat)).toBe(540);
    expect(fallYOf(flat)).toBeGreaterThan(540);
  });

  it('地形を与えると、それが使われる', () => {
    const solids: Rect[] = [{ x: 0, y: 460, w: 300, h: 80 }, { x: 450, y: 460, w: 300, h: 80 }];
    const platforms: Rect[] = [{ x: 100, y: 350, w: 120, h: 20 }];
    const world: WorldBounds = { width: 1000, groundY: 460, height: 1000, solids, platforms };
    expect(solidsOf(world)).toBe(solids);
    expect(platformsOf(world)).toBe(platforms);
    expect(worldHeightOf(world)).toBe(1000);
    expect(fallYOf(world)).toBeGreaterThan(1000);
  });
});

describe('resolveHorizontal: 崖の側面', () => {
  const cliff: Rect[] = [{ x: 500, y: 400, w: 100, h: 60 }];

  it('右へ動いて崖に当たると、崖の左面で止まる', () => {
    expect(resolveHorizontal(440, 404, W, H, 30, cliff)).toBe(500 - W);
  });

  it('左へ動いて崖に当たると、崖の右面で止まる', () => {
    expect(resolveHorizontal(610, 404, W, H, -30, cliff)).toBe(600);
  });

  it('辺が接するだけなら押し出さない', () => {
    expect(resolveHorizontal(450, 404, W, H, 10, cliff)).toBe(460); // 右辺 = 500 でちょうど接する
  });

  it('崖の上面に立って歩いても押し出されない(誤差があっても)', () => {
    const y = 400 - H + 1e-9; // 浮動小数の誤差で、下辺が上面よりわずかに下
    expect(resolveHorizontal(520, y, W, H, 20, cliff)).toBe(540);
  });

  it('崖より高い位置を動いている間は押し出されない', () => {
    expect(resolveHorizontal(440, 300, W, H, 100, cliff)).toBe(540);
  });

  it('移動量が 0 なら、そのまま', () => {
    expect(resolveHorizontal(520, 404, W, H, 0, cliff)).toBe(520);
  });
});

describe('resolveVertical: 着地と頭ぶつけ', () => {
  const cliff: Rect[] = [{ x: 500, y: 400, w: 100, h: 60 }];
  const island: Rect[] = [{ x: 100, y: 350, w: 120, h: 20 }];

  it('崖の上面に落ちて着地する', () => {
    const r = resolveVertical(300, 350, 300, 520, W, H, cliff, []);
    expect(r).toEqual({ y: 400 - H, vy: 0, landed: true });
  });

  it('崖の上面の手前(まだ届かない)では着地しない', () => {
    const r = resolveVertical(300, 320, 300, 520, W, H, cliff, []);
    expect(r.landed).toBe(false);
    expect(r.y).toBe(320);
  });

  it('浮島に上から落ちて着地する', () => {
    const r = resolveVertical(290, 300, 200, 130, W, H, [], island);
    expect(r).toEqual({ y: 350 - H, vy: 0, landed: true });
  });

  it('浮島は下から上昇しても通り抜ける(頭をぶつけない)', () => {
    const r = resolveVertical(380, 340, -500, 130, W, H, [], island);
    expect(r).toEqual({ y: 340, vy: -500, landed: false });
  });

  it('浮島の上面より低い位置から落下している間は着地しない', () => {
    // 更新前の下辺(= 400)が浮島の上面(350)より下
    const r = resolveVertical(344, 360, 200, 130, W, H, [], island);
    expect(r.landed).toBe(false);
  });

  it('崖の下面に頭をぶつけると、上昇が止まる', () => {
    const ceiling: Rect[] = [{ x: 500, y: 300, w: 100, h: 50 }]; // 下面は 350
    const r = resolveVertical(360, 340, -400, 520, W, H, ceiling, []);
    expect(r).toEqual({ y: 350, vy: 0, landed: false });
  });

  it('水平に重ならない足場には着地しない', () => {
    const r = resolveVertical(300, 360, 300, 700, W, H, cliff, island);
    expect(r.landed).toBe(false);
  });

  it('複数の足場が重なるときは、最も高い上面に着地する', () => {
    const solids: Rect[] = [{ x: 500, y: 420, w: 100, h: 60 }];
    const platforms: Rect[] = [{ x: 500, y: 400, w: 100, h: 20 }];
    const r = resolveVertical(300, 380, 300, 520, W, H, solids, platforms);
    expect(r.y).toBe(400 - H);
  });

  it('薄い足場に、1 更新で 25px 落ちても着地する(すり抜けない)', () => {
    const thin: Rect[] = [{ x: 100, y: 400, w: 120, h: 10 }];
    const r = resolveVertical(344, 369, 1500, 130, W, H, [], thin); // 下辺: 400 → 425
    expect(r.landed).toBe(true);
    expect(r.y).toBe(400 - H);
  });
});

describe('isFullySupported: 足元の幅全体が支えられているか', () => {
  const slab: Rect[] = [{ x: 0, y: 460, w: 300, h: 80 }];
  const island: Rect[] = [{ x: 400, y: 350, w: 100, h: 20 }];

  it('地面の中ほどでは支えられている', () => {
    expect(isFullySupported(100, 460 - H, W, H, slab, [])).toBe(true);
  });

  it('地面の縁(足元の一部が穴の上)では支えられていない', () => {
    expect(isFullySupported(280, 460 - H, W, H, slab, [])).toBe(false);
  });

  it('浮島の上でも支えられる', () => {
    expect(isFullySupported(420, 350 - H, W, H, [], island)).toBe(true);
  });

  it('足場がない位置では支えられていない', () => {
    expect(isFullySupported(700, 460 - H, W, H, slab, island)).toBe(false);
  });
});
