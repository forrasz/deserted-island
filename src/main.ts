import { computeCameraX } from './core/camera';
import { FIXED_DT, PLAYER_WIDTH } from './core/config';
import { createGame, stepGame } from './core/game';
import { FixedStepper } from './core/loop';
import { Keyboard } from './platform/keyboard';
import { Renderer } from './platform/renderer';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas が見つかりません');

const keyboard = new Keyboard();
keyboard.attach(window);
const renderer = new Renderer(canvas);
window.addEventListener('resize', () => renderer.resize());

const stepper = new FixedStepper();
let state = createGame();
let last = performance.now();

function frame(now: number): void {
  const steps = stepper.advance(now - last);
  last = now;

  for (let i = 0; i < steps; i++) {
    state = stepGame(state, keyboard.snapshot(), FIXED_DT);
  }

  renderer.draw(state, computeCameraX(state.player.x + PLAYER_WIDTH / 2));
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
