/** 画像素材のキー。素材は利用者が public/assets/ に置く PNG。 */
export const ASSET_KEYS = [
  'player',
  'boss',
  'part',
  'raft',
  'background',
  'ground',
  'sea',
] as const;

export type AssetKey = (typeof ASSET_KEYS)[number];

/** 各素材のファイル名(public/assets/ からの相対パス)。 */
export const ASSET_FILES: Record<AssetKey, string> = {
  player: 'player.png',
  boss: 'boss.png',
  part: 'part.png',
  raft: 'raft.png',
  background: 'background.png',
  ground: 'ground.png',
  sea: 'sea.png',
};

/** 素材の読み込みを待つ時間の上限(ミリ秒)。超えた素材は失敗として扱う。 */
export const ASSET_LOAD_TIMEOUT_MS = 5000;
