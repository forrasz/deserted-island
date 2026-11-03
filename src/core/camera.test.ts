import { describe, expect, it } from 'vitest';
import { computeCameraX, worldToScreen } from './camera';

const VIEW = 960;
const WORLD = 3840;

describe('computeCameraX', () => {
  it('ワールド中ほどではプレイヤーが画面中央に来る', () => {
    const cam = computeCameraX(2000, VIEW, WORLD);
    expect(worldToScreen(2000, cam)).toBe(VIEW / 2);
  });

  it('プレイヤーが右へ動くとカメラも同じだけ右へ動く', () => {
    const a = computeCameraX(2000, VIEW, WORLD);
    const b = computeCameraX(2100, VIEW, WORLD);
    expect(b - a).toBe(100);
  });

  it('左端付近ではカメラは 0 に留まり、プレイヤーは中央より左に表示される', () => {
    const cam = computeCameraX(100, VIEW, WORLD);
    expect(cam).toBe(0);
    expect(worldToScreen(100, cam)).toBeLessThan(VIEW / 2);
  });

  it('右端付近ではカメラの右端がワールド右端を超えず、プレイヤーは中央より右に表示される', () => {
    const cam = computeCameraX(WORLD - 50, VIEW, WORLD);
    expect(cam + VIEW).toBe(WORLD);
    expect(worldToScreen(WORLD - 50, cam)).toBeGreaterThan(VIEW / 2);
  });

  it('プレイヤーは常に画面内に表示される', () => {
    for (let x = 0; x <= WORLD; x += 50) {
      const sx = worldToScreen(x, computeCameraX(x, VIEW, WORLD));
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(VIEW);
    }
  });

  it('ワールドが画面幅以下ならカメラ x は 0 に固定される', () => {
    expect(computeCameraX(300, 960, 800)).toBe(0);
    expect(computeCameraX(300, 960, 960)).toBe(0);
  });
});

describe('worldToScreen', () => {
  it('カメラ x=100 のとき world x=150 は screen x=50', () => {
    expect(worldToScreen(150, 100)).toBe(50);
  });
});
