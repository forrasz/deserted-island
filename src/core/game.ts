import { bossRect, createBoss, damageBoss, stepBoss, type Boss } from './boss';
import { overlapAmount, overlaps } from './collision';
import { isStomp, playerRect } from './contact';
import { createEnemy, stepEnemy, type Enemy } from './enemy';
import { resolveEnemyContact } from './enemy-contact';
import {
  BOSS_HEIGHT,
  BOSS_WIDTH,
  FIXED_DT,
  PART_HEIGHT,
  PART_WIDTH,
  HIT_BOUNCE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_INVULN_TIME,
  PLAYER_MAX_HP,
  PLAYER_WIDTH,
  RAFT_PARTS_REQUIRED,
  RESPAWN_LOCK_TIME,
  SEA_X,
  STOMP_BOUNCE_SPEED,
} from './config';
import { NO_INPUT, type InputState } from './input';
import {
  createPlayer,
  DEFAULT_WORLD,
  stepPlayer,
  type Player,
  type WorldBounds,
} from './player';
import { createPart, partRect, stepPart, type RaftPart } from './raft-part';
import { STAGE, type Stage } from './stage';
import { fallYOf, isFullySupported, platformsOf, solidsOf } from './terrain';

export interface GameState {
  player: Player;
  /** ボス(10 体)。順序はステージの闘技場の順。 */
  bosses: Boss[];
  /** ザコ敵(倒された敵も `alive: false` で残る)。 */
  enemies: Enemy[];
  parts: RaftPart[];
  /** 拾得したイカダの部品の数。 */
  partsCollected: number;
  /** 必要数の部品をそろえてイカダが完成したか。一度 true になれば保たれる。 */
  raftComplete: boolean;
  /** イカダで海へ到達し、脱出に成功したか。 */
  escaped: boolean;
  /** プレイヤーのHP。0 を下回らない。 */
  hp: number;
  /** 被弾後の残りの無敵時間(秒)。0 なら被弾しうる。 */
  hitInvuln: number;
  /** HPが 0 になって死亡したか。 */
  dead: boolean;
  /** 穴に落ちたときの復帰位置(足元の幅全体が足場に支えられていた直近の位置)。 */
  respawn: { x: number; y: number };
  /** 復帰直後の、操作を受け付けない残り時間(秒)。 */
  respawnLock: number;
}

/**
 * 初期状態。ボスとザコ敵は、ステージの配置(placements)から作る。
 * 既定はゲームのステージ。テストでは、敵なしのステージなどを渡せる。
 */
export function createGame(
  world: WorldBounds = DEFAULT_WORLD,
  placements: Pick<Stage, 'bosses' | 'enemies'> = STAGE,
): GameState {
  const player = createPlayer(100, world);
  return {
    player,
    bosses: placements.bosses.map((b) =>
      createBoss(b.x, b.left, b.right, world.groundY, b.def),
    ),
    enemies: placements.enemies.map((e, i) =>
      createEnemy(e.kind, e.x, e.left, e.right, world.groundY, i),
    ),
    parts: [],
    partsCollected: 0,
    raftComplete: false,
    escaped: false,
    hp: PLAYER_MAX_HP,
    hitInvuln: 0,
    dead: false,
    respawn: { x: player.x, y: player.y },
    respawnLock: 0,
  };
}

/**
 * プレイヤーとボスの衝突解決。
 * 落下中かつ更新前の下辺がボス上辺付近なら踏みつけ(ボスにダメージ + 跳ね返り。プレイヤーは被弾しない)、
 * それ以外の重なりは水平方向へ押し戻し、プレイヤーが無敵でなければ被弾(hit)として小さく跳ね上げる。
 * 無敵中は押し戻しだけ行い、ボスはすり抜けられない。
 */
function resolveBossContact(
  prevPlayer: Player,
  player: Player,
  boss: Boss,
  world: WorldBounds,
  invulnerable: boolean,
): { player: Player; boss: Boss; hit: boolean } {
  if (!boss.alive) return { player, boss, hit: false };
  const amount = overlapAmount(playerRect(player), bossRect(boss));
  if (!amount) return { player, boss, hit: false };

  if (isStomp(prevPlayer.y, player.vy, boss.y)) {
    return {
      player: {
        ...player,
        y: boss.y - PLAYER_HEIGHT,
        vy: -STOMP_BOUNCE_SPEED,
        onGround: false,
      },
      boss: damageBoss(boss),
      hit: false,
    };
  }

  const playerCenter = player.x + PLAYER_WIDTH / 2;
  const bossCenter = boss.x + BOSS_WIDTH / 2;
  const pushed = playerCenter < bossCenter ? player.x - amount.x : player.x + amount.x;
  const x = Math.min(Math.max(pushed, 0), world.width - PLAYER_WIDTH);
  const pushedPlayer = { ...player, x };
  if (invulnerable) return { player: pushedPlayer, boss, hit: false };
  return {
    player: { ...pushedPlayer, vy: -HIT_BOUNCE_SPEED, onGround: false },
    boss,
    hit: true,
  };
}

