import { type InputState } from '../core/input';
import { NO_TOUCH, press, release, releaseAll, toInput, type TouchButton, type TouchState } from '../core/touch';

const BUTTONS: readonly TouchButton[] = ['left', 'right', 'jump'];

/**
 * 画面上のボタン(左・右・ジャンプ)と、画面タップによる決定を、InputState へ変換するアダプタ。
 * 押下状態の管理は core/touch.ts の純粋関数に任せ、ここは DOM のイベントとの接続だけを行う。
 */
export class TouchControls {
  private state: TouchState = NO_TOUCH;
  /** 決定として押している指。決定が有効な間に押し始めた指だけを入れる。 */
  private readonly confirmPointers = new Set<number>();
  private confirmEnabled = false;

  attach(root: HTMLElement, target: Window): void {
    for (const name of BUTTONS) {
      const el = root.querySelector<HTMLElement>(`[data-btn="${name}"]`);
      if (!el) throw new Error(`ボタン [data-btn="${name}"] が見つかりません`);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        // タッチは暗黙に要素へキャプチャされ、指が外へ動いても pointerleave が来なくなるので解除する
        if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
        this.state = press(this.state, e.pointerId, name);
      });
      const up = (e: PointerEvent): void => {
        this.state = release(this.state, e.pointerId);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('lostpointercapture', up);
    }

    // 画面のどこかをタップして決定する(有効なのはプレイ中以外の画面だけ)
    target.addEventListener('pointerdown', (e) => {
      if (this.confirmEnabled) this.confirmPointers.add(e.pointerId);
    });
    const confirmUp = (e: PointerEvent): void => void this.confirmPointers.delete(e.pointerId);
    target.addEventListener('pointerup', confirmUp);
    target.addEventListener('pointercancel', confirmUp);

    // 押しっぱなしを防ぐ
    target.addEventListener('blur', () => this.reset());
    target.document.addEventListener('visibilitychange', () => {
      if (target.document.hidden) this.reset();
    });
    // ブラウザの標準動作(長押しメニュー・ピンチ拡大)を抑止する
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      target.document.addEventListener(type, (e) => e.preventDefault());
    }
  }

  /** プレイ中以外の画面でだけ、画面タップを決定にする。無効にしたとき、押している指は決定から外す。 */
  setConfirmEnabled(enabled: boolean): void {
    this.confirmEnabled = enabled;
    if (!enabled) this.confirmPointers.clear();
  }

  /** すべてのボタンと決定を解除する(中断・非表示・縦向きになったとき)。 */
  reset(): void {
    this.state = releaseAll();
    this.confirmPointers.clear();
  }

  snapshot(): InputState {
    return toInput(this.state, this.confirmEnabled && this.confirmPointers.size > 0);
  }
}
