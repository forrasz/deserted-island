import { describe, expect, it } from 'vitest';
import {
  BOSS_PATROL_LEFT,
  BOSS_PATROL_RIGHT,
  BOSS_WIDTH,
  GROUND_Y,
  MAX_PIT_WIDTH,
  MOVE_SPEED,
  SEA_X,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config';
import { createGame, stepGame } from './game';
import { NO_INPUT } from './input';
import { DEFAULT_WORLD } from './player';
import { STAGE, type Stage } from './stage';
import { canTransit, horizontalGap, validateStage } from './stage-check';

const START_X = 100;

function overlapsRange(x0: number, x1: number, r: { x: number; w: number }): boolean {
  return r.x < x1 && x0 < r.x + r.w;
}

/** [x0, x1) の範囲に、穴・崖・浮島のいずれかがかかっているか。 */
function hasFeatureIn(stage: Stage, x0: number, x1: number): boolean {
  return (
    stage.pits.some((p) => overlapsRange(x0, x1, p)) ||
    stage.cliffs.some((c) => overlapsRange(x0, x1, c)) ||
    stage.islands.some((i) => overlapsRange(x0, x1, i))
  );
}

describe('ステージの規模', () => {
  it('幅は 16800、高さは 1620', () => {
    expect(STAGE.world.width).toBe(16800);
    expect(STAGE.world.height).toBe(1620);
    expect(WORLD_WIDTH).toBe(16800);
    expect(WORLD_HEIGHT).toBe(1620);
  });

  it('地面の上面は、ステージの下端から 80 だけ上にある', () => {
    expect(STAGE.world.groundY).toBe(WORLD_HEIGHT - 80);
    expect(GROUND_Y).toBe(WORLD_HEIGHT - 80);
    expect(GROUND_Y).toBeLessThan(WORLD_HEIGHT);
  });

  it('海の開始位置は、ステージの右端から 240 手前', () => {
    expect(SEA_X).toBe(WORLD_WIDTH - 240);
  });

  it('歩くだけの所要時間(スタートから海の開始位置までを移動速度で割る)は 50〜70 秒', () => {
    const seconds = (SEA_X - START_X) / MOVE_SPEED;
    expect(seconds).toBeGreaterThanOrEqual(50);
    expect(seconds).toBeLessThanOrEqual(70);
  });
});

describe('平地の区間', () => {
  it('スタート地点の周囲(0〜2400)には、穴・崖・浮島がない', () => {
    expect(hasFeatureIn(STAGE, 0, 2400)).toBe(false);
  });

  it('ボスの闘技場(往復範囲とその前後)には、穴・崖・浮島がない', () => {
    expect(hasFeatureIn(STAGE, BOSS_PATROL_LEFT - 100, BOSS_PATROL_RIGHT + BOSS_WIDTH + 100)).toBe(false);
  });

  it('海の手前 1000 の区間には、穴・崖・浮島がない', () => {
    expect(hasFeatureIn(STAGE, SEA_X - 1000, SEA_X)).toBe(false);
  });

  it('スタート位置の下には地面がある', () => {
    const slab = (STAGE.world.solids ?? []).find(
      (s) => s.y === GROUND_Y && s.x <= START_X && START_X <= s.x + s.w,
    );
    expect(slab).toBeDefined();
  });
});

describe('中間の区間', () => {
  it('穴・崖・浮島のすべてが 1 つ以上ある', () => {
    expect(STAGE.pits.length).toBeGreaterThan(0);
    expect(STAGE.cliffs.length).toBeGreaterThan(0);
    expect(STAGE.islands.length).toBeGreaterThan(0);
  });

  it('地面から 700 以上の高さの足場があり、ステージの上端を超えない', () => {
    const tops = [...STAGE.cliffs, ...STAGE.islands].map((r) => GROUND_Y - r.y);
    expect(Math.max(...tops)).toBeGreaterThanOrEqual(700);
    for (const r of [...STAGE.cliffs, ...STAGE.islands]) expect(r.y).toBeGreaterThanOrEqual(0);
  });

  it('すべての地形が、ステージの幅と高さの範囲内にある', () => {
    for (const r of [...(STAGE.world.solids ?? []), ...(STAGE.world.platforms ?? [])]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(WORLD_WIDTH);
      expect(r.y + r.h).toBeLessThanOrEqual(WORLD_HEIGHT);
    }
  });

  it('穴の幅は、どれも 180 以下', () => {
    for (const p of STAGE.pits) expect(p.w).toBeLessThanOrEqual(MAX_PIT_WIDTH);
  });
});

describe('validateStage(到達可能性の制約)', () => {
  it('実際のステージは、違反がない', () => {
    expect(validateStage(STAGE)).toEqual([]);
  });

  it('穴の幅が 180 を超えると違反になる', () => {
    const bad: Stage = { ...STAGE, pits: [...STAGE.pits, { x: 9000, w: 200 }] };
    expect(validateStage(bad).some((e) => e.includes('穴の幅'))).toBe(true);
  });

  it('上りの高さ差が 110 を超えると違反になる', () => {
    const [a, b, ...rest] = STAGE.route;
    const bad: Stage = { ...STAGE, route: [a!, { ...b!, y: a!.y - 130 }, ...rest] };
    expect(validateStage(bad).some((e) => e.includes('高さ差'))).toBe(true);
  });

  it('高さ差が 60 を超える足場への隙間が 120 を超えると違反になる', () => {
    const a = { kind: 'island' as const, x0: 0, x1: 100, y: 1000 };
    const b = { kind: 'island' as const, x0: 250, x1: 350, y: 920 }; // 隙間 150、高さ差 80
    expect(horizontalGap(a, b)).toBe(150);
    const bad: Stage = { ...STAGE, route: [a, b] };
    expect(validateStage(bad).some((e) => e.includes('隙間'))).toBe(true);
  });

  it('経路上の足場の頭上すぐに崖の下面があると違反になる', () => {
    const node = STAGE.route[0]!;
    const ceiling = { x: node.x0 + 100, y: node.y - 130, w: 200, h: 40 }; // 下面は node.y - 90
    const bad: Stage = {
      ...STAGE,
      world: { ...STAGE.world, solids: [...(STAGE.world.solids ?? []), ceiling] },
    };
    expect(validateStage(bad).some((e) => e.includes('頭上'))).toBe(true);
  });

  it('ステージの範囲外の地形があると違反になる', () => {
    const bad: Stage = {
      ...STAGE,
      world: { ...STAGE.world, platforms: [...(STAGE.world.platforms ?? []), { x: WORLD_WIDTH - 50, y: 800, w: 200, h: 20 }] },
    };
    expect(validateStage(bad).some((e) => e.includes('範囲外'))).toBe(true);
  });
});

describe('経路', () => {
  it('最初はスタート地点の地面、最後は海の手前の砂浜', () => {
    const first = STAGE.route[0]!;
    const last = STAGE.route[STAGE.route.length - 1]!;
    expect(first.kind).toBe('ground');
    expect(first.x0).toBeLessThanOrEqual(START_X);
    expect(first.x1).toBeGreaterThan(START_X);
    expect(last.kind).toBe('ground');
    expect(last.y).toBe(GROUND_Y);
    expect(last.x0).toBeLessThanOrEqual(SEA_X - 1000);
    expect(last.x1).toBeGreaterThanOrEqual(SEA_X);
  });
});

describe('経路に沿った物理シミュレーション(到達可能性)', () => {
  const pairs = STAGE.route.slice(1).map((to, i) => ({ from: STAGE.route[i]!, to, index: i }));

  it('経路の隣り合う足場のすべてで、実際の物理で次の足場へ移動できる', () => {
    const failures = pairs
      .filter(({ from, to }) => !canTransit(STAGE.world, from, to))
      .map(({ from, to, index }) => `${index}→${index + 1}: ${from.kind}[${from.x0},${from.x1}]@${from.y} → ${to.kind}[${to.x0},${to.x1}]@${to.y}`);
    expect(failures).toEqual([]);
  });

  it('到達できない配置(高さ差 400)は、移動できないと判定される(検査の確認)', () => {
    const from = { kind: 'ground' as const, x0: 0, x1: 400, y: GROUND_Y };
    const to = { kind: 'island' as const, x0: 450, x1: 600, y: GROUND_Y - 400 };
    const world = {
      width: 2000,
      groundY: GROUND_Y,
      height: WORLD_HEIGHT,
      solids: [{ x: 0, y: GROUND_Y, w: 2000, h: 80 }],
      platforms: [{ x: 450, y: GROUND_Y - 400, w: 150, h: 20 }],
    };
    expect(canTransit(world, from, to)).toBe(false);
  });

  it('検査が甘すぎない: 高さ差 110 の浮島へ、隙間 120 なら届くが、隙間 260 では届かない', () => {
    const mk = (gap: number) => {
      const island = { x: 300 + gap, y: GROUND_Y - 110, w: 160, h: 20 };
      return {
        from: { kind: 'ground' as const, x0: 0, x1: 300, y: GROUND_Y },
        to: { kind: 'island' as const, x0: island.x, x1: island.x + island.w, y: island.y },
        world: {
          width: 2000,
          groundY: GROUND_Y,
          height: WORLD_HEIGHT,
          solids: [{ x: 0, y: GROUND_Y, w: 300, h: 80 }], // 地面は x=300 で途切れる(その先は穴)
          platforms: [island],
        },
      };
    };
    const near = mk(120);
    const far = mk(260);
    expect(canTransit(near.world, near.from, near.to)).toBe(true);
    expect(canTransit(far.world, far.from, far.to)).toBe(false);
  });
});

describe('既定の世界(ステージ)でのゲーム', () => {
  it('既定の世界は、地形つきのステージである', () => {
    expect(DEFAULT_WORLD).toBe(STAGE.world);
  });

  it('ゲーム開始時、プレイヤーは地面の上に立ち、ボスは闘技場の平地の上に存在する', () => {
    const g = createGame();
    expect(g.player.y + 56).toBe(GROUND_Y);
    expect(g.boss.alive).toBe(true);
    expect(g.boss.y + 100).toBe(GROUND_Y);
    expect(g.boss.x).toBeGreaterThanOrEqual(BOSS_PATROL_LEFT);
    expect(g.boss.x).toBeLessThanOrEqual(BOSS_PATROL_RIGHT);
  });

  it('何もしなくても、落下せずにその場に立ち続ける(HP は変化しない)', () => {
    let g = createGame();
    for (let i = 0; i < 300; i++) g = stepGame(g, NO_INPUT);
    expect(g.hp).toBe(3);
    expect(g.player.onGround).toBe(true);
  });
});
