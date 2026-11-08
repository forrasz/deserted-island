import { describe, expect, it } from 'vitest';
import {
  dyingBossVisible,
  dyingFlash,
  dyingProgress,
  dyingShake,
  ENDING_MESSAGES,
  endingScene,
  explosions,
  FLASH_MAX,
  INTRO_MAX_DARK,
  introCameraBlend,
  introTimeline,
  WARNING_PERIOD,
} from './cinematic';
import { ENDING_DURATION, INTRO_TIME, NUSHI_DYING_TIME } from './config';

describe('登場演出の時間割(final-boss-cinematics)', () => {
  it('演出の外(開始前・終了後)では、何も出ない', () => {
    for (const t of [-1, INTRO_TIME, INTRO_TIME + 5]) {
      expect(introTimeline(t)).toEqual({ dark: 0, warning: false, nameAlpha: 0, shakeX: 0, shakeY: 0 });
      expect(introCameraBlend(t)).toBe(0);
    }
  });

  it('暗さは 0.5 秒で最大(0.6)になり、最後の 0.5 秒で 0 に戻る', () => {
    expect(introTimeline(0.01).dark).toBeLessThan(0.05);
    expect(introTimeline(0.5).dark).toBeCloseTo(INTRO_MAX_DARK, 6);
    expect(introTimeline(1.5).dark).toBeCloseTo(INTRO_MAX_DARK, 6);
    expect(introTimeline(INTRO_TIME - 0.25).dark).toBeCloseTo(INTRO_MAX_DARK / 2, 6);
    expect(introTimeline(INTRO_TIME - 0.001).dark).toBeLessThan(0.01);
  });

  it('WARNING は、0.3 秒から点滅し、点滅は 1 秒に 3 回を超えない(最後の 0.5 秒は出ない)', () => {
    expect(introTimeline(0.1).warning).toBe(false);
    expect(introTimeline(0.3).warning).toBe(true);
    expect(introTimeline(0.3 + WARNING_PERIOD + 0.01).warning).toBe(false);
    expect(introTimeline(INTRO_TIME - 0.2).warning).toBe(false);
    // 点灯の立ち上がり(消灯 → 点灯)の回数を、0.01 秒刻みで数える
    let rises = 0;
    let prev = false;
    for (let t = 0; t < 1; t += 0.01) {
      const w = introTimeline(t + 0.5).warning;
      if (w && !prev) rises++;
      prev = w;
    }
    expect(rises).toBeLessThanOrEqual(3);
  });

  it('名前は、1.0 秒から現れて、1.5 秒で完全になり、終わりに消える', () => {
    expect(introTimeline(0.9).nameAlpha).toBe(0);
    expect(introTimeline(1.25).nameAlpha).toBeCloseTo(0.5, 6);
    expect(introTimeline(2).nameAlpha).toBe(1);
    expect(introTimeline(INTRO_TIME - 0.25).nameAlpha).toBeCloseTo(0.5, 6);
  });

  it('揺れは、最初が大きく(最大 6 px)、終わりに向けて 0 になる', () => {
    let early = 0;
    for (let t = 0; t < 1; t += 0.01) early = Math.max(early, Math.abs(introTimeline(t).shakeX));
    expect(early).toBeGreaterThan(3);
    expect(early).toBeLessThanOrEqual(6);
    expect(Math.abs(introTimeline(INTRO_TIME - 0.001).shakeX)).toBeLessThan(0.1);
  });

  it('同じ時刻には、同じ値(乱数なし)', () => {
    expect(introTimeline(1.234)).toEqual(introTimeline(1.234));
  });

  it('カメラは、0.8 秒でヌシへ寄り、2.5 秒まで保ち、3 秒で戻る', () => {
    expect(introCameraBlend(0.001)).toBeLessThan(0.01);
    expect(introCameraBlend(0.4)).toBeGreaterThan(0.3);
    expect(introCameraBlend(0.4)).toBeLessThan(0.7);
    expect(introCameraBlend(0.8)).toBe(1);
    expect(introCameraBlend(1.5)).toBe(1);
    expect(introCameraBlend(2.5)).toBe(1);
    expect(introCameraBlend(2.75)).toBeGreaterThan(0.3);
    expect(introCameraBlend(2.75)).toBeLessThan(0.7);
    expect(introCameraBlend(INTRO_TIME - 0.001)).toBeLessThan(0.01);
  });
});

