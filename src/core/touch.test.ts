import { describe, expect, it } from 'vitest';
import { NO_INPUT } from './input';
import { isPortrait, mergeInput, NO_TOUCH, press, release, releaseAll, toInput } from './touch';

describe('タッチのボタン状態(touch-controls)', () => {
  it('何も押していなければ、すべて無効', () => {
    expect(toInput(NO_TOUCH)).toEqual(NO_INPUT);
  });

  it('右ボタンを押している間だけ、右移動が有効(左・ジャンプは無効)', () => {
    const s = press(NO_TOUCH, 1, 'right');
    expect(toInput(s)).toEqual({ ...NO_INPUT, right: true });
    expect(toInput(s)).toEqual({ ...NO_INPUT, right: true }); // 何度参照しても有効
  });

  it('指を離すと無効になる', () => {
    const s = release(press(NO_TOUCH, 1, 'right'), 1);
    expect(toInput(s).right).toBe(false);
  });

  it('ジャンプボタンは、ジャンプの入力になる', () => {
    expect(toInput(press(NO_TOUCH, 7, 'jump')).jump).toBe(true);
  });

  it('2 本の指で、移動しながらジャンプできる', () => {
    let s = press(NO_TOUCH, 1, 'right');
    s = press(s, 2, 'jump');
    expect(toInput(s)).toEqual({ ...NO_INPUT, right: true, jump: true });
  });

  it('ジャンプの指だけ離しても、右移動は有効なまま', () => {
    let s = press(press(NO_TOUCH, 1, 'right'), 2, 'jump');
    s = release(s, 2);
    expect(toInput(s)).toEqual({ ...NO_INPUT, right: true });
  });

  it('同じボタンを 2 本の指で押して、1 本離しても有効のまま。両方離すと無効', () => {
    let s = press(press(NO_TOUCH, 1, 'left'), 2, 'left');
    s = release(s, 1);
    expect(toInput(s).left).toBe(true);
    s = release(s, 2);
    expect(toInput(s).left).toBe(false);
  });

  it('指がボタンの外へ動いた場合は、release で解除される(別のボタンへ移っても押しっぱなしにならない)', () => {
    let s = press(NO_TOUCH, 1, 'right');
    s = release(s, 1);
    s = press(s, 1, 'jump');
    expect(toInput(s)).toEqual({ ...NO_INPUT, jump: true });
  });

  it('押していない指を release しても、状態は変わらない', () => {
    const s = press(NO_TOUCH, 1, 'right');
    expect(release(s, 99)).toBe(s);
  });

  it('同じ指の二重の press で、状態は変わらない', () => {
    const s = press(NO_TOUCH, 1, 'right');
    expect(press(s, 1, 'right')).toBe(s);
  });

  it('releaseAll で、すべてのボタンが無効になる', () => {
    const s = press(press(NO_TOUCH, 1, 'right'), 2, 'jump');
    expect(toInput(s)).not.toEqual(NO_INPUT);
    expect(toInput(releaseAll())).toEqual(NO_INPUT);
  });

  it('更新は元の状態を書き換えない', () => {
    const s = press(NO_TOUCH, 1, 'right');
    press(s, 2, 'jump');
    release(s, 1);
    expect(toInput(s)).toEqual({ ...NO_INPUT, right: true });
    expect(toInput(NO_TOUCH)).toEqual(NO_INPUT);
  });

  it('決定の入力は、引数で与えたときだけ有効', () => {
    expect(toInput(NO_TOUCH).confirm).toBe(false);
    expect(toInput(NO_TOUCH, true).confirm).toBe(true);
  });
});

describe('入力の合成', () => {
  it('キーボードの右とタッチのジャンプが、同時に有効になる', () => {
    const merged = mergeInput({ ...NO_INPUT, right: true }, { ...NO_INPUT, jump: true });
    expect(merged).toEqual({ ...NO_INPUT, right: true, jump: true });
  });

  it('どちらも無効なら無効', () => {
    expect(mergeInput(NO_INPUT, NO_INPUT)).toEqual(NO_INPUT);
  });

  it('決定も OR で合成される', () => {
    expect(mergeInput(NO_INPUT, { ...NO_INPUT, confirm: true }).confirm).toBe(true);
  });
});

describe('画面の向きの判定(mobile-display)', () => {
  it('高さが幅より大きければ縦向き', () => {
    expect(isPortrait(360, 800)).toBe(true);
  });
  it('幅が高さより大きければ横向き', () => {
    expect(isPortrait(800, 360)).toBe(false);
  });
  it('正方形は横向き扱い', () => {
    expect(isPortrait(500, 500)).toBe(false);
  });
});
