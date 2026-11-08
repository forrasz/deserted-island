import {
  BOSS_HEIGHT,
  BOSS_INVULN_TIME,
  BOSS_MAX_HP,
  BOSS_PATROL_LEFT,
  BOSS_PATROL_RIGHT,
  NUSHI_DYING_TIME,
  BOSS_SPEED,
  BOSS_START_X,
  BOSS_WIDTH,
  FIXED_DT,
  GROUND_Y,
} from './config';
import { BOSS_SCRIPTS, bossFlags, NUSHI_FORM1, NUSHI_FORM2, PATROL_ONLY, type BossStep } from './boss-scripts';

/** ボスの種類(個性)。 */
export type BossKind =
  | 'momojiri'
  | 'tobihane'
  | 'oogui'
  | 'tamafuki'
  | 'naminori'
  | 'futago'
  | 'ukiuki'
  | 'kororin'
  | 'jishin'
  | 'nushi';

/** ボスごとの定義(種類・名前・大きさ・体力・往復の速さ・往復範囲の幅)。位置は配置(ステージ)で決める。 */
export interface BossDef {
  id: number;
  kind: BossKind;
  name: string;
  maxHp: number;
  /** 往復の速さ(px/s)。 */
  speed: number;
  /** 往復範囲の幅(px)。 */
  rangeWidth: number;
  /** 当たり判定の大きさ(通常 80×100、最終ボスだけ 200×250)。 */
  w: number;
  h: number;
  /** 図形で描くときの色。 */
  color: string;
  /** 行動の流れ(省略時は往復だけ)。 */
  script?: BossStep[];
  /** 強化形態の行動の流れ(最終ボスだけ)。 */
  script2?: BossStep[];
  /** 気絶している間に身をかがめたときの高さ(最終ボスだけ。ジャンプで踏める高さにする)。 */
  restH?: number;
}

/** 既定のボス(従来の 1 体。往復するだけ)の定義。 */
export const DEFAULT_BOSS_DEF: BossDef = {
  id: 0,
  kind: 'momojiri',
  name: 'カクレモモジリ',
  maxHp: BOSS_MAX_HP,
  speed: BOSS_SPEED,
  rangeWidth: BOSS_PATROL_RIGHT - BOSS_PATROL_LEFT,
  w: BOSS_WIDTH,
  h: BOSS_HEIGHT,
  color: '#2e8b57',
};

/** 最終ボスの大きさ(通常の約 2.5 倍)と体力。 */
export const FINAL_BOSS_WIDTH = 200;
export const FINAL_BOSS_HEIGHT = 250;
export const FINAL_BOSS_HP = 12;
/** 最終ボスが気絶している間に身をかがめたときの高さ。ジャンプの最高点(約 140)より低く、踏める。 */
export const FINAL_BOSS_REST_HEIGHT = 100;

/**
 * ボス 10 体の定義。先に進むほど強い(体力が多く、速く、往復範囲が広い)。
 * 1〜9 体目は体力 3〜5、10 体目(最終ボス「ヌシ」)は体力 12・大型。速さは 80〜140。
 */
