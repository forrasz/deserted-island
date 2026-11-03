import { describe, expect, it } from 'vitest';
import {
  ENEMY_SIZE,
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
import { ENEMY_KINDS } from './enemy-defs';
import { canTransit, horizontalGap, validatePlacements, validateStage } from './stage-check';

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
  it('幅は 25800、高さは 1620', () => {
    expect(STAGE.world.width).toBe(25800);
    expect(STAGE.world.height).toBe(1620);
    expect(WORLD_WIDTH).toBe(25800);
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

  it('歩くだけの所要時間(スタートから海の開始位置までを移動速度で割る)は 80〜100 秒', () => {
    const seconds = (SEA_X - START_X) / MOVE_SPEED;
    expect(seconds).toBeGreaterThanOrEqual(80);
    expect(seconds).toBeLessThanOrEqual(100);
  });

  it('歩くだけの時間に、ボス 10 体 × 8 秒を加えた目安の合計は、150〜210 秒(約 3 分)', () => {
    const total = (SEA_X - START_X) / MOVE_SPEED + STAGE.bosses.length * 8;
    expect(total).toBeGreaterThanOrEqual(150);
    expect(total).toBeLessThanOrEqual(210);
  });
});

describe('平地の区間', () => {
  it('スタート地点の周囲(0〜2400)には、穴・崖・浮島がない', () => {
    expect(hasFeatureIn(STAGE, 0, 2400)).toBe(false);
  });

  it('10 か所のボスの闘技場(往復範囲とその前後 100)には、穴・崖・浮島がない', () => {
    expect(STAGE.bosses).toHaveLength(10);
    for (const b of STAGE.bosses) {
      expect(hasFeatureIn(STAGE, b.left - 100, b.right + b.def.w + 100)).toBe(false);
    }
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
    expect(g.bosses[0]!.alive).toBe(true);
    expect(g.bosses[0]!.y + 100).toBe(GROUND_Y);
    expect(g.bosses[0]!.x).toBeGreaterThanOrEqual(STAGE.bosses[0]!.left);
    expect(g.bosses[0]!.x).toBeLessThanOrEqual(STAGE.bosses[0]!.right);
  });

  it('何もしなくても、落下せずにその場に立ち続ける(HP は変化しない)', () => {
    let g = createGame();
    for (let i = 0; i < 300; i++) g = stepGame(g, NO_INPUT);
    expect(g.hp).toBe(3);
    expect(g.player.onGround).toBe(true);
  });
});

describe('敵とボスの配置', () => {
  it('ボスは 10 体で、左から右へ順に並び、別々の闘技場にいる(往復範囲が重ならない)', () => {
    expect(STAGE.bosses).toHaveLength(10);
    for (let i = 1; i < STAGE.bosses.length; i++) {
      const prev = STAGE.bosses[i - 1]!;
      expect(STAGE.bosses[i]!.left).toBeGreaterThan(prev.right + prev.def.w);
    }
    expect(STAGE.bosses.map((b) => b.def.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('ザコ敵は 30 体以上で、10 種類すべてが 3 体以上ずつ', () => {
    expect(STAGE.enemies.length).toBeGreaterThanOrEqual(30);
    for (const kind of ENEMY_KINDS) {
      expect(STAGE.enemies.filter((e) => e.kind === kind).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('ザコ敵の往復範囲には、穴・崖・浮島がかからない', () => {
    for (const e of STAGE.enemies) {
      expect(hasFeatureIn(STAGE, e.left, e.right + ENEMY_SIZE)).toBe(false);
    }
  });

  it('スタートから 600 と、海の手前 600 には、ザコ敵もボスもいない', () => {
    for (const e of STAGE.enemies) {
      expect(e.left).toBeGreaterThanOrEqual(600);
      expect(e.right + ENEMY_SIZE).toBeLessThanOrEqual(SEA_X - 600);
    }
    for (const b of STAGE.bosses) {
      expect(b.left).toBeGreaterThanOrEqual(600);
      expect(b.right + b.def.w).toBeLessThanOrEqual(SEA_X - 600);
    }
  });

  it('ザコ敵は、ボスの往復範囲(前後 100 を含む)と重ならない', () => {
    for (const e of STAGE.enemies) {
      for (const b of STAGE.bosses) {
        const overlap = e.left < b.right + b.def.w + 100 && b.left - 100 < e.right + ENEMY_SIZE;
        expect(overlap).toBe(false);
      }
    }
  });

  it('ボスの定義(体力・速さ)は、配置ごとに定義どおり', () => {
    for (const b of STAGE.bosses) {
      expect(b.right - b.left).toBe(b.def.rangeWidth);
      expect(b.x).toBe(b.left);
    }
  });

  it('実際の配置は、検査に違反がない', () => {
    expect(validatePlacements(STAGE)).toEqual([]);
  });
});

describe('validatePlacements(配置の検査の確認)', () => {
  it('ボスが 10 体でないと違反になる', () => {
    expect(validatePlacements({ ...STAGE, bosses: STAGE.bosses.slice(0, 9) }).some((e) => e.includes('10 体'))).toBe(true);
  });

  it('ザコ敵が 30 体に足りないと違反になる', () => {
    expect(validatePlacements({ ...STAGE, enemies: STAGE.enemies.slice(0, 20) }).some((e) => e.includes('30 体'))).toBe(true);
  });

  it('ある種類が 3 体に満たないと違反になる', () => {
    const fewer = STAGE.enemies.filter((e, i) => !(e.kind === 'hider' && i === STAGE.enemies.findIndex((x) => x.kind === 'hider')));
    expect(validatePlacements({ ...STAGE, enemies: fewer }).some((e) => e.includes('hider'))).toBe(true);
  });

  it('ザコ敵の範囲が穴にかかると違反になる', () => {
    const pit = STAGE.pits[0]!;
    const bad = { ...STAGE.enemies[0]!, left: pit.x - 20, right: pit.x + 20, x: pit.x };
    expect(validatePlacements({ ...STAGE, enemies: [bad, ...STAGE.enemies.slice(1)] }).some((e) => e.includes('穴・崖・浮島'))).toBe(true);
  });

  it('スタートの安全な区間にザコ敵がいると違反になる', () => {
    const bad = { ...STAGE.enemies[0]!, left: 100, right: 200, x: 100 };
    expect(validatePlacements({ ...STAGE, enemies: [bad, ...STAGE.enemies.slice(1)] }).some((e) => e.includes('安全な区間'))).toBe(true);
  });

  it('ザコ敵がボスの範囲と重なると違反になる', () => {
    const b = STAGE.bosses[1]!;
    const bad = { ...STAGE.enemies[0]!, left: b.left, right: b.left + 100, x: b.left };
    expect(validatePlacements({ ...STAGE, enemies: [bad, ...STAGE.enemies.slice(1)] }).some((e) => e.includes('ボス'))).toBe(true);
  });

  it('ボスの前後が平地でない(崖がかかる)と違反になる', () => {
    const b = STAGE.bosses[1]!;
    const wall = { x: b.right + b.def.w + 40, y: GROUND_Y - 100, w: 100, h: 100 };
    const bad = { ...STAGE, cliffs: [...STAGE.cliffs, wall] };
    expect(validatePlacements(bad).some((e) => e.includes('前後'))).toBe(true);
  });
});

describe('最終ボス「ヌシ」の闘技場', () => {
  const nushi = STAGE.bosses[9]!;

  it('10 番目(最も右側)の闘技場にいて、往復範囲の幅は 600、大きさは 200×250', () => {
    expect(nushi.def.name).toBe('ヌシ');
    expect(nushi.right - nushi.left).toBe(600);
    expect([nushi.def.w, nushi.def.h]).toEqual([200, 250]);
    for (const b of STAGE.bosses.slice(0, 9)) expect(b.right).toBeLessThan(nushi.left);
  });

  it('大きさ(200)と前後 100 を含む範囲が、穴・崖・浮島のない平らな地面', () => {
    expect(hasFeatureIn(STAGE, nushi.left - 100, nushi.right + nushi.def.w + 100)).toBe(false);
  });

  it('大きさを含む範囲が、海の手前の安全な区間(海の手前 600)に入らない', () => {
    expect(nushi.right + nushi.def.w).toBeLessThanOrEqual(SEA_X - 600);
  });

  it('ヌシの範囲(大きさと前後 100 を含む)に、ザコ敵は配置されていない', () => {
    for (const e of STAGE.enemies) {
      const overlap = e.left < nushi.right + nushi.def.w + 100 && nushi.left - 100 < e.right + ENEMY_SIZE;
      expect(overlap).toBe(false);
    }
  });

  it('大きさを無視した検査(幅 80 として扱う)なら通るが、実際の幅 200 で検査すると、近すぎる配置を検出する', () => {
    // ヌシの右端から幅 80 + 100 の位置にザコ敵を置く(通常ボスの幅なら重ならないが、ヌシの幅 200 では重なる)
    const bad = { ...STAGE.enemies[0]!, left: nushi.right + 80 + 100 + 20, right: nushi.right + 80 + 100 + 60, x: nushi.right + 80 + 100 + 20 };
    const errors = validatePlacements({ ...STAGE, enemies: [bad, ...STAGE.enemies.slice(1)] });
    expect(errors.some((e) => e.includes('ボス 9'))).toBe(true);
  });
});
