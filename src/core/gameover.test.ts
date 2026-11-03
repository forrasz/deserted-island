import { describe, expect, it } from 'vitest';
import { createBoss, type Boss } from './boss';
import { FIXED_DT, PLAYER_MAX_HP, PLAYER_WIDTH, SEA_X } from './config';
import { createFlow, stepFlow, type Flow } from './flow';
import { createGame, type GameState } from './game';
import { NO_INPUT, type InputState } from './input';
import { createPlayer } from './player';

const ENTER: InputState = { ...NO_INPUT, confirm: true };
const RIGHT: InputState = { ...NO_INPUT, right: true };

function stillBoss(x = 1000, over: Partial<Boss> = {}): Boss {
  return { ...createBoss(x, x, x), vx: 0, ...over };
}

function playing(game: Partial<GameState>, confirmHeld = false): Flow {
  return { phase: 'playing', game: { ...createGame(), ...game }, confirmHeld };
}

/** ボスの左側から接触して被弾する状態(HPを指定)。 */
function aboutToBeHit(hp: number): Flow {
  const boss = stillBoss();
  return playing({ boss, player: createPlayer(boss.x - PLAYER_WIDTH + 10), hp });
}

function run(f: Flow, input: InputState, n: number): Flow {
  let cur = f;
  for (let i = 0; i < n; i++) cur = stepFlow(cur, input, FIXED_DT);
  return cur;
}

/** ゲームオーバー画面になった Flow(決定キーは離れている)。 */
function gameover(): Flow {
  const f = stepFlow(aboutToBeHit(1), NO_INPUT, FIXED_DT);
  expect(f.phase).toBe('gameover');
  return f;
}

/** クリア画面になった Flow(決定キーは離れている)。 */
function cleared(): Flow {
  const f = run(
    playing({
      raftComplete: true,
      partsCollected: 1,
      player: createPlayer(SEA_X - 200),
      boss: stillBoss(1000, { alive: false, hp: 0 }),
    }),
    RIGHT,
    300,
  );
  expect(f.phase).toBe('cleared');
  return stepFlow(f, NO_INPUT, FIXED_DT);
}

describe('ゲームオーバーへの遷移', () => {
  it('HPが 1 のときにボスに接触してHPが 0 になると、ゲームオーバーになる', () => {
    const f = stepFlow(aboutToBeHit(1), NO_INPUT, FIXED_DT);
    expect(f.phase).toBe('gameover');
    expect(f.game.hp).toBe(0);
    expect(f.game.dead).toBe(true);
  });

  it('HPが残っている間は、被弾してもプレイが続く', () => {
    const f = stepFlow(aboutToBeHit(2), NO_INPUT, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game.hp).toBe(1);
  });

  it('3 回被弾するとゲームオーバーになる(HP 3 → 2 → 1 → 0)', () => {
    let f = aboutToBeHit(PLAYER_MAX_HP);
    const phases: string[] = [];
    for (let i = 0; i < 3; i++) {
      f = stepFlow(
        { ...f, game: { ...f.game, player: createPlayer(1000 - PLAYER_WIDTH + 10), hitInvuln: 0 } },
        NO_INPUT,
        FIXED_DT,
      );
      phases.push(f.phase);
    }
    expect(phases).toEqual(['playing', 'playing', 'gameover']);
  });

  it('同じ更新で脱出とHP 0 が重なったときは、クリアが優先される', () => {
    const boss = stillBoss(3540);
    const f = stepFlow(
      playing({
        boss,
        player: createPlayer(3600),
        hp: 1,
        raftComplete: true,
        partsCollected: 1,
      }),
      NO_INPUT,
      FIXED_DT,
    );
    expect(f.game.escaped).toBe(true);
    expect(f.game.dead).toBe(true);
    expect(f.phase).toBe('cleared');
  });
});

describe('ゲームオーバー画面', () => {
  it('世界が進行せず、移動・ジャンプ入力でも位置・HP・無敵が変化しない', () => {
    const f0 = gameover();
    const f = run(f0, { ...NO_INPUT, right: true, left: true, jump: true }, 120);
    expect(f.phase).toBe('gameover');
    expect(f.game).toEqual(f0.game);
  });

  it('Enter が押されたままでは再開せず、離して押し直すと再開する', () => {
    let f = run(aboutToBeHit(1), ENTER, 1); // Enter を押したまま死亡
    expect(f.phase).toBe('gameover');
    f = run(f, ENTER, 60);
    expect(f.phase).toBe('gameover');
    f = stepFlow(f, NO_INPUT, FIXED_DT);
    f = stepFlow(f, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
  });

  it('Enter で、HP 3・無敵 0・所持数 0・イカダ未完成・ボス体力 3・部品なしの初期状態から再開する', () => {
    const f = stepFlow(gameover(), ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game).toEqual(createGame());
    expect(f.game.hp).toBe(3);
    expect(f.game.hitInvuln).toBe(0);
    expect(f.game.dead).toBe(false);
    expect(f.game.partsCollected).toBe(0);
    expect(f.game.raftComplete).toBe(false);
    expect(f.game.boss.hp).toBe(3);
    expect(f.game.parts).toEqual([]);
  });

  it('再開した遷移の更新では、ゲームを進めない', () => {
    const f = stepFlow(gameover(), { ...ENTER, right: true }, FIXED_DT);
    expect(f.game).toEqual(createGame());
  });
});

describe('クリアとゲームオーバーの繰り返し', () => {
  it('ゲームオーバー → 再プレイ → ゲームオーバー → 再プレイ → クリア → 再プレイを繰り返せる', () => {
    let f = stepFlow(gameover(), ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');

    // 2 回目のゲームオーバー
    f = stepFlow(f, NO_INPUT, FIXED_DT);
    f = stepFlow(aboutToBeHit(1), NO_INPUT, FIXED_DT);
    expect(f.phase).toBe('gameover');
    f = stepFlow(stepFlow(f, NO_INPUT, FIXED_DT), ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game).toEqual(createGame());

    // クリア → 再プレイ
    f = stepFlow(cleared(), ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game).toEqual(createGame());
  });

  it('title から始めても、ゲームオーバー後の再プレイでタイトルには戻らない', () => {
    let f = stepFlow(createFlow(), ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    f = stepFlow(f, NO_INPUT, FIXED_DT);
    f = stepFlow(gameover(), NO_INPUT, FIXED_DT);
    f = stepFlow(f, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
  });
});
