import { BOSS_DEFS, createBoss, type Boss, type BossDef } from './boss';
import { stepBossScript, weakPointOf, type BossCtx, type BossStep } from './boss-scripts';
import type { Thrown } from './coconut';
import { FIXED_DT, GROUND_Y } from './config';
import { stepGame, type GameState } from './game';
import { NO_INPUT } from './input';
import type { Projectile } from './projectile';

/** テスト用: 通常ボスの定義を土台に、行動の流れだけを差し替えたボスを作る。 */
export function bossWith(script: BossStep[], over: Partial<BossDef> = {}, x = 1000, left = 1000, right = 1400): Boss {
  return createBoss(x, left, right, GROUND_Y, { ...BOSS_DEFS[0]!, script, ...over });
}

export function ctxAt(playerX: number): BossCtx {
  return { playerX, groundY: GROUND_Y };
}

export function run(
  boss: Boss,
  n: number,
  ctx: BossCtx | ((b: Boss) => BossCtx) = ctxAt(-100000),
): { boss: Boss; spawns: Projectile[]; steps: number[] } {
  let cur = boss;
  const spawns: Projectile[] = [];
  const steps: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = stepBossScript(cur, typeof ctx === 'function' ? ctx(cur) : ctx, FIXED_DT);
    cur = r.boss;
    spawns.push(...r.spawns);
    steps.push(cur.step);
  }
  return { boss: cur, spawns, steps };
}

export const ticks = (seconds: number) => Math.round(seconds / FIXED_DT);

/** 撃破演出(体力 0 のヌシが dying の間)を、終わるまで進める。ゲーム内の時間が 0.3 倍なので、実時間 3.5 秒ぶんの更新が要る。 */
export function finishDying(g: GameState, maxTicks = 400): GameState {
  let s = g;
  for (let i = 0; i < maxTicks && s.bosses.some((b) => b.dying > 0); i++) s = stepGame(s, NO_INPUT, FIXED_DT);
  return s;
}

/** テスト用: ボスの弱点の中心に、止まったヤシの実を 1 個置く(次の更新で命中する)。弱点がなければ空。 */
export function coconutAtWeak(b: Boss): Thrown[] {
  const w = weakPointOf(b);
  if (!w) return [];
  return [{ x: w.rect.x + w.rect.w / 2 - 10, y: w.rect.y + w.rect.h / 2 - 10, vx: 0, vy: 0 }];
}
