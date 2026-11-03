import { describe, expect, it } from 'vitest';
import { FIXED_DT, GROUND_Y, PART_HEIGHT } from './config';
import { createPart, stepPart, type RaftPart } from './raft-part';

const FLOOR = GROUND_Y - PART_HEIGHT;

function run(p: RaftPart, n: number): RaftPart {
  let cur = p;
  for (let i = 0; i < n; i++) cur = stepPart(cur, FIXED_DT);
  return cur;
}

describe('stepPart', () => {
  it('空中の位置から下へ落ちる', () => {
    const p = createPart(100, 300);
    const next = stepPart(p, FIXED_DT);
    expect(next.y).toBeGreaterThan(p.y);
    expect(next.grounded).toBe(false);
  });

  it('地面に達すると静止し、それ以上沈まない', () => {
    const landed = run(createPart(100, 300), 300);
    expect(landed.grounded).toBe(true);
    expect(landed.y).toBe(FLOOR);
    expect(landed.vy).toBe(0);
  });

  it('静止後は位置が変化しない', () => {
    const landed = run(createPart(100, 300), 300);
    expect(run(landed, 60)).toEqual(landed);
  });
});
