import { THROW_ANIM_TIME, THROW_ARC_TIME, THROW_LEAN_DEG, THROW_PEAK_TIME } from './config';

/**
 * プレイヤーのアニメーション(スプライトシートのコマ)の定義と、状態からの動き・コマの選択。
 * 描画の経過時間(実時間)で進める、純粋な状態機械。ゲームの状態(Player など)は増やさず、
 * 速さ・接地・HP・無敵時間から、見た目を決める。
 */

/** 動きの名前。 */
export type ClipName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'landStill'
  | 'landRun'
  | 'hit'
  | 'knockout';

/** 動きごとの、コマ数。 */
export const CLIP_FRAME_COUNTS: Record<ClipName, number> = {
  idle: 6,
  walk: 7,
  run: 7,
  jump: 5,
  landStill: 4,
  landRun: 5,
  hit: 4,
  knockout: 4,
};
export const CLIP_NAMES = Object.keys(CLIP_FRAME_COUNTS) as ClipName[];

/** コマ。x, y, w, h はシート上の矩形。fx, fy は、矩形の中での足元の位置(足の中心の x と、足の下端の y)。 */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  fx: number;
  fy: number;
}

/** コマの一覧。referenceHeight は、待機のコマの高さ(表示の倍率の基準)。 */
export interface Atlas {
  version: number;
  referenceHeight: number;
  clips: Record<ClipName, Frame[]>;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * コマの一覧(JSON を読んだ値)を検査して、正しければ Atlas を返す。不正なら null(シートは使えない)。
 * 検査: 動きとコマ数が定義どおり・矩形がシートの範囲の中・幅と高さが正・足元が矩形の範囲の中・基準の高さが正。
 */
export function validateAtlas(json: unknown, sheetWidth: number, sheetHeight: number): Atlas | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  if (!isNum(o.version) || !isNum(o.referenceHeight) || o.referenceHeight <= 0) return null;
  const clipsIn = o.clips;
  if (typeof clipsIn !== 'object' || clipsIn === null) return null;
  const clips = {} as Record<ClipName, Frame[]>;
  for (const name of CLIP_NAMES) {
    const list = (clipsIn as Record<string, unknown>)[name];
    if (!Array.isArray(list) || list.length !== CLIP_FRAME_COUNTS[name]) return null;
    const frames: Frame[] = [];
    for (const f of list) {
      if (typeof f !== 'object' || f === null) return null;
      const fr = f as Record<string, unknown>;
      const { x, y, w, h, fx, fy } = fr;
      if (![x, y, w, h, fx, fy].every(isNum)) return null;
      const r = { x, y, w, h, fx, fy } as Frame;
      if (r.w <= 0 || r.h <= 0) return null;
      if (r.x < 0 || r.y < 0 || r.x + r.w > sheetWidth || r.y + r.h > sheetHeight) return null;
      if (r.fx < 0 || r.fx > r.w || r.fy < 0 || r.fy > r.h) return null;
      frames.push(r);
    }
    clips[name] = frames;
  }
  return { version: o.version, referenceHeight: o.referenceHeight, clips };
}

// ---- 動きの選択 ----

/** 状態から動きを決めるための入力(描画のたびに、現在の状態から作る)。 */
export interface AnimInput {
  onGround: boolean;
  vx: number;
  vy: number;
  /** HPが 0(やられ)。 */
  dead: boolean;
  /** 被弾後の残りの無敵時間(秒)。増えたとき、被弾したとみなす。 */
  hitInvuln: number;
  /** ボーナスの石で硬直している。 */
  stunned: boolean;
}

export interface AnimState {
  clip: ClipName;
  /** 表示するコマ(0 起点)。 */
  frame: number;
  /** この動きの経過時間(秒)。 */
  t: number;
  /** ループする動きの、コマの進み具合(コマ数の単位。速さに合わせて進む)。 */
  phase: number;
  /** 空中にいた時間(秒)と、地面を離れてからの時間(秒)。 */
  airT: number;
  sinceTakeoff: number;
  prevOnGround: boolean;
  prevHitInvuln: number;
  /** 被弾してからの時間(秒)。被弾していなければ Infinity。 */
  hitT: number;
  /** 着地の動き(再生中のもの)と、その経過時間。 */
  landClip: 'landStill' | 'landRun' | null;
  landT: number;
}

