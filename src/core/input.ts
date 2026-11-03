/** 1 回の更新で参照する入力状態。 */
export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export const NO_INPUT: InputState = { left: false, right: false, jump: false };
