import { describe, expect, it } from 'vitest';
import { createBonus } from './bonus';
import { cameraOf, computeCameraX, computeCameraY } from './camera';
import {
  BONUS_HEIGHT,
  BONUS_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from './config';
import { createGame } from './game';

describe('cameraOf(本編とボーナスのカメラ)', () => {
  it('本編では、従来のステージの大きさでカメラを決める', () => {
    const g = createGame();
    const c = cameraOf(g);
    expect(c.x).toBe(computeCameraX(g.player.x + PLAYER_WIDTH / 2));
    expect(c.y).toBe(computeCameraY(g.player.y + PLAYER_HEIGHT / 2));
  });

  it('ボーナスでは、縦は 0 に固定され、横は広間の端で止まる', () => {
    const b = createBonus({ x: 0, y: 0 });
    const left = cameraOf({ ...createGame(), bonus: b });
    expect(left.x).toBe(0);
    expect(left.y).toBe(0);
    expect(BONUS_HEIGHT).toBe(VIEW_HEIGHT);
    const right = cameraOf({
      ...createGame(),
      bonus: { ...b, player: { ...b.player, x: BONUS_WIDTH - PLAYER_WIDTH } },
    });
    expect(right.x).toBe(BONUS_WIDTH - VIEW_WIDTH);
    expect(right.y).toBe(0);
  });
});
