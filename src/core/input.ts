/** 1 回の更新で参照する入力状態。 */
export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** 決定キー(Enter)。画面遷移に使う。 */
  confirm: boolean;
}

export const NO_INPUT: InputState = { left: false, right: false, jump: false, confirm: false };
