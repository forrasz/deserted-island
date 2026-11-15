import { describe, expect, it } from 'vitest';
import {
  CLIP_FRAME_COUNTS,
  CLIP_NAMES,
  HIT_TIME,
  initialAnim,
  NO_THROW_POSE,
  stepAnim,
  throwPose,
  validateAtlas,
  walkPeriod,
  type AnimInput,
  type AnimState,
  type Atlas,
  type ClipName,
  type Frame,
} from './player-anim';
import { PLAYER_DISPLAY_HEIGHT, PLAYER_FOOT_SINK, THROW_ANIM_TIME, THROW_ARC_TIME, THROW_LEAN_DEG, THROW_PEAK_TIME } from './config';

// プロジェクトには Node の型定義を入れていない(テストの実行は Node なので、実行時には使える)
// @ts-expect-error node:fs の型がない
const fs: { readFileSync(path: string, enc?: string): any } = await import('node:fs');

const DT = 1 / 60;

function atlasJson(over: (clips: Record<string, Frame[]>) => void = () => {}): Record<string, unknown> {
  const clips: Record<string, Frame[]> = {};
  for (const name of CLIP_NAMES) {
    clips[name] = Array.from({ length: CLIP_FRAME_COUNTS[name] }, (_, i) => ({ x: i * 20, y: 10, w: 18, h: 40, fx: 9, fy: 40 }));
  }
  over(clips);
  return { version: 1, referenceHeight: 40, clips };
}

describe('コマの一覧の検証(validateAtlas)', () => {
  it('正しい一覧は通り、動きごとのコマ数が定義どおり', () => {
    const a = validateAtlas(atlasJson(), 400, 100) as Atlas;
    expect(a).not.toBeNull();
    expect(Object.fromEntries(CLIP_NAMES.map((n) => [n, a.clips[n].length]))).toEqual({
      idle: 6, walk: 7, run: 7, jump: 5, landStill: 4, landRun: 5, hit: 4, knockout: 4,
    });
  });

  it('コマ数が足りない動きがあると、不正', () => {
    expect(validateAtlas(atlasJson((c) => c.walk!.pop()), 400, 100)).toBeNull();
  });

  it('動きが欠けていると、不正', () => {
    expect(validateAtlas(atlasJson((c) => delete c.hit), 400, 100)).toBeNull();
  });

  it('矩形がシートの外にあると、不正(右・下・負)', () => {
    expect(validateAtlas(atlasJson((c) => (c.idle![0]!.x = 390)), 400, 100)).toBeNull();
    expect(validateAtlas(atlasJson((c) => (c.idle![0]!.y = 80)), 400, 100)).toBeNull();
    expect(validateAtlas(atlasJson((c) => (c.idle![0]!.x = -1)), 400, 100)).toBeNull();
  });

  it('幅・高さが 0 以下だと、不正', () => {
    expect(validateAtlas(atlasJson((c) => (c.idle![0]!.w = 0)), 400, 100)).toBeNull();
    expect(validateAtlas(atlasJson((c) => (c.idle![0]!.h = -3)), 400, 100)).toBeNull();
  });

  it('足元が矩形の外にあると、不正', () => {
    expect(validateAtlas(atlasJson((c) => (c.idle![0]!.fx = 99)), 400, 100)).toBeNull();
    expect(validateAtlas(atlasJson((c) => (c.idle![0]!.fy = 99)), 400, 100)).toBeNull();
  });

  it('数でない値・基準の高さがない・JSON でない値は、不正', () => {
    expect(validateAtlas(atlasJson((c) => ((c.idle![0] as unknown as Record<string, unknown>).x = 'a')), 400, 100)).toBeNull();
    expect(validateAtlas({ ...atlasJson(), referenceHeight: 0 }, 400, 100)).toBeNull();
    expect(validateAtlas(null, 400, 100)).toBeNull();
    expect(validateAtlas('oops', 400, 100)).toBeNull();
    expect(validateAtlas({ version: 1 }, 400, 100)).toBeNull();
  });

  it('実際の playersheet.json は、playersheet.png の大きさで、検証を通る', () => {
    const png = fs.readFileSync('public/assets/playersheet.png');
    // PNG のヘッダー: 先頭 8 バイトの署名のあと、IHDR の幅(16〜19)・高さ(20〜23)
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const json = JSON.parse(fs.readFileSync('public/assets/playersheet.json', 'utf8'));
    const a = validateAtlas(json, w, h);
    expect(a).not.toBeNull();
    expect(a!.referenceHeight).toBeGreaterThan(50);
    // 待機のコマは、基準の高さの近く
    for (const f of a!.clips.idle) expect(Math.abs(f.fy - a!.referenceHeight)).toBeLessThan(a!.referenceHeight * 0.1);
  });

  it('地上の動きの全コマで、足の下端(fy)は、コマの下端のすぐ上にある(靴の下に余白・影を含めない)', () => {
    const json = JSON.parse(fs.readFileSync('public/assets/playersheet.json', 'utf8'));
    const a = validateAtlas(json, 4096, 4096)!;
    const k = PLAYER_DISPLAY_HEIGHT / a.referenceHeight;
    for (const name of ['idle', 'walk', 'run', 'landStill', 'landRun'] as const) {
      for (const f of a.clips[name]) {
        // 足の下端より下の透明な余白は、表示で 2 px 以内(足元の描画のずれの、許容量)
        expect((f.h - f.fy) * k).toBeLessThanOrEqual(2);
      }
    }
    // 沈める量は 1 px 以内
    expect(PLAYER_FOOT_SINK).toBeGreaterThanOrEqual(0);
    expect(PLAYER_FOOT_SINK).toBeLessThanOrEqual(1);
  });
});

