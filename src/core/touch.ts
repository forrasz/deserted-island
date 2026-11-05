import type { InputState } from './input';

/** 画面上の操作ボタン。 */
export type TouchButton = 'left' | 'right' | 'jump';

/**
 * ボタンごとに「押している指(pointerId)」の集合を持つ。
 * 1 本でも押していればそのボタンは有効。不変(更新のたびに新しい状態を返す)。
 */
export interface TouchState {
  readonly left: ReadonlySet<number>;
  readonly right: ReadonlySet<number>;
  readonly jump: ReadonlySet<number>;
}

export const NO_TOUCH: TouchState = { left: new Set(), right: new Set(), jump: new Set() };

/** 指 pointerId が button を押した。 */
export function press(state: TouchState, pointerId: number, button: TouchButton): TouchState {
  if (state[button].has(pointerId)) return state;
  return { ...state, [button]: new Set([...state[button], pointerId]) };
}

/** 指 pointerId を離した(どのボタンを押していても解除する)。 */
export function release(state: TouchState, pointerId: number): TouchState {
  const next = (s: ReadonlySet<number>): ReadonlySet<number> => {
    if (!s.has(pointerId)) return s;
    const c = new Set(s);
    c.delete(pointerId);
    return c;
  };
  const left = next(state.left);
  const right = next(state.right);
  const jump = next(state.jump);
  if (left === state.left && right === state.right && jump === state.jump) return state;
  return { left, right, jump };
}

/** すべてのボタンを解除する(中断・ページ非表示・向きの変更など)。 */
export function releaseAll(): TouchState {
  return NO_TOUCH;
}

/** タッチの状態を、ゲームの入力へ変換する(confirm は画面タップ側が別に決める)。 */
export function toInput(state: TouchState, confirm = false): InputState {
  return {
    left: state.left.size > 0,
    right: state.right.size > 0,
    jump: state.jump.size > 0,
    confirm,
  };
}

/** 2 つの入力を項目ごとの OR で合成する(キーボードとタッチの併用)。 */
export function mergeInput(a: InputState, b: InputState): InputState {
  return {
    left: a.left || b.left,
    right: a.right || b.right,
    jump: a.jump || b.jump,
    confirm: a.confirm || b.confirm,
  };
}

/** 縦向き(高さが幅より大きい)か。正方形は横向き扱い。 */
export function isPortrait(width: number, height: number): boolean {
  return width < height;
}
