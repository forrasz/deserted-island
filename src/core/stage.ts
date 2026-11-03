import type { Rect } from './collision';
import { GROUND_Y, WORLD_HEIGHT, WORLD_WIDTH } from './config';
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

export interface Stage {
  world: WorldBounds;
  pits: Pit[];
  cliffs: Rect[];
  islands: Rect[];
  /** スタート地点から海の手前まで、順に立つ足場の列。 */
  route: RouteNode[];
}

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

function buildStage(): Stage {
  // --- 穴 ---
  const pits: Pit[] = [
    { x: 4300, w: 120 },
    { x: 4620, w: 150 },
    { x: 4970, w: 180 },
    { x: 13350, w: 150 },
    { x: 14100, w: 160 },
  ];

  // --- 崖 ---
  // 区間 B: 崖の階段(90 ずつ 3 段で上り、降りる)
  const stairsB = [
    cliff(2600, 260, 90),
    cliff(2860, 260, 180),
    cliff(3120, 260, 270),
    cliff(3380, 200, 180),
    cliff(3580, 200, 90),
  ];
  // 区間 D: 浮島の塔のてっぺんの柱(高所の足場。上に乗れる)
  const pillar = cliff(7660, 400, 880);
  // 区間 F: 崖の階段(100 ずつ 5 段)、尾根、降り
  const stairsF = [0, 1, 2, 3, 4].map((k) => cliff(11200 + k * 240, 240, 100 * (k + 1)));
  const ridge = cliff(12400, 300, 500);
  const descentF = [cliff(12700, 240, 250), cliff(12940, 240, 100)];
  // 区間 G: 低い崖
  const lowCliffG = cliff(13800, 200, 100);

  // --- 浮島 ---
  // 区間 D: 浮島の塔(110 ずつ 8 枚、約 880 登る)
  const towerD = chain(6000, [110, 220, 330, 440, 550, 660, 770, 880], 160, 40);
  // 区間 E: 高所の浮島の回廊
  const corridorE = chain(8700, [110, 220, 330, 440, 550, 650, 550, 450], ISLAND_WIDTH, 100);
  // 区間 G: 浮島の連なり
  const chainG = chain(14500, [110, 220, 330, 220], 160, 100);

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
  const ground = (x: number): RouteNode => {
    const s = slabAt(x);
    return { kind: 'ground', x0: s.x, x1: s.x + s.w, y: s.y };
  };
  const onCliff = (c: Rect): RouteNode => ({ kind: 'cliff', x0: c.x, x1: c.x + c.w, y: c.y });
  const onIsland = (i: Rect): RouteNode => ({ kind: 'island', x0: i.x, x1: i.x + i.w, y: i.y });

  // --- 経路(スタートから海の手前まで、順に立つ足場) ---
  const rawRoute: RouteNode[] = [
    ground(100),
    // B: 崖の階段
    ...stairsB.map(onCliff),
    ground(3900),
    // C: 連続する穴
    ground(4500),
    ground(4850),
    ground(5300),
    // D: 浮島の塔 → 柱 → 降りる
    ...towerD.map(onIsland),
    onCliff(pillar),
    ground(8300),
    // E: 高所の回廊 → 降りる
    ...corridorE.map(onIsland),
    ground(11100),
    // F: 崖の階段、尾根、降り、穴
    ...stairsF.map(onCliff),
    onCliff(ridge),
    ...descentF.map(onCliff),
    ground(13250),
    ground(13700),
    // G: 低い崖、穴、浮島の連なり
    onCliff(lowCliffG),
    ground(14050),
    ground(14300),
    ...chainG.map(onIsland),
    ground(15700),
  ];
  // 連続して同じ足場を指すものは 1 つにまとめる
  const route = rawRoute.filter((n, i) => {
    const prev = rawRoute[i - 1];
    return !prev || prev.kind !== n.kind || prev.x0 !== n.x0 || prev.x1 !== n.x1 || prev.y !== n.y;
  });

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
  };
}

export const STAGE: Stage = buildStage();