// ---- 動きの選択 ----

const base = (over: Partial<AnimInput> = {}): AnimInput => ({
  onGround: true,
  vx: 0,
  vy: 0,
  dead: false,
  hitInvuln: 0,
  stunned: false,
  ...over,
});
function run(s: AnimState, input: AnimInput | ((k: number) => AnimInput), seconds: number): AnimState {
  let cur = s;
  const n = Math.round(seconds / DT);
  for (let k = 0; k < n; k++) cur = stepAnim(cur, typeof input === 'function' ? input(k) : input, DT);
  return cur;
}
const clipOf = (s: AnimState): [ClipName, number] => [s.clip, s.frame];

describe('地上の動き(待機・歩く・走る)', () => {
  it('止まっていると待機', () => {
    expect(stepAnim(initialAnim(), base(), DT).clip).toBe('idle');
  });
  it('水平の速さ 100 は歩く、最高速(280)は走る', () => {
    expect(stepAnim(initialAnim(), base({ vx: 100 }), DT).clip).toBe('walk');
    expect(stepAnim(initialAnim(), base({ vx: -100 }), DT).clip).toBe('walk');
    expect(stepAnim(initialAnim(), base({ vx: 280 }), DT).clip).toBe('run');
  });
  it('閾値: 19 は待機、20 は歩く、199 は歩く、200 は走る', () => {
    expect(stepAnim(initialAnim(), base({ vx: 19 }), DT).clip).toBe('idle');
    expect(stepAnim(initialAnim(), base({ vx: 20 }), DT).clip).toBe('walk');
    expect(stepAnim(initialAnim(), base({ vx: 199 }), DT).clip).toBe('walk');
    expect(stepAnim(initialAnim(), base({ vx: 200 }), DT).clip).toBe('run');
  });
});

describe('コマの進め方', () => {
  it('待機は 0.9 秒(6 コマ × 0.15 秒)で、最初のコマに戻る', () => {
    const s0 = stepAnim(initialAnim(), base(), DT);
    expect(s0.frame).toBe(0);
    const mid = run(s0, base(), 0.4);
    expect(mid.frame).toBe(2);
    const loop = run(s0, base(), 0.9);
    expect(loop.frame).toBe(0);
  });

  it('歩くは、速いほど、1 コマの時間が短い(0.08〜0.2 秒)', () => {
    expect(walkPeriod(60)).toBeGreaterThan(walkPeriod(190));
    expect(walkPeriod(150)).toBeCloseTo(0.12, 6);
    expect(walkPeriod(1)).toBe(0.2);
    expect(walkPeriod(1000)).toBe(0.08);
    // 1 秒間に進むコマ数が、速いほうが多い
    const slow = run(stepAnim(initialAnim(), base({ vx: 60 }), DT), base({ vx: 60 }), 1);
    const fast = run(stepAnim(initialAnim(), base({ vx: 190 }), DT), base({ vx: 190 }), 1);
    expect(fast.phase).toBeGreaterThan(slow.phase);
  });

  it('走るは 0.07 秒/コマ(7 コマで 0.49 秒のループ)', () => {
    const s0 = stepAnim(initialAnim(), base({ vx: 280 }), DT);
    const loop = run(s0, base({ vx: 280 }), 0.49);
    expect(loop.frame).toBe(0);
    expect(run(s0, base({ vx: 280 }), 0.22).frame).toBe(3);
  });

  it('動きが切り替わると、最初のコマから始まる', () => {
    const running = run(stepAnim(initialAnim(), base({ vx: 280 }), DT), base({ vx: 280 }), 0.3);
    expect(running.clip).toBe('run');
    const jumped = stepAnim(running, base({ onGround: false, vx: 280, vy: -700 }), DT);
    expect(jumped.clip).toBe('jump');
    expect(jumped.t).toBe(0);
  });
});

