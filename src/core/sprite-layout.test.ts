import { describe, expect, it } from 'vitest';
import { fitToBox, parallaxOffset, tileStartX } from './sprite-layout';

describe('fitToBox', () => {
  it('縦長の画像: 高さを合わせ、幅は縦横比から求め、水平中央・下辺揃え', () => {
    const r = fitToBox({ width: 100, height: 200 }, { x: 300, y: 404, w: 40, h: 56 });
    expect(r.h).toBe(56);
    expect(r.w).toBe(28);
    expect(r.x + r.w / 2).toBe(300 + 40 / 2);
    expect(r.y + r.h).toBe(404 + 56);
  });

  it('横長の画像: 幅は box を超えて左右にはみ出す', () => {
    const box = { x: 1000, y: 360, w: 80, h: 100 };
    const r = fitToBox({ width: 400, height: 200 }, box);
    expect(r.h).toBe(100);
    expect(r.w).toBe(200);
    expect(r.x).toBeLessThan(box.x);
    expect(r.x + r.w).toBeGreaterThan(box.x + box.w);
    expect(r.x + r.w / 2).toBe(box.x + box.w / 2);
    expect(r.y + r.h).toBe(box.y + box.h);
  });

  it('地面の上に立つプレイヤーの画像の下辺は、地面の上辺に揃う', () => {
    const groundY = 460;
    const box = { x: 100, y: groundY - 56, w: 40, h: 56 };
    const r = fitToBox({ width: 200, height: 280 }, box);
    expect(r.y + r.h).toBe(groundY);
  });

  it('縦横比が同じなら、box と同じ矩形になる', () => {
    const box = { x: 10, y: 20, w: 40, h: 56 };
    expect(fitToBox({ width: 200, height: 280 }, box)).toEqual(box);
  });

  it('画像サイズが不正(0)のときは box をそのまま返す', () => {
    const box = { x: 1, y: 2, w: 3, h: 4 };
    expect(fitToBox({ width: 0, height: 0 }, box)).toEqual(box);
  });
});

describe('parallaxOffset', () => {
  it('視差 0.2 でカメラ x=100 のとき、基準位置は -20', () => {
    expect(parallaxOffset(100, 0.2, 960)).toBe(-20);
  });

  it('カメラが 0 のとき、基準位置は 0', () => {
    expect(parallaxOffset(0, 0.2, 960)).toBe(0);
  });

  it('基準位置が画像の幅を超えると折り返し、(-幅, 0] に収まる', () => {
    for (let cam = 0; cam <= 4000; cam += 37) {
      const o = parallaxOffset(cam, 0.2, 960);
      expect(o).toBeGreaterThan(-960);
      expect(o).toBeLessThanOrEqual(0);
    }
    // ちょうど 1 周分(960 / 0.2 = 4800)進むと 0 に戻る
    expect(parallaxOffset(4800, 0.2, 960)).toBe(0);
  });

  it('基準位置から幅ずつ並べると、画面全体(0〜960)を覆える', () => {
    for (let cam = 0; cam <= 3000; cam += 113) {
      const start = parallaxOffset(cam, 0.2, 960);
      expect(start).toBeLessThanOrEqual(0);
      expect(start + 2 * 960).toBeGreaterThanOrEqual(960);
    }
  });
});

describe('tileStartX', () => {
  it('幅 200、カメラ x=50 のとき、ワールド 0 のタイルの左端は画面 x=-50', () => {
    expect(tileStartX(50, 200)).toBe(-50);
  });

  it('継ぎ目はワールドに固定される(カメラが 1 タイル分動くと同じ位置に戻る)', () => {
    expect(tileStartX(50 + 200, 200)).toBe(tileStartX(50, 200));
  });

  it('カメラが右へ動くと、継ぎ目は左へ同じ量だけ動く', () => {
    expect(tileStartX(60, 200) - tileStartX(50, 200)).toBe(-10);
  });
});