// 数値(spec の定義)。
export const IDLE_PERIOD = 0.15;
export const WALK_PERIOD_AT_150 = 0.12;
export const WALK_PERIOD_MIN = 0.08;
export const WALK_PERIOD_MAX = 0.2;
export const RUN_PERIOD = 0.07;
export const KNOCKOUT_PERIOD = 0.35;
/** 地上の動きの閾値(水平の速さの絶対値、px/s)。 */
export const IDLE_SPEED = 20;
export const RUN_SPEED = 200;
/** 被弾の動きの長さ(秒)と、そのコマ数(4 コマのうち、最初の 3 コマ)。 */
export const HIT_TIME = 0.5;
const HIT_FRAMES = 3;
/** 空中の段階の閾値(上下の速さ、px/s)と、踏み切りのしゃがみの時間(秒)。 */
export const JUMP_RISE_FAST = 450;
export const JUMP_RISE_SLOW = 150;
export const TAKEOFF_TIME = 0.05;
/** 着地の動きを出す、最小の空中の時間(秒)と、速さを持った着地の閾値(px/s)。 */
export const LAND_MIN_AIR = 0.2;
export const LAND_RUN_SPEED = 120;
/** 着地の動きの 1 コマの時間(秒)。 */
export const LAND_STILL_PERIOD = 0.06;
export const LAND_RUN_PERIOD = 0.05;

export function initialAnim(): AnimState {
  return {
    clip: 'idle',
    frame: 0,
    t: 0,
    phase: 0,
    airT: 0,
    sinceTakeoff: 0,
    prevOnGround: true,
    prevHitInvuln: 0,
    hitT: Number.POSITIVE_INFINITY,
    landClip: null,
    landT: 0,
  };
}

const landDuration = (c: 'landStill' | 'landRun'): number =>
  CLIP_FRAME_COUNTS[c] * (c === 'landStill' ? LAND_STILL_PERIOD : LAND_RUN_PERIOD);

/** 歩く動きの、1 コマの時間(速さが速いほど短い。0.08〜0.2 秒)。 */
export function walkPeriod(speed: number): number {
  const p = (WALK_PERIOD_AT_150 * 150) / Math.max(Math.abs(speed), 1);
  return Math.min(WALK_PERIOD_MAX, Math.max(WALK_PERIOD_MIN, p));
}

/**
 * 1 回の描画ぶん(dt 秒)、動きの状態を進める。
 * 優先順: やられ > 被弾 > 石の硬直 > 着地 > 空中(ジャンプ) > 地上(待機・歩く・走る)。
 */