describe('ジャンプの段階', () => {
  const air = (vy: number, sinceTakeoff = 0.3) => {
    let s = initialAnim();
    s = stepAnim(s, base(), DT);
    s = stepAnim(s, base({ onGround: false, vy: -700 }), DT); // 離陸
    s = { ...s, sinceTakeoff };
    return stepAnim(s, base({ onGround: false, vy }), DT);
  };
  it('上向き 500・300・0、下向き 400 で、2・3・4(頂点)・5 コマ目の順(0 起点で 1・2・3・4)', () => {
    expect(clipOf(air(-500))).toEqual(['jump', 1]);
    expect(clipOf(air(-300))).toEqual(['jump', 2]);
    expect(clipOf(air(0))).toEqual(['jump', 3]);
    expect(clipOf(air(400))).toEqual(['jump', 4]);
  });
  it('頂点の範囲: -100 と +100 は、頂点のコマ', () => {
    expect(clipOf(air(-100))).toEqual(['jump', 3]);
    expect(clipOf(air(100))).toEqual(['jump', 3]);
    expect(clipOf(air(150))).toEqual(['jump', 4]);
  });
  it('離陸の直後(0.05 秒以内)で、上向きの速さが大きいと、しゃがみのコマ', () => {
    let s = stepAnim(initialAnim(), base(), DT);
    s = stepAnim(s, base({ onGround: false, vy: -750 }), DT);
    expect(clipOf(s)).toEqual(['jump', 0]);
    s = run(s, base({ onGround: false, vy: -700 }), 0.1);
    expect(clipOf(s)).toEqual(['jump', 1]);
  });
  it('足場から歩いて落ちるだけ(上向きでない)では、しゃがみのコマにならない', () => {
    let s = stepAnim(initialAnim(), base({ vx: 200 }), DT);
    s = stepAnim(s, base({ onGround: false, vx: 200, vy: 50 }), DT);
    expect(s.clip).toBe('jump');
    expect(s.frame).not.toBe(0);
  });
});

describe('着地', () => {
  /** 空中に airSeconds いて、速さ vx で着地した直後。 */
  const landed = (airSeconds: number, vx: number): AnimState => {
    let s = stepAnim(initialAnim(), base(), DT);
    s = stepAnim(s, base({ onGround: false, vy: -600, vx }), DT);
    s = run(s, base({ onGround: false, vy: 100, vx }), airSeconds);
    return stepAnim(s, base({ onGround: true, vx }), DT);
  };
  it('空中に 0.5 秒いて、止まって着地すると、「着地(止まって)」(0.24 秒)', () => {
    const s = landed(0.5, 0);
    expect(s.clip).toBe('landStill');
    expect(run(s, base(), 0.15).clip).toBe('landStill');
    expect(run(s, base(), 0.3).clip).toBe('idle');
  });
  it('速さを持って着地すると、「着地(速さを持って)」(0.25 秒)', () => {
    const s = landed(0.5, 250);
    expect(s.clip).toBe('landRun');
    expect(run(s, base({ vx: 250 }), 0.3).clip).toBe('run');
  });
  it('空中が 0.2 秒未満(0.1 秒)の着地では、着地の動きは出ない', () => {
    const s = landed(0.1, 0);
    expect(s.clip).toBe('idle');
  });
  it('1 回だけ: 終わったあと、再び着地しない限り出ない', () => {
    const s = run(landed(0.5, 0), base(), 1);
    expect(s.clip).toBe('idle');
    expect(run(s, base(), 1).clip).toBe('idle');
  });
  it('着地の動きは、再び跳ぶと終わる', () => {
    const s = landed(0.5, 0);
    const j = stepAnim(s, base({ onGround: false, vy: -700 }), DT);
    expect(j.clip).toBe('jump');
  });
});

