import { describe, expect, it } from 'vitest';
import { advanceCode, advanceCodes, KONAMI_CODE } from './cheat';

const UP = 'ArrowUp';
const DOWN = 'ArrowDown';
const LEFT = 'ArrowLeft';
const RIGHT = 'ArrowRight';

describe('隠しコマンドの判定(invincible-mode)', () => {
  it('コマンドは 上上下下左右左右BA の 10 キー', () => {
    expect(KONAMI_CODE).toEqual([UP, UP, DOWN, DOWN, LEFT, RIGHT, LEFT, RIGHT, 'KeyB', 'KeyA']);
  });

  it('正しい順番で、最後のキーで完成する(途中では完成しない)', () => {
    let p = 0;
    KONAMI_CODE.forEach((code, i) => {
      const r = advanceCode(p, code);
      expect(r.unlocked).toBe(i === KONAMI_CODE.length - 1);
      p = r.progress;
    });
    expect(p).toBe(0); // 完成後は最初に戻る
  });

  it('途中で違うキーを押すと最初に戻り、そのあとの続きでは完成しない', () => {
    const r = advanceCodes(0, [UP, UP, DOWN, DOWN, LEFT, 'KeyB', RIGHT, LEFT, RIGHT, 'KeyB', 'KeyA']);
    expect(r.unlocked).toBe(false);
  });

  it('間違えたあとに、最初から入力し直すと完成する', () => {
    const r = advanceCodes(0, [UP, UP, DOWN, RIGHT, ...KONAMI_CODE]);
    expect(r.unlocked).toBe(true);
  });

  it('間違えたキーが最初の ↑ なら、1 つ目として数える(↑ ↑ ↑ ↑ ↓ ↓ ← → ← → B A で完成)', () => {
    const r = advanceCodes(0, [UP, UP, UP, UP, DOWN, DOWN, LEFT, RIGHT, LEFT, RIGHT, 'KeyB', 'KeyA']);
    expect(r.unlocked).toBe(true);
  });

  it('↑ ↑ ↑ ↓ ↓ ... は、3 つ目の ↑ が 1 つ目になるので、完成しない', () => {
    const r = advanceCodes(0, [UP, UP, UP, DOWN, DOWN, LEFT, RIGHT, LEFT, RIGHT, 'KeyB', 'KeyA']);
    expect(r.unlocked).toBe(false);
  });

  it('↑ ↑ ↑ のあと、1 つ目として数えた ↑ の進み具合は 1 になる', () => {
    expect(advanceCode(2, UP).progress).toBe(1);
  });

  it('関係のないキーで最初に戻る', () => {
    expect(advanceCode(5, 'KeyD')).toEqual({ progress: 0, unlocked: false });
  });

  it('1 回の入力列に完成が含まれれば、そのあとの余分なキーがあっても unlocked', () => {
    const r = advanceCodes(0, [...KONAMI_CODE, UP]);
    expect(r.unlocked).toBe(true);
    expect(r.progress).toBe(1);
  });

  it('前のフレームの続きから、複数のキーに分けて入力しても完成する', () => {
    const a = advanceCodes(0, KONAMI_CODE.slice(0, 4));
    expect(a.unlocked).toBe(false);
    const b = advanceCodes(a.progress, KONAMI_CODE.slice(4));
    expect(b.unlocked).toBe(true);
  });
});
