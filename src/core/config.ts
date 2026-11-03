/** 物理・画面の定数。単位は px と秒。 */
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;
export const WORLD_WIDTH = 16800;
/** ステージの高さ(画面の高さの 3 倍)。 */
export const WORLD_HEIGHT = 1620;
/** 地面の上面(ステージの下端から 80 上)。ボスと部品の床にも使う。 */
export const GROUND_Y = WORLD_HEIGHT - 80;
/** これより下へ落ちたら落下(穴に落ちた)とみなす。ステージの下端から画面外へ十分に出た位置。 */
export const FALL_Y = WORLD_HEIGHT + 60;

export const FIXED_DT = 1 / 60;
/** 1 フレームで処理する経過時間の上限(ミリ秒)。タブ復帰時の暴走防止。 */
export const MAX_FRAME_MS = 250;

export const GRAVITY = 2000;
export const JUMP_SPEED = 750;
export const MOVE_SPEED = 280;
/** 落下速度の上限(px/s)。高い所から落ちても足場をすり抜けないようにする。 */
export const MAX_FALL_SPEED = 1500;

export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 56;

// --- ボス「カクレモモジリ」 ---
export const BOSS_WIDTH = 80;
export const BOSS_HEIGHT = 100;
export const BOSS_MAX_HP = 3;
export const BOSS_SPEED = 80;
/** 被弾後の無敵時間(秒)。 */
export const BOSS_INVULN_TIME = 0.5;
export const BOSS_START_X = 1800;
export const BOSS_PATROL_LEFT = 1600;
export const BOSS_PATROL_RIGHT = 2000;

// --- 踏みつけ ---
/** 踏みつけ成功時のプレイヤーの跳ね返り初速(px/s、上向き)。 */
export const STOMP_BOUNCE_SPEED = 600;
/** 更新前のプレイヤー下辺がボス上辺からこの距離まで下にあっても踏みつけとみなす(px)。 */
export const STOMP_TOLERANCE = 8;

// --- イカダの部品 ---
export const PART_WIDTH = 24;
export const PART_HEIGHT = 24;

// --- イカダ・海・脱出 ---
/** イカダの完成に必要な部品の数。 */
export const RAFT_PARTS_REQUIRED = 1;
/** 海の開始位置(ワールド x)。これより右が海で、イカダ完成前は入れない。 */
export const SEA_X = WORLD_WIDTH - 240;

// --- 画像素材の描画 ---
/** 背景の視差。カメラの移動量に対する背景の移動量の割合。 */
export const PARALLAX_FACTOR = 0.2;
/** 完成したイカダの画像の描画枠(px)。右端は海の開始位置の手前 RAFT_SPRITE_MARGIN。 */
export const RAFT_SPRITE_WIDTH = 160;
export const RAFT_SPRITE_HEIGHT = 48;
export const RAFT_SPRITE_MARGIN = 20;

// --- プレイヤーのHP・被弾 ---
export const PLAYER_MAX_HP = 3;
/** 被弾後の無敵時間(秒)。 */
export const PLAYER_INVULN_TIME = 2;
/** 被弾したときの跳ね上がりの初速(px/s、上向き)。 */
export const HIT_BOUNCE_SPEED = 350;
/** 無敵中の点滅の切り替え間隔(秒)。 */
export const BLINK_PERIOD = 0.1;
/** 穴から復帰した直後に、操作を受け付けない時間(秒)。キーを押し続けていても、すぐ再び落ちないようにする。 */
export const RESPAWN_LOCK_TIME = 0.4;

// --- ステージの到達可能性の制約 ---
/** 穴の幅の上限(px)。ジャンプの水平距離(約 210)に余裕を見た値。 */
export const MAX_PIT_WIDTH = 180;
/** 上りの高さ差の上限(px)。ジャンプの高さ(約 140)に余裕を見た値。 */
export const MAX_RISE = 110;
/** この高さ差を超える上りの足場への、水平の隙間の上限を厳しくする境目(px)。 */
export const HIGH_RISE = 60;
/** 高さ差が HIGH_RISE を超える足場への水平の隙間の上限(px)。 */
export const MAX_GAP_HIGH = 120;
/** 歩ける面の頭上に必要な空間(px)。プレイヤーの身長 56 にジャンプの余裕を加えた値。 */
export const HEADROOM = 100;
