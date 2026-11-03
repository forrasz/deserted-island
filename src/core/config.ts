/** 物理・画面の定数。単位は px と秒。 */
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;
export const WORLD_WIDTH = 3840;
export const GROUND_Y = 460;

export const FIXED_DT = 1 / 60;
/** 1 フレームで処理する経過時間の上限(ミリ秒)。タブ復帰時の暴走防止。 */
export const MAX_FRAME_MS = 250;

export const GRAVITY = 2000;
export const JUMP_SPEED = 750;
export const MOVE_SPEED = 280;

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
export const SEA_X = 3600;
