import { describe, expect, it } from 'vitest';
import { computeCameraX, computeCameraY, worldToScreen, worldToScreenY } from './camera';
import { GROUND_Y, PLAYER_HEIGHT, VIEW_HEIGHT, WORLD_HEIGHT } from './config';

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

describe('computeCameraY(縦方向の追従)', () => {
  const VIEW = 540;
  const WORLD = 1620;

  it('ワールドの中ほどでは、プレイヤーが画面の垂直方向の中央に来る', () => {
    const cam = computeCameraY(800, VIEW, WORLD);
    expect(worldToScreenY(800, cam)).toBe(VIEW / 2);
  });

  it('プレイヤーが上へ動くと、カメラも同じだけ上へ動く(画面が上へスクロールする)', () => {
    const a = computeCameraY(800, VIEW, WORLD);
    const b = computeCameraY(700, VIEW, WORLD);
    expect(b - a).toBe(-100);
  });

  it('下端付近では、カメラの下端がワールドの下端を超えず、プレイヤーは中央より下に表示される', () => {
    const cam = computeCameraY(WORLD - 100, VIEW, WORLD);
    expect(cam + VIEW).toBe(WORLD);
    expect(worldToScreenY(WORLD - 100, cam)).toBeGreaterThan(VIEW / 2);
  });

  it('上端付近では、カメラの上端はワールドの上端(y=0)より上にならない', () => {
    const cam = computeCameraY(100, VIEW, WORLD);
    expect(cam).toBe(0);
    expect(worldToScreenY(100, cam)).toBeLessThan(VIEW / 2);
  });

  it('プレイヤーは、ステージの上端から下端まで常に画面内に表示される', () => {
    for (let y = 0; y <= WORLD; y += 20) {
      const sy = worldToScreenY(y, computeCameraY(y, VIEW, WORLD));
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(VIEW);
    }
  });

  it('ワールドの高さが画面の高さ以下なら、カメラ y は 0 に固定される', () => {
    expect(computeCameraY(300, 540, 540)).toBe(0);
    expect(computeCameraY(300, 540, 400)).toBe(0);
  });
});

describe('worldToScreenY', () => {
  it('カメラ y=800 のとき、world y=1000 は screen y=200', () => {
    expect(worldToScreenY(1000, 800)).toBe(200);
  });
});

describe('地面に立っているときの見え方(従来の画面と同じ)', () => {
  const standingCenterY = GROUND_Y - PLAYER_HEIGHT / 2;

  it('カメラは下端に張り付き、地面の上面は画面の下から 80 の位置に描かれる', () => {
    const cam = computeCameraY(standingCenterY);
    expect(cam).toBe(WORLD_HEIGHT - VIEW_HEIGHT);
    expect(VIEW_HEIGHT - worldToScreenY(GROUND_Y, cam)).toBe(80);
  });

  it('平地でジャンプしても(高さ約 140)、カメラは上下に動かず、画面が揺れない', () => {
    const base = computeCameraY(standingCenterY);
    for (let jumpH = 0; jumpH <= 145; jumpH += 5) {
      expect(computeCameraY(standingCenterY - jumpH)).toBe(base);
    }
  });
});
