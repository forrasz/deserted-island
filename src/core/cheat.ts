/** 隠しコマンド「上上下下左右左右BA」(`event.code`)。 */
export const KONAMI_CODE: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

export interface CodeStep {
  /** 次に期待するキーの位置(0 なら最初から)。 */
  progress: number;
  /** このキーでコマンドが完成したか。 */
  unlocked: boolean;
}

/**
 * 1 つのキーを受け取って、コマンドの進み具合を進める。
 * 期待どおりなら 1 つ進み、違えば最初に戻る(違うキーが最初のキーなら、1 つ目として数える)。
 * 最後まで進んだら unlocked を返し、進み具合は 0 に戻る。
 */
export function advanceCode(progress: number, code: string): CodeStep {
  if (code === KONAMI_CODE[progress]) {
    const next = progress + 1;
    if (next >= KONAMI_CODE.length) return { progress: 0, unlocked: true };
    return { progress: next, unlocked: false };
  }
  return { progress: code === KONAMI_CODE[0] ? 1 : 0, unlocked: false };
}

/** 押した順のキーを、順に適用する。途中で完成したら、その時点で unlocked を返す。 */
export function advanceCodes(progress: number, codes: readonly string[]): CodeStep {
  let p = progress;
  let unlocked = false;
  for (const c of codes) {
    const r = advanceCode(p, c);
    p = r.progress;
    if (r.unlocked) unlocked = true;
  }
  return { progress: p, unlocked };
}
