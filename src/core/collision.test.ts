import { describe, expect, it } from 'vitest';
import { overlapAmount, overlaps, type Rect } from './collision';

const base: Rect = { x: 0, y: 0, w: 10, h: 10 };

describe('overlaps', () => {
  it('重なる矩形は true', () => {
    expect(overlaps(base, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it('辺が接するだけなら false', () => {
    expect(overlaps(base, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(overlaps(base, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
  });

  it('離れていれば false', () => {
    expect(overlaps(base, { x: 20, y: 20, w: 5, h: 5 })).toBe(false);
  });

  it('一方が他方を包含していれば true', () => {
    expect(overlaps(base, { x: 2, y: 2, w: 3, h: 3 })).toBe(true);
    expect(overlaps({ x: 2, y: 2, w: 3, h: 3 }, base)).toBe(true);
  });
});

describe('overlapAmount', () => {
  it('各軸の侵入量を返す', () => {
    expect(overlapAmount(base, { x: 7, y: 4, w: 10, h: 10 })).toEqual({ x: 3, y: 6 });
  });

  it('包含しているときは内側矩形の大きさになる', () => {
    expect(overlapAmount(base, { x: 2, y: 2, w: 3, h: 3 })).toEqual({ x: 3, y: 3 });
  });

  it('重なっていなければ null', () => {
    expect(overlapAmount(base, { x: 10, y: 0, w: 5, h: 5 })).toBeNull();
  });
});
