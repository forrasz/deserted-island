import { describe, expect, it } from 'vitest';
import { FIXED_DT, MAX_FRAME_MS } from './config';
import { FixedStepper } from './loop';

/** 指定したフレーム間隔で、実時間 totalMs 分だけ advance した合計更新回数。 */
function simulate(frameMs: number, totalMs: number): number {
  const stepper = new FixedStepper();
  let steps = 0;
  const frames = Math.round(totalMs / frameMs);
  for (let i = 0; i < frames; i++) steps += stepper.advance(frameMs);
  return steps;
}

describe('FixedStepper: 固定タイムステップ', () => {
  it('実時間 1 秒でおよそ 60 回更新する (60Hz)', () => {
    expect(Math.abs(simulate(1000 / 60, 1000) - 60)).toBeLessThanOrEqual(1);
  });

  it('1/60 秒ちょうどのフレームで 1 回ずつ更新する', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(FIXED_DT * 1000)).toBe(1);
    expect(stepper.advance(FIXED_DT * 1000)).toBe(1);
  });

  it('刻みに満たない経過時間は持ち越される', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(10)).toBe(0);
    expect(stepper.advance(10)).toBe(1);
  });

  it('負や 0 の経過時間では更新しない', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(0)).toBe(0);
    expect(stepper.advance(-5)).toBe(0);
  });
});

describe('FixedStepper: 長い停止からの復帰', () => {
  it('10 秒停止後でも 1 フレームの更新回数は上限内に収まる', () => {
    const stepper = new FixedStepper();
    const maxSteps = Math.ceil((MAX_FRAME_MS / 1000) / FIXED_DT);
    const steps = stepper.advance(10_000);
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThanOrEqual(maxSteps);
  });

  it('復帰の次のフレームで通常どおりの更新に戻る', () => {
    const stepper = new FixedStepper();
    stepper.advance(10_000);
    expect(stepper.advance(1000 / 60)).toBeLessThanOrEqual(2);
  });
});

describe('FixedStepper: ディスプレイのリフレッシュレート非依存', () => {
  it('60Hz と 144Hz で実時間 1 秒あたりの更新回数が一致する', () => {
    const at60 = simulate(1000 / 60, 1000);
    const at144 = simulate(1000 / 144, 1000);
    expect(Math.abs(at60 - at144)).toBeLessThanOrEqual(1);
    expect(Math.abs(at144 - 60)).toBeLessThanOrEqual(1);
  });

  it('30Hz のような低いレートでも更新回数は 60 回前後になる', () => {
    expect(Math.abs(simulate(1000 / 30, 1000) - 60)).toBeLessThanOrEqual(1);
  });
});