export function stepAnim(s: AnimState, input: AnimInput, dt: number): AnimState {
  // 被弾の始まり: 無敵時間が、前より増えたとき
  let hitT = s.hitT;
  if (input.hitInvuln > s.prevHitInvuln + 1e-9) hitT = 0;
  else if (Number.isFinite(hitT)) hitT += dt;
  if (hitT >= HIT_TIME) hitT = Number.POSITIVE_INFINITY;

  // 空中の時間・離陸・着地
  let airT = s.airT;
  let sinceTakeoff = s.sinceTakeoff;
  let landClip = s.landClip;
  let landT = s.landT;
  if (s.prevOnGround && !input.onGround) {
    airT = 0;
    sinceTakeoff = 0;
    landClip = null;
  }
  if (!input.onGround) {
    airT += dt;
    sinceTakeoff += dt;
  }
  if (!s.prevOnGround && input.onGround) {
    if (airT >= LAND_MIN_AIR) {
      landClip = Math.abs(input.vx) < LAND_RUN_SPEED ? 'landStill' : 'landRun';
      landT = 0;
    }
    airT = 0;
  } else if (landClip) {
    landT += dt;
    if (landT >= landDuration(landClip)) landClip = null;
  }
  if (!input.onGround) landClip = null; // 着地の動きは、再び跳んだら終わる

  // 動きを決める
  let clip: ClipName;
  let fixedFrame: number | null = null;
  if (input.dead) {
    clip = 'knockout';
  } else if (Number.isFinite(hitT)) {
    clip = 'hit';
    fixedFrame = Math.min(HIT_FRAMES - 1, Math.floor(hitT / (HIT_TIME / HIT_FRAMES)));
  } else if (input.stunned) {
    clip = 'hit';
    fixedFrame = 3; // 目を回す
  } else if (landClip) {
    clip = landClip;
  } else if (!input.onGround) {
    clip = 'jump';
    const rising = input.vy < 0;
    if (sinceTakeoff < TAKEOFF_TIME && input.vy < -JUMP_RISE_FAST) fixedFrame = 0;
    else if (input.vy < -JUMP_RISE_FAST) fixedFrame = 1;
    else if (input.vy < -JUMP_RISE_SLOW) fixedFrame = 2;
    else if (rising || input.vy < JUMP_RISE_SLOW) fixedFrame = 3;
    else fixedFrame = 4;
  } else {
    const speed = Math.abs(input.vx);
    clip = speed < IDLE_SPEED ? 'idle' : speed < RUN_SPEED ? 'walk' : 'run';
  }

  // コマを進める
  const changed = clip !== s.clip;
  const t = changed ? 0 : s.t + dt;
  let phase = changed ? 0 : s.phase;
  const n = CLIP_FRAME_COUNTS[clip];
  let frame: number;
  if (fixedFrame !== null) {
    frame = fixedFrame;
  } else if (clip === 'idle') {
    phase += dt / IDLE_PERIOD;
    frame = Math.floor(phase) % n;
  } else if (clip === 'walk') {
    phase += dt / walkPeriod(input.vx);
    frame = Math.floor(phase) % n;
  } else if (clip === 'run') {
    phase += dt / RUN_PERIOD;
    frame = Math.floor(phase) % n;
  } else if (clip === 'knockout') {
    frame = Math.min(n - 1, Math.floor(t / KNOCKOUT_PERIOD));
  } else {
    // 着地: 1 回だけ
    const period = clip === 'landStill' ? LAND_STILL_PERIOD : LAND_RUN_PERIOD;
    frame = Math.min(n - 1, Math.floor(t / period));
  }

  return {
    clip,
    frame,
    t,
    phase,
    airT,
    sinceTakeoff,
    prevOnGround: input.onGround,
    prevHitInvuln: input.hitInvuln,
    hitT,
    landClip,
    landT,
  };
}

// ---- 投げる動き(既存のコマを加工して重ねる) ----

export interface ThrowPose {
  /** 体を進む向きへ傾ける角度(度。0 = 傾けない)。向きが左のときは、描画側で反転する。 */
  leanDeg: number;
  /** 横・縦の倍率。 */
  scaleX: number;
  scaleY: number;
  /** 進む向きへのずれ(px)。 */
  shift: number;
  /** 腕を振った弧の濃さ(0〜1)。 */
  arcAlpha: number;
}

export const NO_THROW_POSE: ThrowPose = { leanDeg: 0, scaleX: 1, scaleY: 1, shift: 0, arcAlpha: 0 };

const easeOut = (u: number): number => 1 - (1 - u) * (1 - u);
const smooth = (u: number): number => u * u * (3 - 2 * u);

/**
 * 投げてから t 秒の、投げる動き。0 〜 THROW_PEAK_TIME で前へ傾いて(最大 THROW_LEAN_DEG)少し低く広がり、
 * THROW_ANIM_TIME までに、なめらかに元へ戻る。t < 0 や THROW_ANIM_TIME 以降は、動きなし。弧は THROW_ARC_TIME で消える。
 */
export function throwPose(t: number): ThrowPose {
  if (t < 0 || t >= THROW_ANIM_TIME) return NO_THROW_POSE;
  // 傾き・倍率・ずれの強さ(0 → 1 → 0)
  const k = t < THROW_PEAK_TIME ? easeOut(t / THROW_PEAK_TIME) : 1 - smooth((t - THROW_PEAK_TIME) / (THROW_ANIM_TIME - THROW_PEAK_TIME));
  return {
    leanDeg: THROW_LEAN_DEG * k,
    scaleX: 1 + 0.05 * k,
    scaleY: 1 - 0.03 * k,
    shift: 4 * k,
    arcAlpha: t < THROW_ARC_TIME ? 0.7 * (1 - t / THROW_ARC_TIME) : 0,
  };
}
