import { BOSS_DEFS, type BossDef } from './boss';
import type { Rect } from './collision';
import {
  FINAL_PILLAR_HEIGHT,
  FINAL_PILLAR_WIDTH,
  GROUND_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config';
import type { EnemyKind } from './enemy-defs';
import type { WorldBounds } from './terrain';

/** 穴(地面のない区間)。 */
export interface Pit {
  x: number;
  w: number;
}

/** 経路上の「立つ足場」。上面の高さ y と、横の範囲 [x0, x1]。 */
export interface RouteNode {
  kind: 'ground' | 'cliff' | 'island';
  x0: number;
  x1: number;
  y: number;
}

/** ボスの配置。left / right は往復範囲(ボスの左辺 x が取りうる範囲)。 */
export interface BossPlacement {
  def: BossDef;
  x: number;
  left: number;
  right: number;
}

/** ザコ敵の配置。left / right は往復範囲(敵の左辺 x が取りうる範囲)。 */
export interface EnemyPlacement {
  kind: EnemyKind;
  x: number;
  left: number;
  right: number;
}

export interface Stage {
  world: WorldBounds;
  pits: Pit[];
  cliffs: Rect[];
  islands: Rect[];
  /** スタート地点から海の手前まで、順に立つ足場の列。 */
  route: RouteNode[];
  /** ボス 10 体(先の闘技場ほど後ろ)。 */
  bosses: BossPlacement[];
  /** ザコ敵(10 種類 × 3 体)。 */
  enemies: EnemyPlacement[];
  /** 最終ボスの闘技場の入口(西)と出口(東)に立つ、壊せる柱(通れない。ボスの突進が当たると壊れる)。 */
  pillars: Rect[];
}

/** ボスの往復範囲の左端(ボスの左辺 x)。10 か所の闘技場に 1 体ずつ。 */
export const BOSS_LEFTS: readonly number[] = [
  1600, 4450, 7250, 10850, 14250, 17650, 20810, 21810, 22810, 24020,
];

/**
 * 最終ボス(ヌシ)の闘技場の柱の位置(左辺 x)。柱の東の縁が、ヌシの往復範囲の左端(= BOSS_LEFTS の最後)になる。
 * プレイヤーは柱の西側から来て、ヌシの突進を柱に当てて気絶させる。
 */
export const FINAL_PILLAR_X = BOSS_LEFTS[BOSS_LEFTS.length - 1]! - FINAL_PILLAR_WIDTH;
/** 東の柱の位置(左辺 x)。柱の西の縁が、ヌシの往復範囲の右端のヌシの右辺(範囲の右端 + 本体の幅)になる。 */

/** 浮島の厚み(px)。 */
const ISLAND_THICKNESS = 20;
/** 浮島の幅(px)の既定値。 */
const ISLAND_WIDTH = 180;

/** 地面から rise だけ高い崖(地面から立ち上がる壁。上に乗れる)。 */
function cliff(x: number, w: number, rise: number): Rect {
  return { x, y: GROUND_Y - rise, w, h: rise };
}

/** 地面から rise だけ高い位置にある浮島(下から抜けられる薄い足場)。 */
function island(x: number, w: number, rise: number): Rect {
  return { x, y: GROUND_Y - rise, w, h: ISLAND_THICKNESS };
}

/**
 * 浮島を横に並べる。x0 から、幅 w・隙間 gap で、rises の高さ(地面からの高さ)ごとに 1 枚ずつ。
 */
function chain(x0: number, rises: number[], w: number = ISLAND_WIDTH, gap = 100): Rect[] {
  return rises.map((rise, i) => island(x0 + i * (w + gap), w, rise));
}

/** 経路の指定(足場の解決は、地面の区間が決まったあとに行う)。 */
type RouteStep =
  | { t: 'ground'; x: number }
  | { t: 'cliff'; r: Rect }
  | { t: 'island'; r: Rect };

function buildStage(): Stage {
  // 区間ごとの x のずらし(闘技場の挿入ぶん)。既存の区間の形は保ったまま、平行移動する。
  const OX_B = 0; //     2400〜4200   崖の階段
  const OX_C = 1000; //  5200〜7000   連続する穴
  const OX_D = 2000; //  8000〜10600  浮島の塔
  const OX_E = 3000; //  11600〜14000 高所の回廊
  const OX_F = 4000; //  15000〜17400 崖の階段と尾根
  const OX_G = 5000; //  18400〜20560 混合区間

  // --- 穴 ---
  const pits: Pit[] = [
    { x: 4300 + OX_C, w: 120 },
    { x: 4620 + OX_C, w: 150 },
    { x: 4970 + OX_C, w: 180 },
    { x: 13350 + OX_F, w: 150 },
    { x: 14100 + OX_G, w: 160 },
  ];

  // --- 崖 ---
  // 区間 B: 崖の階段(90 ずつ 3 段で上り、降りる)
  const stairsB = [
    cliff(2600 + OX_B, 260, 90),
    cliff(2860 + OX_B, 260, 180),
    cliff(3120 + OX_B, 260, 270),
    cliff(3380 + OX_B, 200, 180),
    cliff(3580 + OX_B, 200, 90),
  ];
  // 区間 D: 浮島の塔のてっぺんの柱(高所の足場。上に乗れる)
  const pillar = cliff(7660 + OX_D, 400, 880);
  // 区間 F: 崖の階段(100 ずつ 5 段)、尾根、降り
  const stairsF = [0, 1, 2, 3, 4].map((k) => cliff(11200 + OX_F + k * 240, 240, 100 * (k + 1)));
  const ridge = cliff(12400 + OX_F, 300, 500);
  const descentF = [cliff(12700 + OX_F, 240, 250), cliff(12940 + OX_F, 240, 100)];
  // 区間 G: 低い崖
  const lowCliffG = cliff(13800 + OX_G, 200, 100);

  // --- 浮島 ---
  // 区間 D: 浮島の塔(110 ずつ 8 枚、約 880 登る)
  const towerD = chain(6000 + OX_D, [110, 220, 330, 440, 550, 660, 770, 880], 160, 40);
  // 区間 E: 高所の浮島の回廊
  const corridorE = chain(8700 + OX_E, [110, 220, 330, 440, 550, 650, 550, 450], ISLAND_WIDTH, 100);
  // 区間 G: 浮島の連なり
  const chainG = chain(14500 + OX_G, [110, 220, 330, 220], 160, 100);

  const cliffs: Rect[] = [
    ...stairsB,
    pillar,
    ...stairsF,
    ridge,
    ...descentF,
    lowCliffG,
  ];
  const islands: Rect[] = [...towerD, ...corridorE, ...chainG];

  // --- 地面: 穴で分割された区間 ---
  const sortedPits = [...pits].sort((a, b) => a.x - b.x);
  const slabs: Rect[] = [];
  let cursor = 0;
  for (const p of sortedPits) {
    slabs.push({ x: cursor, y: GROUND_Y, w: p.x - cursor, h: WORLD_HEIGHT - GROUND_Y });
    cursor = p.x + p.w;
  }
  slabs.push({ x: cursor, y: GROUND_Y, w: WORLD_WIDTH - cursor, h: WORLD_HEIGHT - GROUND_Y });

  const slabAt = (x: number): Rect => {
    const s = slabs.find((r) => x >= r.x && x < r.x + r.w);
    if (!s) throw new Error(`x=${x} に地面がありません`);
    return s;
  };
  const resolve = (step: RouteStep): RouteNode => {
    if (step.t === 'ground') {
      const s = slabAt(step.x);
      return { kind: 'ground', x0: s.x, x1: s.x + s.w, y: s.y };
    }
    const r = step.r;
    return { kind: step.t, x0: r.x, x1: r.x + r.w, y: r.y };
  };
  const g = (x: number): RouteStep => ({ t: 'ground', x });
  const c = (r: Rect): RouteStep => ({ t: 'cliff', r });
  const i = (r: Rect): RouteStep => ({ t: 'island', r });

  // --- 経路(スタートから海の手前まで、順に立つ足場) ---
  const rawRoute: RouteStep[] = [
    g(100),
    // B: 崖の階段
    ...stairsB.map(c),
    g(3900),
    // C: 連続する穴
    g(5100),
    g(5500),
    g(5850),
    g(6300),
    // D: 浮島の塔 → 柱 → 降りる
    ...towerD.map(i),
    c(pillar),
    g(10300),
    // E: 高所の回廊 → 降りる
    ...corridorE.map(i),
    g(14100),
    // F: 崖の階段、尾根、降り、穴
    ...stairsF.map(c),
    c(ridge),
    ...descentF.map(c),
    g(17250),
    g(17700),
    // G: 低い崖、穴、浮島の連なり
    c(lowCliffG),
    g(19050),
    g(19300),
    ...chainG.map(i),
    // 闘技場 7〜10 と砂浜
    g(23000),
  ];
  const resolved = rawRoute.map(resolve);
  // 連続して同じ足場を指すものは 1 つにまとめる
  const route = resolved.filter((n, idx) => {
    const prev = resolved[idx - 1];
    return !prev || prev.kind !== n.kind || prev.x0 !== n.x0 || prev.x1 !== n.x1 || prev.y !== n.y;
  });

  // --- ボス 10 体(各闘技場に 1 体) ---
  const bosses: BossPlacement[] = BOSS_DEFS.map((def, k) => {
    const left = BOSS_LEFTS[k]!;
    return { def, x: left, left, right: left + def.rangeWidth };
  });

  // --- ザコ敵(10 種類 × 3 体)。往復範囲は、穴・崖・浮島のない平地の空き区間の中 ---
  const enemySpec: Array<[EnemyKind, number, number]> = [
    // 区間 1: スタートとボス 1 の間
    ['plodder', 650, 850],
    ['hopper', 900, 1100],
    ['sleeper', 1150, 1260],
    ['plodder', 1300, 1450],
    // ボス 1 のあと〜崖の階段の手前
    ['scurrier', 2200, 2350],
    ['chaser', 2380, 2530],
    // 崖の階段のあと〜ボス 2 の手前
    ['hopper', 3830, 3950],
    ['bouncer', 4000, 4100],
    ['floater', 4150, 4300],
    // 穴の連続の手前と間
    ['hider', 5060, 5230],
    ['charger', 5460, 5540],
    // 穴のあと〜ボス 3 の手前(広い平地)
    ['swooper', 6200, 6500],
    ['chaser', 6550, 6750],
    ['sleeper', 6800, 6900],
    ['scurrier', 6950, 7100],
    // 浮島の塔のあと〜ボス 4 の手前
    ['bouncer', 10100, 10300],
    ['charger', 10350, 10500],
    ['hider', 10550, 10700],
    // 高所の回廊の手前と、ボス 5 の手前
    ['plodder', 11480, 11620],
    ['swooper', 13880, 14100],
    // 崖の階段の手前
    ['hopper', 14890, 15100],
    // ボス 6 のあと〜低い崖の手前
    ['floater', 18300, 18500],
    ['chaser', 18550, 18700],
    // 低い崖のあと
    ['sleeper', 19300, 19420],
    // ボス 7〜10 の闘技場の間
    ['scurrier', 20480, 20640],
    ['hider', 21470, 21640],
    ['charger', 22480, 22640],
    ['bouncer', 23500, 23650],
    // ヌシ(大きさ 200)のあと〜砂浜の安全な区間の手前
    ['floater', 24730, 24790],
    ['swooper', 24840, 24900],
  ];
  const enemies: EnemyPlacement[] = enemySpec.map(([kind, left, right]) => ({
    kind,
    x: left,
    left,
    right,
  }));

  return {
    world: {
      width: WORLD_WIDTH,
      groundY: GROUND_Y,
      height: WORLD_HEIGHT,
      solids: [...slabs, ...cliffs],
      platforms: islands,
    },
    pits: sortedPits,
    cliffs,
    islands,
    route,
    bosses,
    enemies,
    pillars: [
      { x: FINAL_PILLAR_X, y: GROUND_Y - FINAL_PILLAR_HEIGHT, w: FINAL_PILLAR_WIDTH, h: FINAL_PILLAR_HEIGHT },
      {
        x: bosses[9]!.right + bosses[9]!.def.w,
        y: GROUND_Y - FINAL_PILLAR_HEIGHT,
        w: FINAL_PILLAR_WIDTH,
        h: FINAL_PILLAR_HEIGHT,
      },
    ],
  };
}

export const STAGE: Stage = buildStage();
