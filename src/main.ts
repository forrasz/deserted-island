import { computeCameraX, computeCameraY } from './core/camera';
import { FIXED_DT, PLAYER_HEIGHT, PLAYER_WIDTH } from './core/config';
import { createFlow, stepFlow } from './core/flow';
import { FixedStepper } from './core/loop';
import { loadAssets } from './platform/assets';
import { Keyboard } from './platform/keyboard';
import { Renderer } from './platform/renderer';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas が見つかりません');

async function start(canvas: HTMLCanvasElement): Promise<void> {
  // 素材の読み込み(成功・失敗・時間切れのすべてが出るまで待つ)。失敗した素材は図形で描かれる
  const assets = await loadAssets();

  const keyboard = new Keyboard();
  keyboard.attach(window);
  const renderer = new Renderer(canvas, assets);
  window.addEventListener('resize', () => renderer.resize());

  const stepper = new FixedStepper();
  let flow = createFlow();
  let last = performance.now();

  function frame(now: number): void {
    const steps = stepper.advance(now - last);
    last = now;

    for (let i = 0; i < steps; i++) {
      flow = stepFlow(flow, keyboard.snapshot(), FIXED_DT);
    }

    const { player } = flow.game;
    renderer.draw(
      flow,
      computeCameraX(player.x + PLAYER_WIDTH / 2),
      computeCameraY(player.y + PLAYER_HEIGHT / 2),
    );
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

void start(canvas);
