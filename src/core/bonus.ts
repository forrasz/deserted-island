import { overlaps, type Rect } from './collision';
import { playerRect } from './contact';
import {
  BONUS_DRIFT_SPEED,
  BONUS_DURATION,
  BONUS_EXIT_WIDTH,
  BONUS_GROUND_Y,
  BONUS_HEIGHT,
  BONUS_ITEM_SIZE,
  BONUS_KINDS,
  BONUS_LAUNCH_SPEED,
  BONUS_SPAWN_INTERVAL,
  BONUS_SPAWN_START,
  BONUS_START_X,
  BONUS_VENTS,
  BONUS_WIDTH,
  FIXED_DT,
  GRAVITY,
  HIDDEN_HOLE_WIDTH,
  HIDDEN_HOLE_X,
  HIT_BOUNCE_SPEED,
  MAX_FALL_SPEED,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  STONE_STUN_TIME,
} from './config';
import { NO_INPUT, type InputState } from './input';
import { createPlayer, stepPlayer, type Player, type WorldBounds } from './player';

const EPSILON = 1e-9;

/** 広間。平らな床だけの世界(本編と同じ移動・ジャンプがそのまま使える)。 */
export const BONUS_WORLD: WorldBounds = {
  width: BONUS_WIDTH,
  groundY: BONUS_GROUND_Y,
  height: BONUS_HEIGHT,
};

export type BonusItemKind = 'heart' | 'stone';

export interface BonusItem {
  kind: BonusItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
}

export interface BonusState {
  player: Player;
  items: BonusItem[];
  /** 入場してからの経過時間(秒)。 */
  t: number;
  /** 石に当たったあとの、残りの硬直時間(秒)。 */
  stun: number;
  /** これまでに飛び出させた数。次の飛び出しは spawned 番目。 */
  spawned: number;
  /** 入場時の本編の復帰位置。戻るときに元へ戻す。 */
  saved: { respawn: { x: number; y: number } };
}

export interface BonusSpawn {
  time: number;
  x: number;
  kind: BonusItemKind;
  vx: number;
}

/** n 番目(0 から)の飛び出し。乱数は使わず、n だけで決まる。 */
export function spawnAt(n: number): BonusSpawn {
  return {
    time: BONUS_SPAWN_START + BONUS_SPAWN_INTERVAL * n,
    x: BONUS_VENTS[n % BONUS_VENTS.length]!,
    kind: BONUS_KINDS[n % BONUS_KINDS.length]!,
    vx: n % 2 === 0 ? BONUS_DRIFT_SPEED : -BONUS_DRIFT_SPEED,
  };
}

export function itemRect(item: BonusItem): Rect {
  return { x: item.x, y: item.y, w: BONUS_ITEM_SIZE, h: BONUS_ITEM_SIZE };
}

export function createBonus(respawn: { x: number; y: number }): BonusState {
  return {
    player: createPlayer(BONUS_START_X, BONUS_WORLD),
    items: [],
    t: 0,
    stun: 0,
    spawned: 0,
    saved: { respawn },
  };
}

/** 本編のプレイヤーが、隠し穴の入場条件を満たしているか(地面に立っていて、中心が範囲の中)。 */
export function inHiddenHole(player: Player): boolean {
  const cx = player.x + PLAYER_WIDTH / 2;
  return player.onGround && cx >= HIDDEN_HOLE_X && cx < HIDDEN_HOLE_X + HIDDEN_HOLE_WIDTH;
}

/** 退場後に、地上で立つ位置(隠し穴の中央、地面の上)。 */
export function exitPlayer(world: WorldBounds): Player {
  return createPlayer(HIDDEN_HOLE_X + HIDDEN_HOLE_WIDTH / 2 - PLAYER_WIDTH / 2, world);
}

export interface BonusStep {
  bonus: BonusState;
  hp: number;
  hitInvuln: number;
  /** 時間切れまたは出口で、ボーナスが終わったか。 */
  done: boolean;
}

/**
 * ボーナスステージの 1 回の更新。
 * 順序: 時間・硬直・無敵の経過 → プレイヤー(硬直中は入力なし) → 飛び出し → アイテムの移動・消滅 → 接触 → 終了の判定
 */
export function stepBonus(
  bonus: BonusState,
  hp: number,
  hitInvuln: number,
  input: InputState,
  dt: number = FIXED_DT,
  invincible = false,
): BonusStep {
  const t = bonus.t + dt;
  const locked = bonus.stun > 0;
  let stun = Math.max(0, bonus.stun - dt);
  const invulnLeft = Math.max(0, hitInvuln - dt);
  const invulnerable = invulnLeft > 0 || invincible;

  let player = stepPlayer(bonus.player, locked ? NO_INPUT : input, dt, BONUS_WORLD);

  // 既存のアイテムを動かす(出た更新では動かさない)。床に落ちたものは消える
  const moved: BonusItem[] = [];
  for (const it of bonus.items) {
    const vy = Math.min(it.vy + GRAVITY * dt, MAX_FALL_SPEED);
    const next = { ...it, x: it.x + it.vx * dt, y: it.y + vy * dt, vy };
    if (next.y + BONUS_ITEM_SIZE >= BONUS_GROUND_Y && vy > 0) continue;
    moved.push(next);
  }
  // 飛び出し
  let spawned = bonus.spawned;
  while (spawnAt(spawned).time <= t + EPSILON) {
    const s = spawnAt(spawned);
    moved.push({
      kind: s.kind,
      x: s.x - BONUS_ITEM_SIZE / 2,
      y: BONUS_GROUND_Y - BONUS_ITEM_SIZE,
      vx: s.vx,
      vy: -BONUS_LAUNCH_SPEED,
      alive: true,
    });
    spawned++;
  }

  // 接触: ハートは回復して消える。石は無敵でなければ被弾(1 更新に 1 回)。無敵中の石は通り過ぎる
  let nextHp = hp;
  let nextInvuln = invulnLeft;
  let hit = false;
  const items: BonusItem[] = [];
  for (const it of moved) {
    if (!overlaps(playerRect(player), itemRect(it))) {
      items.push(it);
    } else if (it.kind === 'heart') {
      nextHp = Math.min(nextHp + 1, PLAYER_MAX_HP);
    } else if (invulnerable || hit) {
      items.push(it);
    } else {
      hit = true;
    }
  }
  if (hit) {
    nextHp = Math.max(0, nextHp - 1);
    nextInvuln = PLAYER_INVULN_TIME;
    stun = STONE_STUN_TIME;
    player = { ...player, vy: -HIT_BOUNCE_SPEED, onGround: false };
  }

  const atExit = player.x + PLAYER_WIDTH >= BONUS_WIDTH - BONUS_EXIT_WIDTH;
  const done = t >= BONUS_DURATION - EPSILON || atExit;
  return {
    bonus: { ...bonus, player, items, t, stun, spawned },
    hp: nextHp,
    hitInvuln: nextInvuln,
    done,
  };
}
