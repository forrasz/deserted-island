import { describe, expect, it } from 'vitest';
import { BOSS_DEFS, bossRect, createBoss, type Boss } from './boss';
import { FIXED_DT, GROUND_Y, PART_HEIGHT, PART_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH } from './config';
import { createGame, stepGame, type GameState } from './game';
import { NO_INPUT } from './input';
import { createPlayer, type Player } from './player';

const H = PLAYER_HEIGHT;

/** 動かない大型のボス(ヌシ)。 */
function bigBoss(x: number, over: Partial<Boss> = {}): Boss {
  return { ...createBoss(x, x, x, GROUND_Y, BOSS_DEFS[9]!), vx: 0, ...over };
}

function world(boss: Boss, player: Player, over: Partial<GameState> = {}): GameState {
  return { ...createGame(undefined, { bosses: [], enemies: [] }), bosses: [boss], player, ...over };
}

describe('大型のボス(最終ボス)の大きさ', () => {
  it('ボスの矩形は、ボスごとの大きさ(200×250)を使う', () => {
    const b = bigBoss(1000);
    expect(bossRect(b)).toEqual({ x: 1000, y: GROUND_Y - 250, w: 200, h: 250 });
  });

  it('踏みつけの上辺は、大きさに合わせた位置(地面から 250)になる', () => {
    const b = bigBoss(1000);
    // ボスの上辺の少し上から落下するプレイヤー(ヌシは踏んでもダメージがなく、跳ね返るだけ)
    const p: Player = { x: 1090, y: b.y - H - 5, vx: 0, vy: 300, onGround: false };
    const g = stepGame(world(b, p), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(12);
    expect(g.player.y + H).toBe(b.y); // ボスの上辺(地面から 250)に着地して跳ね返る
    expect(b.y).toBe(GROUND_Y - 250);
  });

  it('通常ボスの高さ(100)の位置では、大型のボスを踏めず、側面として扱われる', () => {
    const b = bigBoss(1000);
    // 通常ボスの上辺の高さ(地面から 100)付近を落下している(ヌシの側面にあたる)
    const p: Player = { x: 1090, y: GROUND_Y - 100 - H - 5, vx: 0, vy: 300, onGround: false };
    const g = stepGame(world(b, p), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.hp).toBe(12);
  });

  it('押し戻しは、ボスの中心(幅 200)を基準に、左側からは左へ、右側からは右へ行う', () => {
    const b = bigBoss(1000);
    const left = stepGame(world(b, createPlayer(1000 - PLAYER_WIDTH + 10)), NO_INPUT, FIXED_DT);
    expect(left.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(1000 + 1e-6);
    const right = stepGame(world(b, createPlayer(1000 + 200 - 10)), NO_INPUT, FIXED_DT);
    expect(right.player.x).toBeGreaterThanOrEqual(1200 - 1e-6);
  });

  it('ボスの内側(幅 200 のうち右半分)に重なっても、中心より右側にいれば右へ押し戻される', () => {
    const b = bigBoss(1000);
    const p = createPlayer(1000 + 140); // 右側(中心 1100 より右)
    const g = stepGame(world(b, p), NO_INPUT, FIXED_DT);
    expect(g.player.x).toBeGreaterThanOrEqual(1200 - 1e-6);
  });

  it('撃破したとき、部品は大型のボスの中央(幅 200・高さ 250 の中心)にドロップする', () => {
    const b = bigBoss(1000, { hp: 1, transformed: true, form: 2, stagger: 6 }); // 変身は済んでいて、気絶している状態
    const p: Player = { x: 1090, y: b.y + 150 - H - 5, vx: 0, vy: 300, onGround: false }; // かがんだ上辺(地面から 100)
    const g = stepGame(world(b, p), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.alive).toBe(false);
    expect(g.parts).toHaveLength(1);
    const part = g.parts[0]!;
    expect(part.x + PART_WIDTH / 2).toBeCloseTo(1000 + 100, 6);
    // ドロップ直後(落下前)の位置は、ボスの矩形の中央の高さ
    expect(part.y).toBeGreaterThanOrEqual(b.y);
    expect(part.y + PART_HEIGHT).toBeLessThanOrEqual(GROUND_Y + 1);
  });

  it('通常ボスは、これまでどおり 80×100 で、中心への押し戻しとドロップが変わらない', () => {
    const b = { ...createBoss(1000, 1000, 1000, GROUND_Y, BOSS_DEFS[0]!), vx: 0, hp: 1 };
    const p: Player = { x: 1020, y: b.y - H - 5, vx: 0, vy: 300, onGround: false };
    const g = stepGame(world(b, p), NO_INPUT, FIXED_DT);
    expect(g.bosses[0]!.alive).toBe(false);
    expect(g.parts[0]!.x + PART_WIDTH / 2).toBeCloseTo(1040, 6);
  });
});
