/** 軸平行の矩形。x, y は左上(ワールド座標)。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 2 つの矩形が面積を持って重なるか(辺が接するだけでは重ならない)。 */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 重なりの大きさ(各軸の侵入量)。重なっていなければ null。 */
export function overlapAmount(a: Rect, b: Rect): { x: number; y: number } | null {
  if (!overlaps(a, b)) return null;
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { x, y };
}
