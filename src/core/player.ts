import {
  AIR_ACCEL_RATIO,
  COYOTE_TIME,
  FIXED_DT,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_DECEL,
  JUMP_BUFFER,
  JUMP_CUT_SPEED,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TURN_ACCEL,
} from './config';
import type { InputState } from './input';
import { STAGE } from './stage';
import {
  platformsOf,
  resolveHorizontal,
  resolveVertical,
  solidsOf,
  type WorldBounds,
} from './terrain';

export type { WorldBounds } from './terrain';

/** x, y はプレイヤー矩形の左上(ワールド座標)。 */
export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** 足場を離れてから、まだジャンプできる残り時間(秒。コヨーテタイム)。省略時は 0。 */
  coyote?: number;
  /** 着地したらジャンプするための、先行入力の残り時間(秒)。省略時は 0。 */
  jumpBuffer?: number;
}

/** 既定の世界は、地形つきのステージ。 */
export const DEFAULT_WORLD: WorldBounds = STAGE.world;

export function createPlayer(x = 100, world: WorldBounds = DEFAULT_WORLD): Player {
  return { x, y: world.groundY - PLAYER_HEIGHT, vx: 0, vy: 0, onGround: true };
}

/** v を target へ、最大 delta だけ近づける。 */
function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

/**
 * 1 回の固定ステップ分、プレイヤーを更新して新しい状態を返す。
 * 地形(崖・浮島・地面)との衝突は、水平 → 垂直の順に解決する。
 * 水平の速さ(スーパーマリオ風):
 * - 地上: 加速(GROUND_ACCEL)・減速(GROUND_DECEL)・進む向きと反対のキーでブレーキ(TURN_ACCEL)
 * - 空中: キーで加速できる(地上の 6 割)が、キーを離しても減速しない(慣性)
 * ジャンプ: 押している間は高く、離すと上向きの速さが JUMP_CUT_SPEED に打ち切られる(可変ジャンプ)。
 * 足場を離れて COYOTE_TIME 以内はジャンプでき(コヨーテタイム)、着地の JUMP_BUFFER 前までの押下は着地でジャンプする(先行入力)。
 * 地形を省略した世界は、従来と同じ平らな地面として動く。
 */
export function stepPlayer(
  player: Player,
  input: InputState,
  dt: number = FIXED_DT,
  world: WorldBounds = DEFAULT_WORLD,
): Player {
  const solids = solidsOf(world);
  const platforms = platformsOf(world);

  // 水平の速さ: 左右同時押しは、キーなしと同じ
  const grounded = player.onGround;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let wantedVx = player.vx;
  if (grounded) {
    if (dir === 0) {
      wantedVx = approach(player.vx, 0, GROUND_DECEL * dt);
    } else {
      const turning = player.vx !== 0 && Math.sign(player.vx) !== dir;
      wantedVx = approach(player.vx, dir * MOVE_SPEED, (turning ? TURN_ACCEL : GROUND_ACCEL) * dt);
    }
  } else if (dir !== 0) {
    wantedVx = approach(player.vx, dir * MOVE_SPEED, GROUND_ACCEL * AIR_ACCEL_RATIO * dt);
  }

  // ジャンプ: 足場の上、またはコヨーテタイムの間だけ。ジャンプできないときの押下は、先行入力として覚える
  let coyote = grounded ? COYOTE_TIME : Math.max(0, (player.coyote ?? 0) - dt);
  let jumpBuffer = Math.max(0, (player.jumpBuffer ?? 0) - dt);
  let vy = player.vy;
  if ((input.jump && (grounded || coyote > 0)) || (jumpBuffer > 0 && grounded)) {
    vy = -JUMP_SPEED;
    coyote = 0;
    jumpBuffer = 0;
  } else if (input.jump) {
    jumpBuffer = JUMP_BUFFER;
  }
  // 可変ジャンプ: 上昇中にキーを離したら、上向きの速さを打ち切る(踏みつけの跳ね返りにも働く)
  if (!input.jump && vy < -JUMP_CUT_SPEED) vy = -JUMP_CUT_SPEED;

  // 半陰的オイラー法。落下速度には上限を設ける
  vy = Math.min(vy + GRAVITY * dt, MAX_FALL_SPEED);

  // 水平: 崖の側面で止め、ワールドの左右端にクランプ
  const intended = wantedVx * dt;
  let x = resolveHorizontal(player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT, intended, solids);
  x = Math.min(Math.max(x, 0), world.width - PLAYER_WIDTH);
  // 崖の側面やワールドの端に阻まれたら、水平の速さは 0(空中では、壁に沿って真下へ落ちる)
  const blocked = intended !== 0 && Math.abs(x - (player.x + intended)) > 1e-9;
  const vx = blocked ? 0 : wantedVx;

  // 垂直: 着地(崖・浮島の上面)と頭ぶつけ(崖の下面)
  const v = resolveVertical(
    player.y,
    player.y + vy * dt,
    vy,
    x,
    PLAYER_WIDTH,
    PLAYER_HEIGHT,
    solids,
    platforms,
  );

  return { x, y: v.y, vx, vy: v.vy, onGround: v.landed, coyote, jumpBuffer };
}