describe('被弾・硬直・やられ', () => {
  it('無敵時間が増えると被弾の動きで、0.3 秒後も被弾、0.6 秒後は通常に戻る(無敵は続いている)', () => {
    let s = stepAnim(initialAnim(), base(), DT);
    s = stepAnim(s, base({ hitInvuln: 2 }), DT);
    expect(s.clip).toBe('hit');
    expect(s.frame).toBe(0);
    s = run(s, (k) => base({ hitInvuln: 2 - k * DT }), 0.3);
    expect(s.clip).toBe('hit');
    s = run(s, (k) => base({ hitInvuln: 1.6 - k * DT }), 0.3);
    expect(s.clip).toBe('idle');
    expect(HIT_TIME).toBe(0.5);
  });
  it('被弾の動きは、最初の 3 コマ(0.5 秒)で進む', () => {
    let s = stepAnim(initialAnim(), base(), DT);
    s = stepAnim(s, base({ hitInvuln: 2 }), DT);
    const frames = new Set<number>();
    for (let k = 0; k < 28; k++) {
      s = stepAnim(s, base({ hitInvuln: 2 - k * DT }), DT);
      if (s.clip === 'hit') frames.add(s.frame);
    }
    expect([...frames].sort()).toEqual([0, 1, 2]);
  });
  it('石で硬直している間は、被弾の 4 コマ目(目を回す)', () => {
    const s = stepAnim(initialAnim(), base({ stunned: true }), DT);
    expect(clipOf(s)).toEqual(['hit', 3]);
  });
  it('やられ: ほかの状態にかかわらず、やられ。3 コマ + 眠るの 4 コマを進み、最後のコマを保つ', () => {
    let s = stepAnim(initialAnim(), base({ dead: true, onGround: false, vy: -300, hitInvuln: 2, stunned: true }), DT);
    expect(clipOf(s)).toEqual(['knockout', 0]);
    expect(run(s, base({ dead: true }), 0.4).frame).toBe(1);
    expect(run(s, base({ dead: true }), 0.8).frame).toBe(2);
    expect(run(s, base({ dead: true }), 1.2).frame).toBe(3);
    expect(run(s, base({ dead: true }), 5).frame).toBe(3);
    s = run(s, base({ dead: true }), 5);
    expect(s.clip).toBe('knockout');
  });
  it('優先順: 被弾は、着地・ジャンプより優先される', () => {
    let s = stepAnim(initialAnim(), base(), DT);
    s = stepAnim(s, base({ onGround: false, vy: -700, hitInvuln: 2 }), DT);
    expect(s.clip).toBe('hit');
  });
});

describe('投げる動き(throwPose)', () => {
  it('投げた瞬間は傾き 0、0.08 秒で最大(14 度)、0.3 秒で動きなし、0.4 秒は動きなし', () => {
    expect(throwPose(0).leanDeg).toBe(0);
    expect(throwPose(THROW_PEAK_TIME).leanDeg).toBeCloseTo(THROW_LEAN_DEG, 9);
    expect(throwPose(THROW_ANIM_TIME)).toEqual(NO_THROW_POSE);
    expect(throwPose(0.4)).toEqual(NO_THROW_POSE);
    expect(throwPose(-1)).toEqual(NO_THROW_POSE);
    expect(throwPose(99)).toEqual(NO_THROW_POSE);
  });

  it('最大のあと、なめらかに(単調に)戻る。倍率・ずれも、最大のときに最大', () => {
    let prev = throwPose(THROW_PEAK_TIME).leanDeg;
    for (let t = THROW_PEAK_TIME + 0.01; t < THROW_ANIM_TIME; t += 0.01) {
      const d = throwPose(t).leanDeg;
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
    const peak = throwPose(THROW_PEAK_TIME);
    expect(peak.scaleX).toBeCloseTo(1.05, 9);
    expect(peak.scaleY).toBeCloseTo(0.97, 9);
    expect(peak.shift).toBeCloseTo(4, 9);
  });

  it('傾きは、最大 14 度を超えず、投げる途中は 0 以上', () => {
    for (let t = 0; t < THROW_ANIM_TIME; t += 0.005) {
      const p = throwPose(t);
      expect(p.leanDeg).toBeGreaterThanOrEqual(0);
      expect(p.leanDeg).toBeLessThanOrEqual(THROW_LEAN_DEG + 1e-9);
    }
  });

  it('弧は、0.05 秒で 0 より大きく 1 以下、0.15 秒を過ぎると 0', () => {
    const a = throwPose(0.05).arcAlpha;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(1);
    expect(throwPose(THROW_ARC_TIME).arcAlpha).toBe(0);
    expect(throwPose(THROW_ARC_TIME + 0.05).arcAlpha).toBe(0);
  });
});

