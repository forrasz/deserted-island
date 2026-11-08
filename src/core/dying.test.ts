import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, bossRect, createBoss, damageBoss, type Boss } from './boss';
import { bossFlags, stepBossScript } from './boss-scripts';
import { finishDying } from './boss-test-helpers';
import {
  DYING_TIME_SCALE,
  FIXED_DT,
  GROUND_Y,
  NUSHI_DYING_TIME,
  PLAYER_HEIGHT,
  PLAYER_MAX_HP,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT } from './input';
import { createShot, createWave } from './projectile';

const H = PLAYER_HEIGHT;
const NUSHI = BOSS_DEFS[9]!;

function nushi(over: Partial<Boss> = {}): Boss {
  return { ...createBoss(1000, 1000, 1000, GROUND_Y, NUSHI), vx: 0, hp: 4, transformed: true, form: 2, ...over };
}
/** 気絶中のヌシの、かがんだ上辺へ落ちるプレイヤーがいる世界(登場演出は済んでいる)。 */
function stompWorld(b: Boss, over: Partial<GameState> = {}): GameState {
  const r = bossRect(b);
  return {
    ...createGame(undefined, { bosses: [], enemies: [] }),
    intro: { state: 'done', t: 3 },
    bosses: [b],
    player: { x: b.x + 90, y: r.y - H - 5, vx: 0, vy: 300, onGround: false },
    ...over,
  };
}
const steps = (g: GameState, n: number): GameState => {
  let s = g;
  for (let i = 0; i < n; i++) s = stepGame(s, NO_INPUT, FIXED_DT);
  return s;
};

describe('ヌシの撃破演出(boss: 3.1)', () => {
  it('体力が 0 になっても、ヌシは撃破されず、撃破演出に入る(気絶は解ける)', () => {
    const b = damageBoss({ ...nushi({ stagger: 6, hp: 4 }) }, 4);
    expect(b.hp).toBe(0);
    expect(b.alive).toBe(true);
    expect(b.dying).toBe(NUSHI_DYING_TIME);
    expect(b.stagger).toBe(0);
  });

  it('通常ボスは、これまでどおり、体力が 0 でただちに撃破される', () => {
    const b = createBoss(1000, 1000, 1000, GROUND_Y, BOSS_DEFS[0]!);
    const d = damageBoss({ ...b, hp: 1 });
    expect(d.alive).toBe(false);
    expect(d.dying).toBe(0);
  });

  it('演出中は、動かず・攻撃せず、無害(踏んでも触れてもダメージなし)', () => {
    let b = nushi({ dying: NUSHI_DYING_TIME, hp: 0 });
    const x = b.x;
    for (let i = 0; i < 50; i++) {
      const r = stepBossScript(b, { playerX: 0, groundY: GROUND_Y }, FIXED_DT);
      expect(r.spawns).toEqual([]);
      b = r.boss;
      expect(b.x).toBe(x);
    }
    expect(bossFlags(b).harmless).toBe(true);
  });

  it('演出の時間が尽きると、撃破される', () => {
    let b = nushi({ dying: 0.01, hp: 0 });
    b = stepBossScript(b, { playerX: 0, groundY: GROUND_Y }, FIXED_DT).boss;
    expect(b.alive).toBe(false);
    expect(b.dying).toBe(0);
  });
});

describe('撃破演出の最中のゲーム(boss: 3.2)', () => {
  const killed = (): GameState => stepGame(stompWorld(nushi({ stagger: 6, hp: 4 })), NO_INPUT, FIXED_DT);

  it('体力が 0 になっても、ヌシはまだ画面にいて、部品はまだない', () => {
    const g = killed();
    expect(g.bosses[0]!.hp).toBe(0);
    expect(g.bosses[0]!.alive).toBe(true);
    expect(g.bosses[0]!.dying).toBeGreaterThan(0);
    expect(g.parts).toHaveLength(0);
  });

  it('ゲームの時間は 0.3 倍で進む(実時間 1 秒で、約 0.3 秒ぶん)', () => {
    const g0 = killed();
    const g = steps(g0, 60);
    expect(g0.bosses[0]!.dying - g.bosses[0]!.dying).toBeCloseTo(60 * FIXED_DT * DYING_TIME_SCALE, 6);
  });

  it('実時間で約 3.5 秒(210 更新)で、ヌシが撃破され、部品が 1 個落ち、柱がすべて崩れる', () => {
    const g0 = killed();
    const before = steps(g0, 205);
    expect(before.bosses[0]!.alive).toBe(true);
    expect(before.parts).toHaveLength(0);
    const after = steps(before, 10);
    expect(after.bosses[0]!.alive).toBe(false);
    expect(after.parts).toHaveLength(1);
    expect(after.pillars.every((p) => !p.alive)).toBe(true);
  });

  it('演出が始まった更新で、ヌシの弾と衝撃波は消える', () => {
    const shot = createShot(5000, GROUND_Y - 48, 260);
    const wave = createWave(6000, GROUND_Y, 300);
    const g = stepGame(stompWorld(nushi({ stagger: 6, hp: 4 }), { projectiles: [shot, wave] }), NO_INPUT, FIXED_DT);
    expect(g.projectiles).toEqual([]);
  });

  it('演出中は、ヌシに触れても、被弾しない(HP が減らない)', () => {
    let g = killed();
    g = { ...g, player: { x: g.bosses[0]!.x - 20, y: GROUND_Y - H, vx: 0, vy: 0, onGround: true } };
    g = steps(g, 60);
    expect(g.hp).toBe(PLAYER_MAX_HP);
  });

  it('演出は 1 回だけ(撃破のあと、スローモーションにならず、時間は通常の速さ)', () => {
    const g = finishDying(killed());
    expect(g.bosses[0]!.alive).toBe(false);
    const a = steps({ ...g, hitInvuln: 1 }, 30);
    expect(a.hitInvuln).toBeCloseTo(1 - 30 * FIXED_DT, 6); // 通常の速さで減る
  });

  it('撃破のあと、ヌシは動かず、弾も出さない', () => {
    const g = steps(finishDying(killed()), 120);
    expect(g.projectiles).toEqual([]);
    expect(g.bosses[0]!.alive).toBe(false);
  });
});
