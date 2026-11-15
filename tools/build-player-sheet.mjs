/**
 * プレイヤーのスプライトシートの下ごしらえツール。
 *
 * 元画像(assets-src/player-sheet-source.jpeg)は、背景の灰色の市松模様が画像に焼き込まれた JPEG で、
 * コマも格子状に並んでいない。このツールで、
 *   1. 背景(市松模様)を、画像の縁からたどって透明にし、
 *   2. 細い線のゴミ(市松の継ぎ目)を除いて、コマ(連結成分)を見つけ、
 *   3. 見出しの文字を除き、砂ぼこり・星・「Zz」を最も近いコマに含め、
 *   4. 8 つの動き(待機・歩く・走る・ジャンプ・着地 2 種・被弾・やられ)に割り当て、
 *   5. 縮小して 1 枚に詰め直し、
 * public/assets/playersheet.png と playersheet.json を作る。
 *
 * 使い方(Chrome と puppeteer-core が必要。プロジェクトの依存関係には入っていない):
 *   npm i --no-save puppeteer-core
 *   node tools/build-player-sheet.mjs [--preview /tmp/preview.png]
 *
 * 環境変数:
 *   CHROME_PATH     Chrome の実行ファイル(既定: macOS の Google Chrome)
 *   PUPPETEER_CORE  puppeteer-core の場所(既定: 'puppeteer-core')
 *
 * --preview を付けると、濃い青の背景に重ねて、コマの枠を描いた確認用の画像も出力する(目視確認用)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets-src', 'player-sheet-source.jpeg');
const OUT_PNG = path.join(root, 'public', 'assets', 'playersheet.png');
const OUT_JSON = path.join(root, 'public', 'assets', 'playersheet.json');
const previewArg = process.argv.indexOf('--preview');
const PREVIEW = previewArg >= 0 ? process.argv[previewArg + 1] : null;

/** 縮小の倍率(元のコマの最大の高さ約 195 px → 約 156 px)。表示は 70 px 程度なので、高解像度の画面でも足りる。 */
const SCALE = 0.8;
/** 動きの名前と、期待するコマ数。 */
const CLIPS = { idle: 6, walk: 7, run: 7, jump: 5, landStill: 4, landRun: 5, hit: 4, knockout: 4 };

