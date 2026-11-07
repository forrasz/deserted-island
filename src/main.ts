import { cameraOf } from './core/camera';
import { FIXED_DT } from './core/config';
import { createFlow, stepFlow } from './core/flow';
import { FixedStepper } from './core/loop';
import { isPortrait, mergeInput } from './core/touch';
import { loadAssets } from './platform/assets';
import { Keyboard } from './platform/keyboard';
import { Renderer } from './platform/renderer';
import { TouchControls } from './platform/touch';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas が見つかりません');

async function start(canvas: HTMLCanvasElement): Promise<void> {
  // 素材の読み込み(成功・失敗・時間切れのすべてが出るまで待つ)。失敗した素材は図形で描かれる
  const assets = await loadAssets();

  const keyboard = new Keyboard();
  keyboard.attach(window);
  const touch = new TouchControls();
  const controls = document.getElementById('touch-controls');
  if (controls) touch.attach(controls, window);
  const notice = document.getElementById('rotate-notice');
  const renderer = new Renderer(canvas, assets);
  window.addEventListener('resize', () => renderer.resize());

  const stepper = new FixedStepper();
  let flow = createFlow();
  let last = performance.now();
  let pendingCodes: string[] = [];

  function frame(now: number): void {
    // 縦向きの間は案内を出してゲームを止める(止めた時間は、横向きに戻ったあとに消化しない)
    const portrait = isPortrait(window.innerWidth, window.innerHeight);
    notice?.classList.toggle('show', portrait);
    if (portrait) {
      keyboard.drainPresses(); // 止まっている間のキーは、あとで入力されたことにしない
      pendingCodes = [];
      touch.reset();
      last = now;
      requestAnimationFrame(frame);
      return;
    }

    const steps = stepper.advance(now - last);
    last = now;

    touch.setConfirmEnabled(flow.phase !== 'playing');
    // 隠しコマンド用のキーの押下は、最初の更新にだけ渡す(複数回の更新で二重に数えない)。
    // 更新が 0 回のフレームでは、次のフレームへ持ち越す
    pendingCodes.push(...keyboard.drainPresses());
    for (let i = 0; i < steps; i++) {
      flow = stepFlow(flow, mergeInput(keyboard.snapshot(), touch.snapshot()), FIXED_DT, pendingCodes);
      pendingCodes = [];
      touch.setConfirmEnabled(flow.phase !== 'playing');
    }

    const camera = cameraOf(flow.game);
    renderer.draw(flow, camera.x, camera.y);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

void start(canvas);
