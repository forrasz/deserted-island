import { ASSET_FILES, ASSET_KEYS, ASSET_LOAD_TIMEOUT_MS, type AssetKey } from '../core/assets';

/** 読み込みに成功した画像、または null(ない・壊れている・時間切れ)。 */
export interface AssetStore {
  get(key: AssetKey): HTMLImageElement | null;
}

function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(null);
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * すべての素材の読み込みを試み、成功・失敗・時間切れのいずれかの結果が出てから返す。
 * 読み込めなかった素材は null になり、描画側が図形にフォールバックする。
 */
export async function loadAssets(
  baseUrl: string = import.meta.env.BASE_URL,
  timeoutMs: number = ASSET_LOAD_TIMEOUT_MS,
): Promise<AssetStore> {
  const entries = await Promise.all(
    ASSET_KEYS.map(async (key) => {
      const img = await loadImage(`${baseUrl}assets/${ASSET_FILES[key]}`, timeoutMs);
      return [key, img] as const;
    }),
  );
  const map = new Map<AssetKey, HTMLImageElement | null>(entries);
  return { get: (key) => map.get(key) ?? null };
}
