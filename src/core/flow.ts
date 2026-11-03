import { FIXED_DT } from './config';
import { createGame, stepGame, type GameState } from './game';
import type { InputState } from './input';

export type Phase = 'title' | 'playing' | 'cleared';

export interface Flow {
  phase: Phase;
  /** タイトル/クリア画面の背後に描く世界にも使う。タイトル・クリア中は進行しない。 */
  game: GameState;
  /** 直前の更新で決定キーが押されていたか(押した瞬間の判定に使う)。 */
  confirmHeld: boolean;
}

export function createFlow(): Flow {
  return { phase: 'title', game: createGame(), confirmHeld: false };
}

/**
 * 画面遷移を含む 1 回の更新。
 * 決定キーは押した瞬間(エッジ)にのみ遷移し、遷移した更新ではゲームを進めない。
 */
export function stepFlow(flow: Flow, input: InputState, dt: number = FIXED_DT): Flow {
  const pressed = input.confirm && !flow.confirmHeld;
  const confirmHeld = input.confirm;

  switch (flow.phase) {
    case 'title':
    case 'cleared':
      if (pressed) return { phase: 'playing', game: createGame(), confirmHeld };
      return flow.confirmHeld === confirmHeld ? flow : { ...flow, confirmHeld };

    case 'playing': {
      const game = stepGame(flow.game, input, dt);
      return { phase: game.escaped ? 'cleared' : 'playing', game, confirmHeld };
    }
  }
}
