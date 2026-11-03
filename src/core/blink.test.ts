import { describe, expect, it } from 'vitest';
import { blinkVisible } from './blink';
import { BLINK_PERIOD, FIXED_DT, PLAYER_INVULN_TIME } from './config';

describe('blinkVisible', () => {
  it('無敵でなければ常に表示される', () => {
    expect(blinkVisible(0)).toBe(true);
    expect(blinkVisible(-1)).toBe(true);
  });

  it('被弾した更新(残り時間が満タン)は表示で、その直後の最初の 0.1 秒は非表示になる', () => {
    expect(blinkVisible(PLAYER_INVULN_TIME)).toBe(true);
    expect(blinkVisible(PLAYER_INVULN_TIME - FIXED_DT)).toBe(false);
  });

  it('無敵中は 0.1 秒ごとに表示と非表示が交互に切り替わる', () => {
    // 残り時間を period の中央で確認する(1.95 → 1.85 → 1.75 …)
    const samples: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      samples.push(blinkVisible(PLAYER_INVULN_TIME - i * BLINK_PERIOD - BLINK_PERIOD / 2));
    }
    expect(samples).toEqual([false, true, false, true, false, true]);
  });

  it('更新ごとに残り時間を減らすと、表示・非表示が実際に繰り返される', () => {
    let invuln = PLAYER_INVULN_TIME;
    let changes = 0;
    let prev = blinkVisible(invuln);
    while (invuln > 0) {
      invuln = Math.max(0, invuln - FIXED_DT);
      const cur = blinkVisible(invuln);
      if (cur !== prev) changes++;
      prev = cur;
    }
    // 2 秒 / 0.1 秒 = 約 20 回の切り替え
    expect(changes).toBeGreaterThanOrEqual(18);
    expect(changes).toBeLessThanOrEqual(21);
  });

  it('無敵時間が終わると、以後は常に表示される', () => {
    expect(blinkVisible(0)).toBe(true);
    expect(blinkVisible(0.0001)).toBeTypeOf('boolean');
    expect(blinkVisible(0)).toBe(true);
  });
});
