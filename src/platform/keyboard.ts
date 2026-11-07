import type { InputState } from '../core/input';

const LEFT_CODES = ['ArrowLeft', 'KeyA'];
const RIGHT_CODES = ['ArrowRight', 'KeyD'];
const JUMP_CODES = ['Space'];
const CONFIRM_CODES = ['Enter', 'NumpadEnter'];
const HANDLED = new Set([
  ...LEFT_CODES,
  ...RIGHT_CODES,
  ...JUMP_CODES,
  ...CONFIRM_CODES,
  'ArrowUp',
  'ArrowDown', // 隠しコマンド用(ゲームの操作には使わない)。ページのスクロールを防ぐ
]);
/** 隠しコマンドに使うキー。押した瞬間を順に記録する。 */
const CHEAT_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA']);

/** `event.code` ベースのキー入力。押下状態を保持し、更新ごとに InputState へ変換する。 */
export class Keyboard {
  private readonly down = new Set<string>();
  /** 隠しコマンド用に、押した順に溜めたキー(押しっぱなしの繰り返しは含まない)。 */
  private presses: string[] = [];

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      if (CHEAT_CODES.has(e.code) && !e.repeat) this.presses.push(e.code);
      if (!HANDLED.has(e.code)) return;
      e.preventDefault(); // Space / 矢印キーによるページスクロールを防ぐ
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      if (!HANDLED.has(e.code)) return;
      e.preventDefault();
      this.down.delete(e.code);
    });
    // フォーカスを失ったら全キーを解除し、押しっぱなしを防ぐ
    target.addEventListener('blur', () => {
      this.down.clear();
      this.presses = [];
    });
    target.document.addEventListener('visibilitychange', () => {
      if (target.document.hidden) {
        this.down.clear();
        this.presses = [];
      }
    });
  }

  /** 溜めたキーの押下を、押した順に取り出して空にする。 */
  drainPresses(): string[] {
    const out = this.presses;
    this.presses = [];
    return out;
  }

  snapshot(): InputState {
    const any = (codes: string[]) => codes.some((c) => this.down.has(c));
    return {
      left: any(LEFT_CODES),
      right: any(RIGHT_CODES),
      jump: any(JUMP_CODES),
      confirm: any(CONFIRM_CODES),
    };
  }
}
