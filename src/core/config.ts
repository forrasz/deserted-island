/** 物理・画面の定数。単位は px と秒。 */
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;
export const WORLD_WIDTH = 25800;
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
export const RAFT_PARTS_REQUIRED = 10;
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
export const PLAYER_MAX_HP = 5;
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

// --- ザコ敵(行動の数値。specs/enemy-catalog に対応) ---
/** ザコ敵の当たり判定の大きさ(幅・高さ)と体力。 */
export const ENEMY_SIZE = 40;
export const ENEMY_HP = 1;

/** のろのろ・ちょこまか: 往復の速さ(px/s)。 */
export const PLODDER_SPEED = 50;
export const SCURRIER_SPEED = 150;

/** ぴょんぴょん: 往復の速さ、ジャンプの間隔(秒)、ジャンプの初速(px/s、上向き)。 */
export const HOPPER_SPEED = 70;
export const HOPPER_INTERVAL = 1.2;
export const HOPPER_JUMP_SPEED = 450;

/** ねぼすけ: 突進を始める水平距離、突進の速さ、突進の時間(秒)、休む時間(秒)。 */
export const SLEEPER_TRIGGER = 220;
export const SLEEPER_DASH_SPEED = 220;
export const SLEEPER_DASH_TIME = 0.8;
export const SLEEPER_REST_TIME = 2;

/** つきまとい: 追いかける水平距離、追いかける速さ、普段の往復の速さ。 */
export const CHASER_RANGE = 320;
export const CHASER_SPEED = 110;
export const CHASER_PATROL_SPEED = 50;

/** ふわふわ: 往復の速さ、地面からの高さ(敵の下辺)、上下の揺れの振幅(px)と周期(秒)。 */
export const FLOATER_SPEED = 70;
export const FLOATER_HEIGHT = 140;
export const FLOATER_AMPLITUDE = 40;
export const FLOATER_PERIOD = 2;

/** きゅうこうか: 飛ぶ高さ(敵の下辺)、往復の速さ、急降下を始める水平距離、降下の速さ、降下の底の高さ、上昇の速さ。 */
export const SWOOPER_HEIGHT = 220;
export const SWOOPER_SPEED = 100;
export const SWOOPER_TRIGGER = 60;
export const SWOOPER_DIVE_SPEED = 600;
export const SWOOPER_DIVE_BOTTOM = 20;
export const SWOOPER_RISE_SPEED = 200;

/** はねっこ: 往復の速さ、着地で跳ね返る初速(px/s、上向き)。 */
export const BOUNCER_SPEED = 60;
export const BOUNCER_BOUNCE_SPEED = 600;

/** かくれんぼ: 往復の速さ、見えている時間と隠れている時間(秒)。 */
export const HIDER_SPEED = 60;
export const HIDER_VISIBLE_TIME = 2;
export const HIDER_HIDDEN_TIME = 1.5;

/** とっしん: 歩く速さと時間(秒)、突進の速さと時間(秒)。 */
export const CHARGER_WALK_SPEED = 40;
export const CHARGER_WALK_TIME = 2;
export const CHARGER_DASH_SPEED = 320;
export const CHARGER_DASH_TIME = 0.5;

// --- ボスの攻撃(弾・衝撃波) ---
/** 直進弾・放物線の弾の大きさ(一辺、px)。 */
export const PROJECTILE_SIZE = 24;
/** 衝撃波の大きさ(幅・高さ、px)。地面の上に立つ。 */
export const WAVE_WIDTH = 32;
export const WAVE_HEIGHT = 24;
/** 寿命(秒)。放物線の弾は地面に達したら消えるが、念のための上限も持つ。 */
export const SHOT_LIFE = 3;
export const ARC_LIFE = 5;
export const WAVE_LIFE = 2;

// --- ボスの行動(specs/boss-behaviors、final-boss に対応) ---
/** 最終ボスの変身の時間(秒)と、強化形態で時間を縮める倍率。 */
export const BOSS_TRANSFORM_TIME = 1.5;
export const BOSS_RAGE_TIME_SCALE = 0.6;

// --- ボーナスステージ(地下の広間) ---
/** 広間の大きさ。高さは画面 1 枚ぶん(縦のカメラは固定)。 */
export const BONUS_WIDTH = 2880;
export const BONUS_HEIGHT = VIEW_HEIGHT;
/** 広間の床の上面。 */
export const BONUS_GROUND_Y = BONUS_HEIGHT - 80;
/** 入場してから自動で終わるまでの時間(秒)。 */
export const BONUS_DURATION = 30;
/** 広間の右端から、この幅の中に入ると出口に着いたとみなす(px)。 */
export const BONUS_EXIT_WIDTH = 40;
/** 広間での、プレイヤーの開始位置(左辺 x)。 */
export const BONUS_START_X = 100;
/** 入場直後に案内を出す時間(秒)。 */
export const BONUS_BANNER_TIME = 2;
/** 石に当たったときの硬直の時間(秒)。 */
export const STONE_STUN_TIME = 1.5;
/** ハート・石の大きさ(px の正方形)。 */
export const BONUS_ITEM_SIZE = 28;
/** 最初の飛び出しの時刻と、その後の間隔(秒)。 */
export const BONUS_SPAWN_START = 1.0;
export const BONUS_SPAWN_INTERVAL = 0.6;
/** 飛び出しの初速(上向き、px/s)と、横の速さ(±、px/s)。重力は本編と同じ。 */
export const BONUS_LAUNCH_SPEED = 950;
export const BONUS_DRIFT_SPEED = 100;
/** 吹き出し口の x(床の上)。n 番目は n mod 6 の口から出る。 */
export const BONUS_VENTS: readonly number[] = [500, 900, 1300, 1700, 2100, 2500];
/** 飛び出すものの順番(n mod 8)。ハートは 3/8。 */
export const BONUS_KINDS: readonly ('heart' | 'stone')[] = [
  'stone',
  'heart',
  'stone',
  'stone',
  'heart',
  'stone',
  'heart',
  'stone',
];
/** 中間地点の隠し穴(地面の上の範囲)。横幅の真ん中を中心にする。 */
export const HIDDEN_HOLE_WIDTH = 120;
export const HIDDEN_HOLE_X = WORLD_WIDTH / 2 - HIDDEN_HOLE_WIDTH / 2;

// --- 最終ボス「ヌシ」の柱と気絶 ---
/** 闘技場の入口に立つ、壊せる石の柱の大きさ(px)。高さはジャンプの最高点(約 140)より高い。 */
export const FINAL_PILLAR_WIDTH = 60;
export const FINAL_PILLAR_HEIGHT = 180;
/** ヌシが柱にぶつかったあとの気絶の時間(秒)。 */
export const NUSHI_STAGGER_TIME = 6;
/** 気絶中のヌシを踏んだときの、体力の減り方。 */
export const NUSHI_STAGGER_DAMAGE = 4;
/** 気絶中に踏まれたあと、起き上がるまでの時間(秒)。その間は、かがんだまま、触れても被弾せず、踏んでもダメージを受けない。 */
export const NUSHI_RECOVER_TIME = 0.5;
/** 壊れた柱が、再び立てるようになるまでの時間(秒)。 */
export const PILLAR_REGROW_TIME = 8;