export const BOSS_DEFS: BossDef[] = [
  { id: 0, kind: 'momojiri', script: BOSS_SCRIPTS.momojiri, name: 'カクレモモジリ', maxHp: 3, speed: 80, rangeWidth: 400, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#2e8b57' },
  { id: 1, kind: 'tobihane', script: BOSS_SCRIPTS.tobihane, name: 'トビハネ', maxHp: 3, speed: 87, rangeWidth: 410, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#00897b' },
  { id: 2, kind: 'oogui', script: BOSS_SCRIPTS.oogui, name: 'オオグイ', maxHp: 3, speed: 94, rangeWidth: 420, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#6d4c41' },
  { id: 3, kind: 'tamafuki', script: BOSS_SCRIPTS.tamafuki, name: 'タマフキ', maxHp: 4, speed: 100, rangeWidth: 430, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#1565c0' },
  { id: 4, kind: 'naminori', script: BOSS_SCRIPTS.naminori, name: 'ナミノリ', maxHp: 4, speed: 107, rangeWidth: 440, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#00838f' },
  { id: 5, kind: 'futago', script: BOSS_SCRIPTS.futago, name: 'フタゴ', maxHp: 4, speed: 114, rangeWidth: 450, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#7b1fa2' },
  { id: 6, kind: 'ukiuki', script: BOSS_SCRIPTS.ukiuki, name: 'ウキウキ', maxHp: 4, speed: 120, rangeWidth: 460, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#ff7043' },
  { id: 7, kind: 'kororin', script: BOSS_SCRIPTS.kororin, name: 'コロリン', maxHp: 5, speed: 127, rangeWidth: 470, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#558b2f' },
  { id: 8, kind: 'jishin', script: BOSS_SCRIPTS.jishin, name: 'ジシン', maxHp: 5, speed: 134, rangeWidth: 490, w: BOSS_WIDTH, h: BOSS_HEIGHT, color: '#455a64' },
  { id: 9, kind: 'nushi', script: NUSHI_FORM1, script2: NUSHI_FORM2, restH: FINAL_BOSS_REST_HEIGHT, name: 'ヌシ', maxHp: FINAL_BOSS_HP, speed: 140, rangeWidth: 300, w: FINAL_BOSS_WIDTH, h: FINAL_BOSS_HEIGHT, color: '#b71c1c' },
];

/** x, y はボス矩形の左上(ワールド座標)。left/right は x(左辺)が取りうる往復範囲。 */
export interface Boss {
  id: number;
  kind: BossKind;
  name: string;
  /** 当たり判定の大きさ。 */
  w: number;
  h: number;
  /** 図形で描くときの色。 */
  color: string;
  /** 最大体力(`hp` の初期値)。体力バーの表示に使う。 */
  maxHp: number;
  /** 往復の速さ(px/s)。 */
  speed: number;
  x: number;
  y: number;
  vx: number;
  hp: number;
  /** 残りの無敵時間(秒)。0 なら被弾可能。 */
  invuln: number;
  alive: boolean;
  left: number;
  right: number;
  /** 向き(右 = 1、左 = -1)。 */
  dir: 1 | -1;
  /** 垂直方向の速度(ジャンプ・降下で使う)。 */
  vy: number;
  /** 行動の流れ(通常形態)と、強化形態の流れ(最終ボスだけ)。 */
  script: BossStep[];
  script2?: BossStep[];
  /** 気絶している間に身をかがめたときの高さ(省略時はかがまない)。 */
  restH?: number;
  /** 現在の行動の番号と、その行動の経過時間(秒)。 */
  step: number;
  t: number;
  /** 形態(1 = 通常、2 = 強化)。 */
  form: 1 | 2;
  /** 予備動作の最後のプレイヤーの方向(突進・弾の向きに使う)。 */
  aimDir: 1 | -1;
  /** 変身の残り時間(秒)。0 より大きい間は変身中。 */
  transformT: number;
  /** 変身を済ませたか(変身は 1 回だけ)。 */
  transformed: boolean;
  /** 気絶の残り時間(秒)。0 より大きい間は気絶中(最終ボスが突進で柱にぶつかったとき)。 */
  stagger: number;
  /** 撃破演出の残り時間(ゲーム内の秒)。0 より大きい間は、体力が 0 でも、まだ撃破されていない(最終ボスだけ)。 */
  dying: number;
}

export function createBoss(
  x: number = BOSS_START_X,
  left: number = BOSS_PATROL_LEFT,
  right: number = BOSS_PATROL_RIGHT,
  groundY: number = GROUND_Y,
  def: BossDef = DEFAULT_BOSS_DEF,
): Boss {
  return {
    id: def.id,
    kind: def.kind,
    name: def.name,
    w: def.w,
    h: def.h,
    color: def.color,
    maxHp: def.maxHp,
    speed: def.speed,
    x,
    y: groundY - def.h,
    vx: def.speed,
    hp: def.maxHp,
    invuln: 0,
    alive: true,
    left,
    right,
    dir: 1,
    vy: 0,
    script: def.script ?? PATROL_ONLY,
    ...(def.script2 ? { script2: def.script2 } : {}),
    ...(def.restH !== undefined ? { restH: def.restH } : {}),
    step: 0,
    t: 0,
    form: 1,
    aimDir: 1,
    transformT: 0,
    transformed: false,
    stagger: 0,
    dying: 0,
  };
}

/** 当たり判定の矩形。気絶している間に身をかがめるボス(最終ボス)は、下辺を地面に保ったまま、高さが低くなる。 */
export function bossRect(boss: Boss) {
  if (boss.restH !== undefined && bossFlags(boss).crouch) {
    return { x: boss.x, y: boss.y + boss.h - boss.restH, w: boss.w, h: boss.restH };
  }
  return { x: boss.x, y: boss.y, w: boss.w, h: boss.h };
}

/** 往復移動と無敵タイマーの更新。撃破済みなら何もしない。 */
export function stepBoss(boss: Boss, dt: number = FIXED_DT): Boss {
  if (!boss.alive) return boss;

  const invuln = Math.max(0, boss.invuln - dt);
  let x = boss.x + boss.vx * dt;
  let vx = boss.vx;
  if (x <= boss.left) {
    x = boss.left;
    vx = Math.abs(vx);
  } else if (x >= boss.right) {
    x = boss.right;
    vx = -Math.abs(vx);
  }
  return { ...boss, x, vx, invuln };
}

/** 踏みつけによるダメージ(既定 1)。無敵中・撃破済みならそのまま返す。体力 0 で撃破。 */
export function damageBoss(boss: Boss, amount = 1): Boss {
  if (!boss.alive || boss.invuln > 0) return boss;
  const hp = Math.max(0, boss.hp - amount);
  // 最終ボスは、体力が 0 になってもすぐには撃破されず、撃破演出に入る
  if (hp <= 0 && boss.kind === 'nushi') {
    return { ...boss, hp: 0, invuln: BOSS_INVULN_TIME, alive: true, stagger: 0, dying: NUSHI_DYING_TIME };
  }
  return { ...boss, hp, invuln: BOSS_INVULN_TIME, alive: hp > 0 };
}
