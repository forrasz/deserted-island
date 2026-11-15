import { ASSET_FILES, ASSET_KEYS, ASSET_LOAD_TIMEOUT_MS, PLAYER_SHEET_JSON, PLAYER_SHEET_PNG, type AssetKey } from '../core/assets';
import { validateAtlas, type Atlas } from '../core/player-anim';

/** 読み込みに成功した画像、または null(ない・壊れている・時間切れ)。 */
export interface AssetStore {
  get(key: AssetKey): HTMLImageElement | null;
  /** プレイヤーのスプライトシート(画像と、検証済みのコマの一覧)。使えなければ null。 */
  playerSheet: PlayerSheet | null;
}

export interface PlayerSheet {
  image: HTMLImageElement;
  atlas: Atlas;
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

/** コマの一覧(JSON)を読み込む。失敗・時間切れ・JSON でない場合は null。 */
async function loadJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * プレイヤーのスプライトシート(PNG)とコマの一覧(JSON)を読み込み、一覧を検証する。
 * どれかが失敗・時間切れ・不正なら null(描画側が、従来の描画へフォールバックする)。
 */
export async function loadPlayerSheet(baseUrl: string, timeoutMs: number): Promise<PlayerSheet | null> {
  const [image, json] = await Promise.all([
    loadImage(`${baseUrl}assets/${PLAYER_SHEET_PNG}`, timeoutMs),
    loadJson(`${baseUrl}assets/${PLAYER_SHEET_JSON}`, timeoutMs),
  ]);
  if (!image || json === null) return null;
  const atlas = validateAtlas(json, image.naturalWidth, image.naturalHeight);
  return atlas ? { image, atlas } : null;
}

/**
 * すべての素材の読み込みを試み、成功・失敗・時間切れのいずれかの結果が出てから返す。
 * 読み込めなかった素材は null になり、描画側が図形にフォールバックする。
 */
export async function loadAssets(
  baseUrl: string = import.meta.env.BASE_URL,
  timeoutMs: number = ASSET_LOAD_TIMEOUT_MS,
): Promise<AssetStore> {
  const [entries, playerSheet] = await Promise.all([
    Promise.all(
      ASSET_KEYS.map(async (key) => {
        const img = await loadImage(`${baseUrl}assets/${ASSET_FILES[key]}`, timeoutMs);
        return [key, img] as const;
      }),
    ),
    loadPlayerSheet(baseUrl, timeoutMs),
  ]);
  const map = new Map<AssetKey, HTMLImageElement | null>(entries);
  return { get: (key) => map.get(key) ?? null, playerSheet };
}
