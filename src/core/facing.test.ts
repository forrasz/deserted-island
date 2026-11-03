import { describe, expect, it } from 'vitest';
import { nextFacing, type Facing } from './facing';

describe('nextFacing', () => {
  it('右へ移動しているなら右向き', () => {
    expect(nextFacing(-1, 280)).toBe(1);
  });

  it('左へ移動しているなら左向き', () => {
    expect(nextFacing(1, -280)).toBe(-1);
  });

  it('左へ移動したあと停止しても、向きは左のまま', () => {
    let f: Facing = 1;
    f = nextFacing(f, -280);
    f = nextFacing(f, 0);
    f = nextFacing(f, 0);
    expect(f).toBe(-1);
  });

  it('右へ移動したあと停止しても、向きは右のまま', () => {
    let f: Facing = -1;
    f = nextFacing(f, 280);
    f = nextFacing(f, 0);
    expect(f).toBe(1);
  });

  it('ボスの往復(右進行 → 左進行)で向きが切り替わる', () => {
    let f: Facing = 1;
    f = nextFacing(f, 80);
    expect(f).toBe(1);
    f = nextFacing(f, -80);
    expect(f).toBe(-1);
    f = nextFacing(f, 80);
    expect(f).toBe(1);
  });
});