const puppeteer = (await import(process.env.PUPPETEER_CORE ?? 'puppeteer-core')).default;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage();
  const b64 = fs.readFileSync(SRC).toString('base64');
  const result = await page.evaluate(
    async (b64, SCALE, CLIPS, wantPreview) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + b64;
      await img.decode();
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const src = document.createElement('canvas');
      src.width = W;
      src.height = H;
      const g = src.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const id = g.getImageData(0, 0, W, H);
      const d = id.data;

      // ---- 1. 背景(灰色の市松模様)を、画像の縁から、フラッドフィルで探す ----
      const isBg = (r, gg, b) => Math.max(r, gg, b) - Math.min(r, gg, b) <= 16 && r >= 125 && r <= 210;
      const bg = new Uint8Array(W * H);
      const stack = [];
      const push = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const k = y * W + x;
        if (bg[k]) return;
        const i = k * 4;
        if (!isBg(d[i], d[i + 1], d[i + 2])) return;
        bg[k] = 1;
        stack.push(k);
      };
      for (let x = 0; x < W; x++) {
        push(x, 0);
        push(x, H - 1);
      }
      for (let y = 0; y < H; y++) {
        push(0, y);
        push(W - 1, y);
      }
      while (stack.length) {
        const k = stack.pop();
        const x = k % W;
        const y = (k - x) / W;
        push(x + 1, y);
        push(x - 1, y);
        push(x, y + 1);
        push(x, y - 1);
      }

      // ---- 2. 前景から、細い線(市松の継ぎ目の残り)を、開く処理(縮小 → 拡大)で除く ----
      const fg = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) fg[k] = bg[k] ? 0 : 1;
      const morph = (m, erode) => {
        const out = new Uint8Array(W * H);
        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            const k = y * W + x;
            let all = 1;
            let any = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const v = m[k + dy * W + dx];
                if (!v) all = 0;
                if (v) any = 1;
              }
            }
            out[k] = erode ? all : any;
          }
        }
        return out;
      };
      const opened = morph(morph(fg, true), false);

      // ---- 3. 開いたあとの前景を、連結成分(8 近傍)に分ける ----
      const label = new Int32Array(W * H).fill(-1);
      const comps = [];
      for (let y0 = 0; y0 < H; y0++) {
        for (let x0 = 0; x0 < W; x0++) {
          const k0 = y0 * W + x0;
          if (!opened[k0] || label[k0] >= 0) continue;
          const idx = comps.length;
          let minx = x0, maxx = x0, miny = y0, maxy = y0, area = 0, sr = 0, sg = 0, sb = 0;
          const st = [k0];
          label[k0] = idx;
          while (st.length) {
            const k = st.pop();
            const x = k % W;
            const y = (k - x) / W;
            area++;
            sr += d[k * 4];
            sg += d[k * 4 + 1];
            sb += d[k * 4 + 2];
            if (x < minx) minx = x;
            if (x > maxx) maxx = x;
            if (y < miny) miny = y;
            if (y > maxy) maxy = y;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const nk = ny * W + nx;
                if (!opened[nk] || label[nk] >= 0) continue;
                label[nk] = idx;
                st.push(nk);
              }
            }
          }
          comps.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, area, rgb: [sr / area, sg / area, sb / area] });
        }
      }

      // ---- 4. 見出しの文字を除き、砂ぼこり・星・「Zz」を、最も近いコマに含める ----
      // 見出しの文字の位置(元画像の座標)。この矩形の中にある成分は、文字として捨てる。
      const LABELS = [
        [36, 16, 80, 34], // IDLE
        [1215, 8, 150, 30], // 32-BIT STYLE(上)
        [770, 16, 66, 34], // JUMP
        [36, 238, 80, 34], // WALK
        [850, 238, 70, 34], // LAND(右)
        [848, 424, 240, 30], // MONSTER HIT (Damage)
        [36, 434, 52, 30], // RUN
        [36, 596, 62, 34], // LAND(左下)
        [708, 596, 190, 34], // KNOCKOUT (Down)
        [1236, 742, 140, 28], // 32-BIT STYLE(下)
      ];
      const inLabel = (c) =>
        LABELS.some(([lx, ly, lw, lh]) => c.x >= lx && c.y >= ly && c.x + c.w <= lx + lw && c.y + c.h <= ly + lh);
      const cores = comps.map((c, i) => ({ ...c, i })).filter((c) => c.area >= 3000 && !inLabel(c));
      const gap = (a, b) => {
        const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
        const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
        return Math.hypot(dx, dy);
      };
      const members = cores.map((c) => [c.i]);
      comps.forEach((c, i) => {
        if (c.area >= 3000 || c.area < 60 || inLabel(c)) return;
        let best = -1;
        let bestD = 40; // 近いコマにだけ含める(40 px 以内)
        cores.forEach((core, ci) => {
          const dd = gap(c, core);
          if (dd < bestD) {
            bestD = dd;
            best = ci;
          }
        });
        if (best >= 0) members[best].push(i);
      });

      // ---- 5. 動きへの割り当て(コマの中心の位置から)と、並べ替え ----
      const clipOf = (c) => {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        if (cy < 240) return cx < 760 ? 'idle' : 'jump';
        if (cy < 430) return cx < 830 ? 'walk' : 'landStill';
        if (cy < 600) return cx < 830 ? 'run' : 'hit';
        return cx < 700 ? 'landRun' : 'knockout';
      };
      const groups = {};
      cores.forEach((c, ci) => {
        const name = clipOf(c);
        (groups[name] ??= []).push({ core: c, members: members[ci] });
      });
      for (const name of Object.keys(groups)) groups[name].sort((a, b) => a.core.x - b.core.x);
      const counts = Object.fromEntries(Object.keys(CLIPS).map((n) => [n, groups[n]?.length ?? 0]));
      const coreBoxes = Object.fromEntries(Object.entries(groups).map(([n, l]) => [n, l.map((f) => `${f.core.x},${f.core.y} ${f.core.w}x${f.core.h} a${f.core.area}`)]));

      // ---- 6. 各コマの画素を取り出す(開いた成分を 2 px 太らせた範囲の、元の前景画素)----
      const frames = [];
      for (const name of Object.keys(CLIPS)) {
        (groups[name] ?? []).forEach((f, idx) => {
          const set = new Set(f.members);
          let minx = W, maxx = 0, miny = H, maxy = 0;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              if (set.has(label[y * W + x])) {
                if (x < minx) minx = x;
                if (x > maxx) maxx = x;
                if (y < miny) miny = y;
                if (y > maxy) maxy = y;
              }
            }
          }
          frames.push({ name, idx, set, box: { x: minx - 2, y: miny - 2, w: maxx - minx + 5, h: maxy - miny + 5 }, core: f.core });
        });
      }
      const keep = new Uint8Array(W * H); // どのコマにも属する画素(元の前景のうち、成分の 2 px 以内)
      const owner = new Int32Array(W * H).fill(-1);
      frames.forEach((f, fi) => {
        const { x, y, w, h } = f.box;
        for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
          for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
            const k = yy * W + xx;
            if (!fg[k]) continue;
            // 成分の画素、または、成分の 2 px 以内
            let near = f.set.has(label[k]);
            if (!near) {
              for (let dy = -2; dy <= 2 && !near; dy++) {
                for (let dx = -2; dx <= 2 && !near; dx++) {
                  const nx = xx + dx;
                  const ny = yy + dy;
                  if (nx >= 0 && ny >= 0 && nx < W && ny < H && f.set.has(label[ny * W + nx])) near = true;
                }
              }
            }
            if (near) {
              keep[k] = 1;
              owner[k] = fi;
            }
          }
        }
      });

      // ---- 7. 透明にした画像を作る(縁の、背景に近い明るい灰色の画素は、半透明にして白い滲みを減らす)----
      const keyed = document.createElement('canvas');
      keyed.width = W;
      keyed.height = H;
      const kg = keyed.getContext('2d', { willReadFrequently: true });
      const kid = kg.createImageData(W, H);
      for (let k = 0; k < W * H; k++) {
        const i = k * 4;
        if (!keep[k]) continue;
        kid.data[i] = d[i];
        kid.data[i + 1] = d[i + 1];
        kid.data[i + 2] = d[i + 2];
        let a = 255;
        // 背景(bg)に接している、無彩色で明るい画素は、滲みとみなして薄くする
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const gray = Math.max(r, gg, b) - Math.min(r, gg, b) <= 22;
        if (gray && r >= 110) {
          let touchesBg = false;
          for (let dy = -1; dy <= 1 && !touchesBg; dy++) {
            for (let dx = -1; dx <= 1 && !touchesBg; dx++) {
              const nk = k + dy * W + dx;
              if (bg[nk]) touchesBg = true;
            }
          }
          if (touchesBg) a = r >= 160 ? 0 : 120;
        }
        kid.data[i + 3] = a;
      }
      kg.putImageData(kid, 0, 0);

      // ---- 8. 縮小して、棚詰めで 1 枚に並べ直し、足元の位置を求める ----
      const PAD = 3;
      const ATLAS_W = 1024;
      let cx0 = PAD, cy0 = PAD, rowH = 0;
      const placed = [];
      const maxH = Math.max(...frames.map((f) => Math.ceil(f.box.h * SCALE)));
      const items = frames.map((f, fi) => ({ f, fi, w: Math.ceil(f.box.w * SCALE), h: Math.ceil(f.box.h * SCALE) }));
      for (const it of items) {
        if (cx0 + it.w + PAD > ATLAS_W) {
          cx0 = PAD;
          cy0 += rowH + PAD;
          rowH = 0;
        }
        placed.push({ ...it, ax: cx0, ay: cy0 });
        cx0 += it.w + PAD;
        rowH = Math.max(rowH, it.h);
      }
      const ATLAS_H = cy0 + rowH + PAD;
      const atlas = document.createElement('canvas');
      atlas.width = ATLAS_W;
      atlas.height = ATLAS_H;
      const ag = atlas.getContext('2d');
      ag.imageSmoothingQuality = 'high';
      const out = {};
      for (const p of placed) {
        const { f } = p;
        // このコマの画素だけを、取り出す(隣のコマの画素を含めない)
        const tmp = document.createElement('canvas');
        tmp.width = f.box.w;
        tmp.height = f.box.h;
        const tg = tmp.getContext('2d');
        const tid = tg.createImageData(f.box.w, f.box.h);
        let footBottom = 0;
        const bandRows = [];
        for (let yy = 0; yy < f.box.h; yy++) {
          for (let xx = 0; xx < f.box.w; xx++) {
            const sx = f.box.x + xx;
            const sy = f.box.y + yy;
            if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
            const k = sy * W + sx;
            if (owner[k] !== placed.indexOf(p)) continue;
            const si = k * 4;
            const ti = (yy * f.box.w + xx) * 4;
            tid.data[ti] = kid.data[si];
            tid.data[ti + 1] = kid.data[si + 1];
            tid.data[ti + 2] = kid.data[si + 2];
            tid.data[ti + 3] = kid.data[si + 3];
            if (kid.data[si + 3] > 128 && yy > footBottom) footBottom = yy;
          }
        }
        tg.putImageData(tid, 0, 0);
        // 足の中心: 下端から 12 % の帯にある不透明な画素の、x の平均
        const bandTop = Math.max(0, Math.floor(footBottom - f.box.h * 0.12));
        let sx = 0, cnt = 0;
        for (let yy = bandTop; yy <= footBottom; yy++) {
          for (let xx = 0; xx < f.box.w; xx++) {
            if (tid.data[(yy * f.box.w + xx) * 4 + 3] > 128) {
              sx += xx;
              cnt++;
            }
          }
        }
        const footCenter = cnt ? sx / cnt : f.box.w / 2;
        ag.drawImage(tmp, 0, 0, f.box.w, f.box.h, p.ax, p.ay, p.w, p.h);
        (out[f.name] ??= [])[f.idx] = {
          x: p.ax,
          y: p.ay,
          w: p.w,
          h: p.h,
          fx: Math.round(footCenter * SCALE * 10) / 10,
          fy: Math.round((footBottom + 1) * SCALE * 10) / 10,
        };
      }
      // 待機のコマの高さの中央値(倍率の基準)
      const idleHs = out.idle ? out.idle.map((fr) => fr.fy).sort((a, b) => a - b) : [];
      const referenceHeight = idleHs.length ? idleHs[Math.floor(idleHs.length / 2)] : 0;

      let preview = null;
      if (wantPreview) {
        const pv = document.createElement('canvas');
        pv.width = ATLAS_W;
        pv.height = ATLAS_H;
        const pg = pv.getContext('2d');
        pg.fillStyle = '#1b3a6b';
        pg.fillRect(0, 0, ATLAS_W, ATLAS_H);
        pg.drawImage(atlas, 0, 0);
        pg.lineWidth = 1;
        for (const [name, list] of Object.entries(out)) {
          list.forEach((fr, i) => {
            pg.strokeStyle = '#ff5252';
            pg.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
            pg.fillStyle = '#69f0ae';
            pg.fillRect(fr.x + fr.fx - 2, fr.y + fr.fy - 2, 4, 4);
            pg.fillStyle = '#fff';
            pg.font = '10px sans-serif';
            pg.fillText(`${name[0]}${i}`, fr.x + 2, fr.y + 10);
          });
        }
        preview = pv.toDataURL('image/png');
      }
      return { png: atlas.toDataURL('image/png'), atlasW: ATLAS_W, atlasH: ATLAS_H, clips: out, referenceHeight, counts, coreBoxes, preview, maxH };
    },
    b64,
    SCALE,
    CLIPS,
    Boolean(PREVIEW),
  );

  // コマ数が、期待どおりかを検査する
  const bad = Object.entries(CLIPS).filter(([n, c]) => result.counts[n] !== c);
  if (bad.length) {
    for (const [n] of bad) console.error(`${n}:`, result.coreBoxes[n]);
    throw new Error(`コマ数が期待と違います: ${bad.map(([n, c]) => `${n} 期待 ${c} / 検出 ${result.counts[n]}`).join(', ')}`);
  }
  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  fs.writeFileSync(OUT_PNG, Buffer.from(result.png.split(',')[1], 'base64'));
  const json = { version: 1, referenceHeight: result.referenceHeight, clips: result.clips };
  fs.writeFileSync(OUT_JSON, JSON.stringify(json));
  if (PREVIEW && result.preview) fs.writeFileSync(PREVIEW, Buffer.from(result.preview.split(',')[1], 'base64'));
  const bytes = fs.statSync(OUT_PNG).size;
  console.log(`出力: ${path.relative(root, OUT_PNG)}(${result.atlasW}×${result.atlasH}、${(bytes / 1024).toFixed(0)} KB)`);
  console.log(`出力: ${path.relative(root, OUT_JSON)}(基準の高さ ${result.referenceHeight})`);
  console.log('コマ数:', JSON.stringify(result.counts));
} finally {
  await browser.close();
}
