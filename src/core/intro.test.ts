import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, createBoss, type Boss } from './boss';
import { cameraOf } from './camera';
import { computeCameraX } from './camera';
import { introCameraBlend } from './cinematic';
import {
  FIXED_DT,
  GROUND_Y,
  INTRO_TIME,
  INTRO_TRIGGER_DISTANCE,
  PLAYER_HEIGHT,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  VIEW_WIDTH,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { STAGE } from './stage';

const H = PLAYER_HEIGHT;
const PLACE = STAGE.bosses[9]!;
const WEST = STAGE.pillars[0]!;
const TRIGGER_X = WEST.x - INTRO_TRIGGER_DISTANCE; // プレイヤーの右辺がここに達すると始まる
const RIGHT: InputState = { ...NO_INPUT, right: true };

/** ヌシ(眠っている)と柱だけの世界。プレイヤーは、右辺が right になる位置に立つ。 */
function world(playerRight: number, over: Partial<GameState> = {}): GameState {
  const nushi = createBoss(PLACE.left, PLACE.left, PLACE.right, GROUND_Y, BOSS_DEFS[9]!);
  const base = createGame(undefined, { bosses: [PLACE], enemies: [], pillars: STAGE.pillars });
  return {
    ...base,
    bosses: [nushi],
    player: { x: playerRight - PLAYER_WIDTH, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true },
    ...over,
  };
}
function run(g: GameState, n: number, input: InputState = NO_INPUT): GameState {
  let s = g;
  for (let i = 0; i < n; i++) s = stepGame(s, input, FIXED_DT);
  return s;
}
const nushiOf = (g: GameState): Boss => g.bosses[0]!;

describe('ヌシは眠った状態から始まる(2.1)', () => {
  it('ゲーム開始の状態は、ヌシが眠っている(登場演出はまだ)', () => {
    expect(createGame().intro).toEqual({ state: 'sleeping', t: 0 });
  });

  it('遠くにいる間は、長い時間が過ぎても、ヌシは動かず・攻撃せず、柱も壊れない', () => {
    const g0 = world(TRIGGER_X - 800);
    const g = run({ ...g0, player: { ...g0.player } }, 60 * 30);
    expect(nushiOf(g).x).toBe(nushiOf(g0).x);
    expect(nushiOf(g).hp).toBe(12);
    expect(nushiOf(g).step).toBe(0);
    expect(nushiOf(g).stagger).toBe(0);
    expect(g.projectiles).toEqual([]);
    expect(g.pillars.every((p) => p.alive)).toBe(true);
    expect(g.intro.state).toBe('sleeping');
  });
});

describe('登場演出の発動(2.1)', () => {
  it('プレイヤーの右辺が、西の柱の左辺の手前 360 px に達すると始まる', () => {
    const g = stepGame(world(TRIGGER_X), NO_INPUT, FIXED_DT);
    expect(g.intro.state).toBe('playing');
    expect(g.intro.t).toBe(0);
  });

  it('まだ手前(1 px)では、始まらない', () => {
    const g = stepGame(world(TRIGGER_X - 1), NO_INPUT, FIXED_DT);
    expect(g.intro.state).toBe('sleeping');
  });

  it('歩いて近づくと、その位置で始まる', () => {
    let g = world(TRIGGER_X - 200);
    for (let i = 0; i < 300 && g.intro.state === 'sleeping'; i++) g = stepGame(g, RIGHT, FIXED_DT);
    expect(g.intro.state).toBe('playing');
    expect(g.player.x + PLAYER_WIDTH).toBeGreaterThanOrEqual(TRIGGER_X);
    expect(g.player.x + PLAYER_WIDTH).toBeLessThan(TRIGGER_X + 20);
  });

  it('ヌシがすでに倒されているときは、始まらない', () => {
    const g0 = world(TRIGGER_X + 100);
    const dead: GameState = { ...g0, bosses: [{ ...nushiOf(g0), alive: false, hp: 0 }] };
    expect(stepGame(dead, NO_INPUT, FIXED_DT).intro.state).toBe('sleeping');
  });

  it('1 回だけ: 演出が終わったあと、手前へ戻って再び近づいても、始まらない', () => {
    let g = run(world(TRIGGER_X), Math.round(INTRO_TIME * 60) + 5);
    expect(g.intro.state).toBe('done');
    g = { ...g, player: { ...g.player, x: TRIGGER_X - 500 } };
    g = run(g, 5);
    g = { ...g, player: { ...g.player, x: TRIGGER_X } };
    g = run(g, 5);
    expect(g.intro.state).toBe('done');
  });
});

describe('登場演出の間はゲームが止まる(2.2)', () => {
  const started = (): GameState => stepGame(world(TRIGGER_X), NO_INPUT, FIXED_DT);

  it('移動・ジャンプの入力を与え続けても、プレイヤーは動かない', () => {
    const g0 = started();
    const g = run(g0, 60, { ...RIGHT, jump: true });
    expect(g.player).toEqual(g0.player);
  });

  it('ヌシ・弾・敵・無敵時間・HP は変化しない', () => {
    const g0 = { ...started(), hitInvuln: 1.5 };
    const g = run(g0, 60);
    expect(nushiOf(g)).toEqual(nushiOf(g0));
    expect(g.hitInvuln).toBe(1.5);
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.projectiles).toEqual(g0.projectiles);
  });

  it('3 秒で終わり、そのあとは操作を受け付け、ヌシは往復から始める', () => {
    let g = started();
    g = run(g, Math.round(INTRO_TIME * 60) - 2);
    expect(g.intro.state).toBe('playing');
    g = run(g, 4);
    expect(g.intro.state).toBe('done');
    const moved = run(g, 30, RIGHT);
    expect(moved.player.x).toBeGreaterThan(g.player.x);
    expect(['patrol']).toContain(nushiOf(g).script[nushiOf(g).step]!.a);
    // 演出が終わると、ヌシが動き出す(往復)
    expect(nushiOf(run(g, 30)).x).not.toBe(nushiOf(g).x);
  });
});

