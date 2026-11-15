import type { Rect } from './collision';
import { overlaps } from './collision';
import {
  COCONUT_RESPAWN_TIME,
  PALM_CANOPY_HALF,
  PALM_CANOPY_HIGH,
  PALM_CANOPY_LOW,
  PALM_TRUNK_WIDTH,
} from './config';

/** ステージのヤシの木。x は幹の中心。実がなっていれば ready、落としたあとは regrowT 秒で再びなる。 */
export interface PalmTree {
  x: number;
  ready: boolean;
  /** 実を落としてからの経過時間(秒)。 */
  regrowT: number;
}

export function createPalm(x: number): PalmTree {
  return { x, ready: true, regrowT: 0 };
}

/** 梢の矩形(頭突きの範囲)。幹の中心から左右 PALM_CANOPY_HALF、地面から PALM_CANOPY_LOW〜PALM_CANOPY_HIGH。 */
export function canopyRect(p: PalmTree, groundY: number): Rect {
  return {
    x: p.x - PALM_CANOPY_HALF,
    y: groundY - PALM_CANOPY_HIGH,
    w: PALM_CANOPY_HALF * 2,
    h: PALM_CANOPY_HIGH - PALM_CANOPY_LOW,
  };
}

/** 幹の矩形(配置の検査・表示に使う。プレイヤーの移動は止めない)。 */
export function trunkRect(p: PalmTree, groundY: number): Rect {
  return { x: p.x - PALM_TRUNK_WIDTH / 2, y: groundY - PALM_CANOPY_LOW, w: PALM_TRUNK_WIDTH, h: PALM_CANOPY_LOW };
}

/**
 * ヤシの木を 1 ステップ進める。プレイヤーが上昇しながら(vy < 0)梢に重なったとき、実がなっていれば、
 * 実を 1 個落とす(梢の真下の位置を返す)。落としたあとは COCONUT_RESPAWN_TIME 秒で、再びなる。
 */
export function stepPalms(
  palms: readonly PalmTree[],
  player: Rect,
  vy: number,
  groundY: number,
  dt: number,
): { palms: PalmTree[]; drops: { x: number; y: number }[] } {
  const drops: { x: number; y: number }[] = [];
  const next = palms.map((p) => {
    if (p.ready) {
      if (vy < 0 && overlaps(player, canopyRect(p, groundY))) {
        drops.push({ x: p.x, y: groundY - PALM_CANOPY_LOW });
        return { ...p, ready: false, regrowT: 0 };
      }
      return p;
    }
    const regrowT = p.regrowT + dt;
    return regrowT >= COCONUT_RESPAWN_TIME - 1e-9 ? { ...p, ready: true, regrowT: 0 } : { ...p, regrowT };
  });
  return { palms: next, drops };
}
