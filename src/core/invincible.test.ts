import { describe, expect, it } from 'vitest';
import { createBonus, stepBonus, type BonusItem } from './bonus';
import { createBoss, type Boss } from './boss';
import { createEnemy } from './enemy';
import type { Rect } from './collision';
import {
  FIXED_DT,
  GROUND_Y,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  STOMP_BOUNCE_SPEED,
} from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT } from './input';
import { createPlayer, type Player } from './player';
import { createShot } from './projectile';
import { fallYOf, type WorldBounds } from './terrain';

const empty = { bosses: [], enemies: [] };

function base(over: Partial<GameState> = {}): GameState {
  return { ...createGame(undefined, empty), ...over };
}

function stillBoss(x: number, over: Partial<Boss> = {}): Boss {
  return { ...createBoss(x, x, x), vx: 0, ...over };
}

function step(g: GameState, n = 1): GameState {
  let s = g;
  for (let i = 0; i < n; i++) s = stepGame(s, NO_INPUT, FIXED_DT);
  return s;
}

describe('無敵モードの効果: 敵・ボス・弾', () => {
  it('既定は無敵ではない', () => {
    expect(createGame().invincible).toBe(false);
  });

  it('オフのとき、ザコ敵に横から触れるとHPが 1 減る(従来どおり)', () => {
    const e = createEnemy('plodder', 1000, 1000, 1000, GROUND_Y, 0);
    const g = stepGame(
      base({ enemies: [e], player: createPlayer(e.x - PLAYER_WIDTH + 10) }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
    expect(g.hitInvuln).toBe(PLAYER_INVULN_TIME);
  });

  it('オンのとき、ザコ敵に横から触れても、HPは減らず、無敵時間(点滅)も始まらない', () => {
    const e = createEnemy('plodder', 1000, 1000, 1000, GROUND_Y, 0);
    const g = step(
      base({ invincible: true, enemies: [e], player: createPlayer(e.x - PLAYER_WIDTH + 10) }),
      30,
    );
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.hitInvuln).toBe(0);
    expect(g.dead).toBe(false);
  });

  it('オンのとき、ボスに横から触れても被弾せず、ボスの体で押し戻される(通り抜けられない)', () => {
    const b = stillBoss(1000);
    const g = stepGame(
      base({ invincible: true, bosses: [b], player: createPlayer(b.x - PLAYER_WIDTH + 10) }),
      { ...NO_INPUT, right: true },
      FIXED_DT,
    );
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.hitInvuln).toBe(0);
    expect(g.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(b.x + 0.001);
  });

  it('オンのとき、ボスの弾に当たってもHPは減らない', () => {
    const player = createPlayer(1000);
    const shot = createShot(player.x + 5, player.y + 10, 0);
    const g = stepGame(base({ invincible: true, player, projectiles: [shot] }), NO_INPUT, FIXED_DT);
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.hitInvuln).toBe(0);
  });

  it('オンでも、上から踏みつけると、ボスの体力が減り、プレイヤーは跳ね返る', () => {
    const b = stillBoss(1000);
    const player: Player = { x: b.x + 20, y: b.y - PLAYER_HEIGHT - 5, vx: 0, vy: 300, onGround: false };
    const g = stepGame(base({ invincible: true, bosses: [b], player }), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(b.hp - 1);
    expect(g.player.vy).toBe(-STOMP_BOUNCE_SPEED);
  });
});

describe('無敵モードの効果: 穴の落下', () => {
  const GROUND = 1000;
  const world: WorldBounds = {
    width: 4000,
    groundY: GROUND,
    height: 1080,
    solids: [
      { x: 0, y: GROUND, w: 600, h: 80 } as Rect,
      { x: 780, y: GROUND, w: 3220, h: 80 } as Rect,
    ],
  };
  const aboutToFall = (): Player => ({ x: 650, y: fallYOf(world) - 1, vx: 0, vy: 600, onGround: false });
  const game = (over: Partial<GameState>): GameState => ({
    ...createGame(world, empty),
    respawn: { x: 300, y: GROUND - PLAYER_HEIGHT },
    player: aboutToFall(),
    ...over,
  });

  it('オフのとき、HPが 1 減り、無敵時間が 2 秒になる(従来どおり)', () => {
    const g = stepGame(game({}), NO_INPUT, FIXED_DT, world);
    expect(g.hp).toBe(PLAYER_MAX_HP - 1);
    expect(g.hitInvuln).toBe(PLAYER_INVULN_TIME);
  });

  it('オンのとき、直前の足場へ戻されるが、HPは減らず、無敵時間も始まらない', () => {
    const g = stepGame(game({ invincible: true }), NO_INPUT, FIXED_DT, world);
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.hitInvuln).toBe(0);
    expect(g.player.x).toBe(300);
    expect(g.player.y).toBe(GROUND - PLAYER_HEIGHT);
  });
});

describe('無敵モードの効果: ボーナスの石とハート', () => {
  function onPlayer(kind: 'heart' | 'stone'): ReturnType<typeof createBonus> {
    const b = createBonus({ x: 0, y: 0 });
    const item: BonusItem = { kind, x: b.player.x + 5, y: b.player.y + 5, vx: 0, vy: 0, alive: true };
    return { ...b, items: [item], t: 0.1, spawned: 1 };
  }

  it('オンのとき、石に触れても、HPは減らず・硬直せず・石は消えない', () => {
    const r = stepBonus(onPlayer('stone'), 5, 0, NO_INPUT, FIXED_DT, true);
    expect(r.hp).toBe(5);
    expect(r.hitInvuln).toBe(0);
    expect(r.bonus.stun).toBe(0);
    expect(r.bonus.items).toHaveLength(1);
  });

  it('オフのとき、石に触れるとHPが 1 減る(従来どおり)', () => {
    const r = stepBonus(onPlayer('stone'), 5, 0, NO_INPUT, FIXED_DT);
    expect(r.hp).toBe(4);
  });

  it('オンでも、ハートでHPが回復する', () => {
    const r = stepBonus(onPlayer('heart'), 3, 0, NO_INPUT, FIXED_DT, true);
    expect(r.hp).toBe(4);
  });

  it('ゲームを通して(stepGame)、ボーナス中の石でもHPが減らない', () => {
    const g0 = step(base({ invincible: true, player: createPlayer(12880) }));
    expect(g0.bonus).not.toBeNull();
    const stone: BonusItem = {
      kind: 'stone',
      x: g0.bonus!.player.x + 5,
      y: g0.bonus!.player.y + 5,
      vx: 0,
      vy: 0,
      alive: true,
    };
    const g = step({ ...g0, bonus: { ...g0.bonus!, items: [stone], t: 0.1, spawned: 1 } }, 5);
    expect(g.hp).toBe(PLAYER_MAX_HP);
    expect(g.invincible).toBe(true);
  });
});
