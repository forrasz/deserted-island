import { BOSS_DEFS, createBoss, type Boss, type BossDef } from './boss';
import { stepBossScript, type BossCtx, type BossStep } from './boss-scripts';
import { FIXED_DT, GROUND_Y } from './config';
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
