import type { Rect } from './collision';

/**
 * 世界の寸法と地形。solids / platforms を省略すると、
 * 「x=0 から width まで、上面が groundY の平らな地面 1 枚」として扱う(従来の世界)。
 */
export interface WorldBounds {
  width: number;
  /** 地面の上面。ボス・部品の床にも使う(平地の区間)。 */
  groundY: number;
  /** ステージの高さ。省略時は地面の上面の 80 下。 */
  height?: number;
  /** 通れない地形(崖と、穴で分割された地面)。 */
  solids?: Rect[];
  /** 浮島(上から落ちたときだけ着地できる足場)。 */
  platforms?: Rect[];
}

/** 床の判定の誤差の許容量(px)。 */
export const EPS = 0.01;
const DEFAULT_GROUND_DEPTH = 80;

export function worldHeightOf(world: WorldBounds): number {
  return world.height ?? world.groundY + DEFAULT_GROUND_DEPTH;
}

/** ステージの下端から落下ラインまでの距離(画面外へ十分に出る位置)。 */
const FALL_MARGIN = 60;

/** 落下ライン。これより下に落ちたら穴に落ちたとみなす。 */
export function fallYOf(world: WorldBounds): number {
  return worldHeightOf(world) + FALL_MARGIN;
}

export function solidsOf(world: WorldBounds): Rect[] {
  if (world.solids) return world.solids;
  return [
    { x: 0, y: world.groundY, w: world.width, h: worldHeightOf(world) - world.groundY },
  ];
}

export function platformsOf(world: WorldBounds): Rect[] {
  return world.platforms ?? [];
}

/** 水平方向に面積を持って重なるか(辺が接するだけでは重ならない)。 */
function overlapsX(x: number, w: number, r: Rect): boolean {
  return x < r.x + r.w - EPS && r.x < x + w - EPS;
}

/** 垂直方向に面積を持って重なるか(誤差 EPS 以内の接触は重ならない)。 */
function overlapsY(y: number, h: number, r: Rect): boolean {
  return y < r.y + r.h - EPS && r.y < y + h - EPS;
}

/**
 * 水平に dx だけ動いたときの x を、崖(solids)の側面で止める。
 * 右へ動いて重なったら崖の左面へ、左へ動いて重なったら右面へ押し出す。
 */
export function resolveHorizontal(
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  solids: Rect[],
): number {
  let nx = x + dx;
  if (dx === 0) return nx;
  for (const s of solids) {
    if (!overlapsY(y, h, s) || !overlapsX(nx, w, s)) continue;
    if (dx > 0) nx = Math.min(nx, s.x - w);
    else nx = Math.max(nx, s.x + s.w);
  }
  return nx;
}

export interface VerticalResult {
  y: number;
  vy: number;
  landed: boolean;
}

/**
 * 垂直方向の移動(prevY → newY)の解決。
 * 落下中は、更新前の下辺が上面以上で更新後の下辺が上面に達した solids / platforms の上面に着地する(最も高い面)。
 * 上昇中は、更新前の上辺が下面以下で更新後の上辺が下面を超えた solids の下面で頭をぶつける(浮島は通り抜ける)。
 * 更新前の位置を使うので、薄い足場も、速い落下でもすり抜けない。
 */
export function resolveVertical(
  prevY: number,
  newY: number,
  vy: number,
  x: number,
  w: number,
  h: number,
  solids: Rect[],
  platforms: Rect[],
): VerticalResult {
  if (vy > 0) {
    const prevBottom = prevY + h;
    const newBottom = newY + h;
    let landTop = Infinity;
    for (const s of [...solids, ...platforms]) {
      if (!overlapsX(x, w, s)) continue;
      if (prevBottom <= s.y + EPS && newBottom >= s.y - EPS && s.y < landTop) landTop = s.y;
    }
    if (landTop !== Infinity) return { y: landTop - h, vy: 0, landed: true };
  } else if (vy < 0) {
    const prevTop = prevY;
    const newTop = newY;
    let bonkBottom = -Infinity;
    for (const s of solids) {
      if (!overlapsX(x, w, s)) continue;
      const bottom = s.y + s.h;
      if (prevTop >= bottom - EPS && newTop < bottom && bottom > bonkBottom) bonkBottom = bottom;
    }
    if (bonkBottom !== -Infinity) return { y: bonkBottom, vy: 0, landed: false };
  }
  return { y: newY, vy, landed: false };
}

/**
 * プレイヤー(x, y, w, h)の足元の幅全体が、1 つの足場(solids / platforms)の上面に支えられているか。
 * 穴や足場の縁(一部しか支えられていない)では false。
 */
export function isFullySupported(
  x: number,
  y: number,
  w: number,
  h: number,
  solids: Rect[],
  platforms: Rect[],
): boolean {
  const bottom = y + h;
  for (const s of [...solids, ...platforms]) {
    if (Math.abs(s.y - bottom) > 0.5) continue;
    if (s.x <= x + EPS && s.x + s.w >= x + w - EPS) return true;
  }
  return false;
}
