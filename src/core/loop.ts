import { FIXED_DT, MAX_FRAME_MS } from './config';

const EPSILON = 1e-9;

/**
 * 固定タイムステップのアキュムレータ。
 * 時刻の取得は呼び出し側が行い、ここでは経過時間だけを受け取る。
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    private readonly step: number = FIXED_DT,
    private readonly maxFrameMs: number = MAX_FRAME_MS,
  ) {}

  /** 1 フレームの経過時間(ミリ秒)を渡し、実行すべき更新回数を返す。 */
  advance(frameMs: number): number {
    const clamped = Math.min(Math.max(frameMs, 0), this.maxFrameMs);
    this.accumulator += clamped / 1000;

    let steps = 0;
    while (this.accumulator + EPSILON >= this.step) {
      this.accumulator -= this.step;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    return steps;
  }
}