describe('登場演出のカメラ(2.3)', () => {
  const at = (t: number): GameState => ({ ...world(TRIGGER_X), intro: { state: 'playing', t } });
  const playerCam = (g: GameState) => computeCameraX(g.player.x + PLAYER_WIDTH / 2);
  const bossCam = (g: GameState) => computeCameraX(nushiOf(g).x + nushiOf(g).w / 2);

  it('始まりと終わりは、プレイヤーを追うカメラ', () => {
    expect(cameraOf(at(0)).x).toBeCloseTo(playerCam(at(0)), 6);
    expect(cameraOf(at(INTRO_TIME - 0.0001)).x).toBeCloseTo(playerCam(at(0)), 1);
  });

  it('途中(1.5 秒)は、ヌシの中心が画面に収まる位置', () => {
    const g = at(1.5);
    const cam = cameraOf(g);
    expect(cam.x).toBeCloseTo(bossCam(g), 6);
    const b = nushiOf(g);
    expect(b.x).toBeGreaterThanOrEqual(cam.x);
    expect(b.x + b.w).toBeLessThanOrEqual(cam.x + VIEW_WIDTH);
  });

  it('寄る途中は、2 つのカメラの間にある', () => {
    const g = at(0.4);
    const k = introCameraBlend(0.4);
    expect(cameraOf(g).x).toBeCloseTo(playerCam(g) + (bossCam(g) - playerCam(g)) * k, 6);
  });

  it('演出の外(眠っている・済み)は、従来どおり、プレイヤーを追う', () => {
    for (const state of ['sleeping', 'done'] as const) {
      const g: GameState = { ...world(TRIGGER_X), intro: { state, t: 0 } };
      expect(cameraOf(g).x).toBeCloseTo(playerCam(g), 6);
    }
  });
});
