import { describe, expect, it } from 'vitest';
import { KONAMI_CODE } from './cheat';
import { FIXED_DT } from './config';
import { createFlow, stepFlow, type Flow } from './flow';
import { createGame } from './game';
import { NO_INPUT } from './input';

const ENTER = { ...NO_INPUT, confirm: true };

function playing(over: Partial<Flow> = {}): Flow {
  return { phase: 'playing', game: createGame(), confirmHeld: false, cheat: 0, ending: 0, ...over };
}

function withPhase(phase: 'cleared' | 'gameover'): Flow {
  return { phase, game: { ...createGame(), escaped: phase === 'cleared', dead: phase === 'gameover' }, confirmHeld: false, cheat: 0, ending: 0 };
}

describe('隠しコマンドの受付(Flow)', () => {
  it('初期の Flow は、無敵ではなく、進み具合は 0', () => {
    const f = createFlow();
    expect(f.game.invincible).toBe(false);
    expect(f.cheat).toBe(0);
  });

  it('プレイ中に、コマンドを入力すると、無敵モードがオンになる', () => {
    const f = stepFlow(playing(), NO_INPUT, FIXED_DT, KONAMI_CODE);
    expect(f.phase).toBe('playing');
    expect(f.game.invincible).toBe(true);
  });

  it('1 キーずつ、別々の更新で入力しても、オンになる', () => {
    let f = playing();
    for (const code of KONAMI_CODE) f = stepFlow(f, NO_INPUT, FIXED_DT, [code]);
    expect(f.game.invincible).toBe(true);
  });

  it('途中で間違えると、オンにならない', () => {
    const f = stepFlow(playing(), NO_INPUT, FIXED_DT, [...KONAMI_CODE.slice(0, 5), 'KeyB', ...KONAMI_CODE.slice(6)]);
    expect(f.game.invincible).toBe(false);
  });

  it('オンのまま、もう一度入力しても、解除されない', () => {
    let f = stepFlow(playing(), NO_INPUT, FIXED_DT, KONAMI_CODE);
    f = stepFlow(f, NO_INPUT, FIXED_DT, KONAMI_CODE);
    expect(f.game.invincible).toBe(true);
  });

  it('タイトル画面でも受け付ける', () => {
    const f = stepFlow(createFlow(), NO_INPUT, FIXED_DT, KONAMI_CODE);
    expect(f.phase).toBe('title');
    expect(f.game.invincible).toBe(true);
  });

  it('クリア画面・ゲームオーバー画面では受け付けない(進み具合も捨てる)', () => {
    for (const phase of ['cleared', 'gameover'] as const) {
      const f = stepFlow(withPhase(phase), NO_INPUT, FIXED_DT, KONAMI_CODE);
      expect(f.game.invincible).toBe(false);
      expect(f.cheat).toBe(0);
    }
  });

  it('ボーナスステージの中でも受け付ける', () => {
    const g = createGame();
    const f = stepFlow(playing({ game: { ...g, bonus: null } }), NO_INPUT, FIXED_DT, KONAMI_CODE);
    expect(f.game.invincible).toBe(true);
  });
});

describe('隠しコマンドの引き継ぎと解除(Flow)', () => {
  it('タイトルでオンにしてスタートすると、無敵のまま始まる', () => {
    let f = stepFlow(createFlow(), NO_INPUT, FIXED_DT, KONAMI_CODE);
    f = stepFlow(f, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game.invincible).toBe(true);
  });

  it('クリアからやり直すと、オフに戻る', () => {
    const cleared = { ...withPhase('cleared'), game: { ...withPhase('cleared').game, invincible: true } };
    const f = stepFlow(cleared, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.game.invincible).toBe(false);
  });

  it('ゲームオーバーからやり直すと、オフに戻る', () => {
    const over = { ...withPhase('gameover'), game: { ...withPhase('gameover').game, invincible: true } };
    const f = stepFlow(over, ENTER, FIXED_DT);
    expect(f.game.invincible).toBe(false);
  });

  it('スタートの前後にまたがる入力は、数えない(画面の遷移で進み具合が 0 に戻る)', () => {
    let f = stepFlow(createFlow(), NO_INPUT, FIXED_DT, KONAMI_CODE.slice(0, 8));
    expect(f.cheat).toBe(8);
    f = stepFlow(f, ENTER, FIXED_DT);
    expect(f.phase).toBe('playing');
    expect(f.cheat).toBe(0);
    f = stepFlow(f, NO_INPUT, FIXED_DT, KONAMI_CODE.slice(8));
    expect(f.game.invincible).toBe(false);
  });
});
