import type { Rect } from './collision';

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * 画像を当たり判定の矩形に合わせた描画矩形を返す。
 * 高さを box に合わせ、縦横比を保ち、水平は box の中央、下辺は box の下辺に揃える。
 * 画像が box より広い場合は左右にはみ出す。
 */
export function fitToBox(image: ImageSize, box: Rect): Rect {
  if (image.height <= 0 || image.width <= 0) return { ...box };
  const h = box.h;
  const w = (image.width * h) / image.height;
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h - h, w, h };
}

/** -(value) を span で折り返した位置(区間 (-span, 0])。 */
function wrapNegative(value: number, span: number): number {
  if (span <= 0) return 0;
  const m = -value % span;
  return m === 0 ? 0 : m;
}

/**
 * 背景の描画開始位置(画面 x)。カメラの移動量に factor を掛けて逆方向にずらし、
 * 画像の幅で折り返す。ここから横に並べると画面を途切れなく覆える。
 */
export function parallaxOffset(cameraX: number, factor: number, imageWidth: number): number {
  return wrapNegative(cameraX * factor, imageWidth);
}

/** 地面・海のタイルの描画開始位置(画面 x)。継ぎ目はワールド座標に固定される。 */
export function tileStartX(cameraX: number, tileWidth: number): number {
  return wrapNegative(cameraX, tileWidth);
}
