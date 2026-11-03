import { bossRect, createBoss, damageBoss, stepBoss, type Boss } from './boss';
import { overlapAmount, overlaps, type Rect } from './collision';
import {
  BOSS_HEIGHT,
  BOSS_WIDTH,
  FIXED_DT,
  PART_HEIGHT,
  PART_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RAFT_PARTS_REQUIRED,
  SEA_X,
  STOMP_BOUNCE_SPEED,
  STOMP_TOLERANCE,
} from './config';
import type { InputState } from './input';
import {
  createPlayer,
  DEFAULT_WORLD,
  stepPlayer,
  type Player,
  type WorldBounds,
} from './player';
import { createPart, partRect, stepPart, type RaftPart } from './raft-part';

export interface GameState {
  player: Player;
  boss: Boss;
  parts: RaftPart[];
  /** 拾得したイカダの部品の数。 */
  partsCollected: number;
  /** 必要数の部品をそろえてイカダが完成したか。一度 true になれば保たれる。 */
  raftComplete: boolean;
  /** イカダで海へ到達し、脱出に成功したか。 */
  escaped: boolean;
}

export function createGame(world: WorldBounds = DEFAULT_WORLD): GameState {
  return {
    player: createPlayer(100, world),
    boss: createBoss(undefined, undefined, undefined, world.groundY),
    parts: [],
    partsCollected: 0,
    raftComplete: false,
    escaped: false,
  };
}

function playerRect(p: Player): Rect {
  return { x: p.x, y: p.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/**
 * プレイヤーとボスの衝突解決。
 * 落下中かつ更新前の下辺がボス上辺付近なら踏みつけ(ダメージ + 跳ね返り)、
 * それ以外の重なりは水平方向へ押し戻す(ダメージなし)。
 */
function resolveBossContact(
  prevPlayer: Player,
  player: Player,
  boss: Boss,
  world: WorldBounds,
): { player: Player; boss: Boss } {
  if (!boss.alive) return { player, boss };
  const amount = overlapAmount(playerRect(player), bossRect(boss));
  if (!amount) return { player, boss };

  const prevBottom = prevPlayer.y + PLAYER_HEIGHT;
  const isStomp = player.vy > 0 && prevBottom <= boss.y + STOMP_TOLERANCE;

  if (isStomp) {
    return {
      player: {
        ...player,
        y: boss.y - PLAYER_HEIGHT,
        vy: -STOMP_BOUNCE_SPEED,
        onGround: false,
      },
      boss: damageBoss(boss),
    };
  }

  const playerCenter = player.x + PLAYER_WIDTH / 2;
  const bossCenter = boss.x + BOSS_WIDTH / 2;
  const pushed = playerCenter < bossCenter ? player.x - amount.x : player.x + amount.x;
  const x = Math.min(Math.max(pushed, 0), world.width - PLAYER_WIDTH);
  return { player: { ...player, x }, boss };
}

/**
 * 1 回の固定ステップ分、ゲーム全体を更新する。
 * 順序: プレイヤー → ボス → 衝突解決 → ドロップ → 部品の落下 → 拾得 → イカダ・海・脱出
 */
export function stepGame(
  state: GameState,
  input: InputState,
  dt: number = FIXED_DT,
  world: WorldBounds = DEFAULT_WORLD,
): GameState {
  const prevPlayer = state.player;
  const movedPlayer = stepPlayer(prevPlayer, input, dt, world);
  const movedBoss = stepBoss(state.boss, dt);

  const resolved = resolveBossContact(prevPlayer, movedPlayer, movedBoss, world);
  const player = resolved.player;
  const boss = resolved.boss;

  // 撃破された更新でのみ、ボス中央に部品を 1 個ドロップする
  let parts = state.parts;
  if (state.boss.alive && !boss.alive) {
    parts = [
      ...parts,
      createPart(
        boss.x + BOSS_WIDTH / 2 - PART_WIDTH / 2,
        boss.y + BOSS_HEIGHT / 2 - PART_HEIGHT / 2,
      ),
    ];
  }

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

  return { player: finalPlayer, boss, parts: remaining, partsCollected, raftComplete, escaped };
}