/**
 * 1 回の固定ステップ分、ゲーム全体を更新する。
 * 順序: プレイヤー → ボス・ザコ敵 → 衝突解決(ボス → ザコ敵。被弾・無敵) → ドロップ → 部品の落下 → 拾得 → イカダ・海・脱出
 */
export function stepGame(
  state: GameState,
  input: InputState,
  dt: number = FIXED_DT,
  world: WorldBounds = DEFAULT_WORLD,
): GameState {
  let prevPlayer = state.player;
  // 復帰直後は、短い間だけ操作を受け付けない(押し続けたキーで、すぐ再び穴へ落ちないように)
  const locked = state.respawnLock > 0;
  let movedPlayer = stepPlayer(prevPlayer, locked ? NO_INPUT : input, dt, world);

  // 穴への落下: HP を 1 減らし、直前の安全な足場へ戻す(無敵中でも被弾になる)
  const fell = movedPlayer.y > fallYOf(world);
  let respawn = state.respawn;
  const respawnLock = fell ? RESPAWN_LOCK_TIME : Math.max(0, state.respawnLock - dt);
  if (fell) {
    movedPlayer = { x: respawn.x, y: respawn.y, vx: 0, vy: 0, onGround: true };
    prevPlayer = movedPlayer;
  } else if (
    movedPlayer.onGround &&
    isFullySupported(
      movedPlayer.x,
      movedPlayer.y,
      PLAYER_WIDTH,
      PLAYER_HEIGHT,
      solidsOf(world),
      platformsOf(world),
    )
  ) {
    // 足元の幅全体が支えられている位置だけを、復帰用に記録する(縁・空中では更新しない)
    respawn = { x: movedPlayer.x, y: movedPlayer.y };
  }

  // ボス(各体の往復・無敵時間)とザコ敵(各体の行動。プレイヤーの位置に反応する敵がいる)
  const movedBosses = state.bosses.map((b) => stepBoss(b, dt));
  const ctx = { playerX: movedPlayer.x + PLAYER_WIDTH / 2, playerY: movedPlayer.y, groundY: world.groundY };
  const movedEnemies = state.enemies.map((e) => stepEnemy(e, ctx, dt));

  // 無敵時間は更新の冒頭で減らす(被弾した更新では PLAYER_INVULN_TIME のまま、次の更新から減る)
  const invulnLeft = fell ? PLAYER_INVULN_TIME : Math.max(0, state.hitInvuln - dt);
  const invulnerable = invulnLeft > 0;

  // ボスとの衝突(各体に順に適用)→ ザコ敵との衝突。被弾は 1 更新に 1 回
  let player = movedPlayer;
  let bossHit = false;
  const bosses = movedBosses.map((b) => {
    const r = resolveBossContact(prevPlayer, player, b, world, invulnerable);
    player = r.player;
    bossHit = bossHit || r.hit;
    return r.boss;
  });
  const enemyResult = resolveEnemyContact(prevPlayer, player, movedEnemies, invulnerable);
  player = enemyResult.player;
  const enemies = enemyResult.enemies;
  const hit = bossHit || enemyResult.hit;

  const hp = Math.max(0, state.hp - (fell ? 1 : 0) - (hit ? 1 : 0));
  const hitInvuln = hit ? PLAYER_INVULN_TIME : invulnLeft;

  // 撃破された更新でのみ、そのボスの中央に部品を 1 個ドロップする(ボス 1 体につき 1 個)
  let parts = state.parts;
  bosses.forEach((boss, i) => {
    if (state.bosses[i]!.alive && !boss.alive) {
      parts = [
        ...parts,
        createPart(
          boss.x + BOSS_WIDTH / 2 - PART_WIDTH / 2,
          boss.y + BOSS_HEIGHT / 2 - PART_HEIGHT / 2,
        ),
      ];
    }
  });

  parts = parts.map((p) => stepPart(p, dt, world.groundY));

  // 拾得(落下中でも可)
  const pr = playerRect(player);
  const remaining = parts.filter((p) => !overlaps(pr, partRect(p)));
  const partsCollected = state.partsCollected + (parts.length - remaining.length);

  // イカダの完成(部品は減らないので、一度完成すれば保たれる)
  const raftComplete = partsCollected >= RAFT_PARTS_REQUIRED;

  // 海: イカダ完成後は到達で脱出、未完成の間は入れない
  let escaped = state.escaped;
  let finalPlayer = player;
  if (raftComplete) {
    if (player.x + PLAYER_WIDTH >= SEA_X) escaped = true;
  } else if (player.x + PLAYER_WIDTH > SEA_X) {
    finalPlayer = { ...player, x: SEA_X - PLAYER_WIDTH };
  }

  return {
    player: finalPlayer,
    bosses,
    enemies,
    parts: remaining,
    partsCollected,
    raftComplete,
    escaped,
    hp,
    hitInvuln,
    dead: hp <= 0,
    respawn,
    respawnLock,
  };
}
