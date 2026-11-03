import type { Rect } from './collision';
import { overlaps } from './collision';
import { playerRect } from './contact';
import {
  ARC_LIFE,
  FIXED_DT,
  GRAVITY,
  HIT_BOUNCE_SPEED,
  PROJECTILE_SIZE,
  SHOT_LIFE,
  WAVE_HEIGHT,
  WAVE_LIFE,
  WAVE_WIDTH,
} from './config';
import type { Player } from './player';

/** 直進弾 / 放物線の弾 / 地面を走る衝撃波。 */
export type ProjectileKind = 'shot' | 'arc' | 'wave';

/** x, y は左上(ワールド座標)。life は残りの寿命(秒)。 */
export interface Projectile {
  kind: ProjectileKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  life: number;
  alive: boolean;
}

/** 消滅の判定に使う、世界の寸法。 */
export interface ProjectileWorld {
  width: number;
  groundY: number;
}

/** 直進弾。top は弾の上端の y(高さの違う弾を作るために指定する)。 */
export function createShot(x: number, top: number, vx: number): Projectile {
  return { kind: 'shot', x, y: top, w: PROJECTILE_SIZE, h: PROJECTILE_SIZE, vx, vy: 0, life: SHOT_LIFE, alive: true };
}

/** 放物線の弾。x, y は左上、vx は水平の速さ、vy は初速(上向きが負)。 */
export function createArc(x: number, y: number, vx: number, vy: number): Projectile {
  return { kind: 'arc', x, y, w: PROJECTILE_SIZE, h: PROJECTILE_SIZE, vx, vy, life: ARC_LIFE, alive: true };
}

/** 地面を走る衝撃波。x は左端、vx は水平の速さ(右向きが正)。 */
export function createWave(x: number, groundY: number, vx: number): Projectile {
  return {
    kind: 'wave',
    x,
    y: groundY - WAVE_HEIGHT,
    w: WAVE_WIDTH,
    h: WAVE_HEIGHT,
    vx,
    vy: 0,
    life: WAVE_LIFE,
    alive: true,
  };
}

export function projectileRect(p: Projectile): Rect {
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

/**
 * 1 回の固定ステップ分、弾を動かす。寿命が尽きる・ステージの外へ出る・放物線の弾が地面に達する、のいずれかで消える。
 * 消えた弾は、更新しても変化しない。
 */
export function stepProjectile(
  p: Projectile,
  world: ProjectileWorld,
  dt: number = FIXED_DT,
): Projectile {
  if (!p.alive) return p;
  let { x, y, vy } = p;
  x += p.vx * dt;
  if (p.kind === 'arc') {
    vy += GRAVITY * dt;
    y += vy * dt;
  }
  const life = p.life - dt;
  let alive = life > 0 && x + p.w >= 0 && x <= world.width;
  if (p.kind === 'arc' && y + p.h >= world.groundY) alive = false;
  return { ...p, x, y, vy, life, alive };
}

export interface ProjectileContactResult {
  player: Player;
  projectiles: Projectile[];
  /** 被弾したか(HP を減らす更新)。 */
  hit: boolean;
}

/**
 * プレイヤーと弾・衝撃波の接触。
 * 重なったら、無敵でなければ被弾(小さく跳ね上がる)にして、その弾を消す。無敵の間は被弾せず、弾は消えずに通り抜ける。
 * 弾は踏んでも倒せない(常に接触として扱う)。
 */
export function resolveProjectileContact(
  player: Player,
  projectiles: Projectile[],
  invulnerable: boolean,
): ProjectileContactResult {
  const pr = playerRect(player);
  let hit = false;
  const next = projectiles.map((p) => {
    if (!p.alive || !overlaps(pr, projectileRect(p))) return p;
    if (invulnerable) return p;
    hit = true;
    return { ...p, alive: false };
  });
  const moved = hit ? { ...player, vy: -HIT_BOUNCE_SPEED, onGround: false } : player;
  return { player: moved, projectiles: next, hit };
}
