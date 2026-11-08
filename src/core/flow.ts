import { advanceCodes } from './cheat';
import { ENDING_DURATION, FIXED_DT } from './config';
import { createGame, stepGame, type GameState } from './game';
import type { InputState } from './input';

export type Phase = 'title' | 'playing' | 'ending' | 'cleared' | 'gameover';

export interface Flow {
  phase: Phase;
  /** タイトル/クリア/ゲームオーバー画面の背後に描く世界にも使う。プレイ中以外は進行しない。 */
  game: GameState;
  /** 直前の更新で決定キーが押されていたか(押した瞬間の判定に使う)。 */
  confirmHeld: boolean;
  /** 隠しコマンドの進み具合(次に期待するキーの位置)。画面が変わると 0 に戻る。 */
  cheat: number;
  /** エンディングの経過時間(秒)。phase が ending の間だけ進む。 */
  ending: number;
}

export function createFlow(): Flow {
  return { phase: 'title', game: createGame(), confirmHeld: false, cheat: 0, ending: 0 };
}

/**
 * 画面遷移を含む 1 回の更新。
 * 決定キーは押した瞬間(エッジ)にのみ遷移し、遷移した更新ではゲームを進めない。
 * codes は、この更新までに押されたキー(event.code)を押した順に並べたもの。
 * タイトルとプレイ中だけ、隠しコマンドとして受け付ける(完成すると無敵モードになる)。
 */
export function stepFlow(
  flow: Flow,
  input: InputState,
  dt: number = FIXED_DT,
  codes: readonly string[] = [],
): Flow {
  const pressed = input.confirm && !flow.confirmHeld;
  const confirmHeld = input.confirm;

  // 隠しコマンド: タイトルとプレイ中だけ受け付ける。ほかの画面では、進み具合を捨てる
  let cheat = 0;
  let game = flow.game;
  if (flow.phase === 'title' || flow.phase === 'playing') {
    const r = advanceCodes(flow.cheat, codes);
    cheat = r.progress;
    if (r.unlocked && !game.invincible) game = { ...game, invincible: true };
  }

  switch (flow.phase) {
    case 'title':
      // タイトルで入力した無敵モードは、始まるプレイへ引き継ぐ
      if (pressed) {
        return {
          phase: 'playing',
          game: { ...createGame(), invincible: game.invincible },
          confirmHeld,
          cheat: 0,
          ending: 0,
        };
      }
      break;
    case 'cleared':
    case 'gameover':
      // やり直しでは、無敵モードはオフに戻る
      if (pressed) return { phase: 'playing', game: createGame(), confirmHeld, cheat: 0, ending: 0 };
      break;
    case 'playing': {
      const next = stepGame(game, input, dt);
      // 同じ更新で脱出とHP 0 が重なった場合は、クリアを優先する
      // 脱出に成功したら、エンディングを見せてから、クリア画面へ進む
      const phase: Phase = next.escaped ? 'ending' : next.dead ? 'gameover' : 'playing';
      return { phase, game: next, confirmHeld, cheat: phase === 'playing' ? cheat : 0, ending: 0 };
    }
    case 'ending': {
      // エンディングの間は、どの入力も受け付けず(スキップできない)、世界も進めない
      const ending = flow.ending + dt;
      if (ending >= ENDING_DURATION - 1e-9) {
        return { phase: 'cleared', game, confirmHeld, cheat: 0, ending: ENDING_DURATION };
      }
      return { ...flow, confirmHeld, cheat: 0, ending };
    }
  }

  // 画面は変わらない(タイトル・クリア・ゲームオーバー)
  if (flow.confirmHeld === confirmHeld && flow.cheat === cheat && flow.game === game) return flow;
  return { ...flow, game, confirmHeld, cheat };
}