describe('撃破演出の時間割(final-boss-cinematics)', () => {
  it('進行度は、残り時間が NUSHI_DYING_TIME のとき 0、0 のとき 1', () => {
    expect(dyingProgress(NUSHI_DYING_TIME)).toBe(0);
    expect(dyingProgress(0)).toBe(1);
    expect(dyingProgress(NUSHI_DYING_TIME / 2)).toBeCloseTo(0.5, 6);
  });

  it('爆発は、進むにつれて増え、位置と大きさが異なる', () => {
    expect(explosions(0).length).toBe(1);
    const mid = explosions(0.3);
    expect(mid.length).toBeGreaterThanOrEqual(3);
    expect(new Set(mid.map((e) => `${e.x.toFixed(3)},${e.y.toFixed(3)}`)).size).toBe(mid.length);
    expect(new Set(mid.map((e) => e.r.toFixed(1))).size).toBeGreaterThan(1);
    for (const e of mid) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(1);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeLessThanOrEqual(1);
      expect(e.alpha).toBeGreaterThanOrEqual(0);
      expect(e.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('同じ進行度には、同じ爆発(乱数なし)', () => {
    expect(explosions(0.4)).toEqual(explosions(0.4));
  });

  it('白いフラッシュは、1 つの山(0.7 から上がり、頂点 0.85、終わりに 0)で、0.85 を超えない', () => {
    expect(dyingFlash(0)).toBe(0);
    expect(dyingFlash(0.7)).toBe(0);
    expect(dyingFlash(0.92)).toBeCloseTo(FLASH_MAX, 6);
    expect(dyingFlash(1)).toBe(0);
    let max = 0;
    let peaks = 0;
    let prev = 0;
    let rising = true;
    for (let p = 0; p <= 1; p += 0.002) {
      const f = dyingFlash(p);
      max = Math.max(max, f);
      if (f < prev && rising) {
        peaks++;
        rising = false;
      }
      if (f > prev) rising = true;
      prev = f;
    }
    expect(max).toBeLessThanOrEqual(FLASH_MAX + 1e-9);
    expect(peaks).toBe(1);
  });

  it('ヌシは、フラッシュの頂点(0.92)で消える', () => {
    expect(dyingBossVisible(0.5)).toBe(true);
    expect(dyingBossVisible(0.919)).toBe(true);
    expect(dyingBossVisible(0.92)).toBe(false);
    expect(dyingBossVisible(1)).toBe(false);
  });

  it('揺れは、演出の間だけ(外では 0)', () => {
    expect(dyingShake(0)).toEqual({ x: 0, y: 0 });
    expect(dyingShake(1)).toEqual({ x: 0, y: 0 });
    let max = 0;
    for (let p = 0.01; p < 0.9; p += 0.01) max = Math.max(max, Math.abs(dyingShake(p).x));
    expect(max).toBeGreaterThan(1);
  });
});

describe('エンディングの時間割(ending-sequence)', () => {
  it('夕日は、時間とともに水平線へ近づく(沈みかけで終わる)', () => {
    const a = endingScene(0);
    const b = endingScene(ENDING_DURATION);
    expect(b.sunY).toBeGreaterThan(a.sunY);
    expect(b.sunY).toBeLessThanOrEqual(b.horizonY + 1e-9);
    expect(a.sunY).toBeLessThan(a.horizonY);
  });

  it('イカダは、始まりから 10 秒後に、水平線に近く、小さくなっている', () => {
    const a = endingScene(0);
    const b = endingScene(10);
    expect(b.raftScale).toBeLessThan(a.raftScale);
    expect(b.raftScale).toBeLessThan(0.4);
    expect(b.raftY).toBeLessThan(a.raftY);
    expect(Math.abs(b.raftY - b.horizonY)).toBeLessThan(Math.abs(a.raftY - a.horizonY));
  });

  it('島は、遠ざかって小さく、薄くなる', () => {
    const a = endingScene(0);
    const b = endingScene(ENDING_DURATION);
    expect(b.islandScale).toBeLessThan(a.islandScale);
    expect(b.islandAlpha).toBeLessThan(a.islandAlpha);
  });

  it('メッセージは 3 つあり、順に現れて消える(同時には出ない)', () => {
    expect(ENDING_MESSAGES.length).toBeGreaterThanOrEqual(2);
    const shown = (t: number) => endingScene(t).messages.map((m) => m.alpha > 0.01);
    expect(shown(0.5)).toEqual([false, false, false]);
    expect(shown(3)).toEqual([true, false, false]);
    expect(shown(7.5)).toEqual([false, true, false]);
    expect(shown(11)).toEqual([false, false, true]);
    for (let t = 0; t <= ENDING_DURATION; t += 0.1) {
      expect(endingScene(t).messages.filter((m) => m.alpha > 0.01).length).toBeLessThanOrEqual(1);
    }
  });

  it('最後の 0.5 秒で暗くなる', () => {
    expect(endingScene(10).fadeOut).toBe(0);
    expect(endingScene(ENDING_DURATION).fadeOut).toBe(1);
    expect(endingScene(ENDING_DURATION - 0.25).fadeOut).toBeCloseTo(0.5, 6);
  });

  it('鳥は 3 羽で、画面の上のほうを動き、同じ時刻には同じ位置', () => {
    const s = endingScene(4);
    expect(s.birds).toHaveLength(3);
    expect(endingScene(4)).toEqual(s);
    for (const b of s.birds) expect(b.y).toBeLessThan(s.horizonY);
  });

  it('範囲の外の時刻は、端の値に丸められる', () => {
    expect(endingScene(-5)).toEqual(endingScene(0));
    expect(endingScene(99)).toEqual(endingScene(ENDING_DURATION));
  });
});
