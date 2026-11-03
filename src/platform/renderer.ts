import { worldToScreen } from '../core/camera';
import type { Rect } from '../core/collision';
import {
  BOSS_HEIGHT,
  BOSS_MAX_HP,
  BOSS_WIDTH,
  PARALLAX_FACTOR,
  PART_HEIGHT,
  PART_WIDTH,
  GROUND_Y,
  RAFT_SPRITE_HEIGHT,
  RAFT_SPRITE_MARGIN,
  RAFT_SPRITE_WIDTH,
  SEA_X,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from '../core/config';
import { nextFacing, type Facing } from '../core/facing';
import type { Flow } from '../core/flow';
import { fitToBox, parallaxOffset, tileStartX } from '../core/sprite-layout';
import type { AssetStore } from './assets';

const MARKER_INTERVAL = 160;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private playerFacing: Facing = 1;
  private bossFacing: Facing = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: AssetStore,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context を取得できません');
    this.ctx = ctx;
    this.resize();
  }

  /** 論理解像度 VIEW_WIDTH×VIEW_HEIGHT のまま、devicePixelRatio 分だけ内部バッファを拡大する。 */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(VIEW_WIDTH * dpr);
    this.canvas.height = Math.round(VIEW_HEIGHT * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(flow: Flow, cameraX: number): void {
    const { ctx } = this;
    const { player, boss, parts, partsCollected, raftComplete } = flow.game;

    // 背景(素材があれば視差つきで横に繰り返す。なければ空色)
    this.drawBackground(cameraX);

    // 地面(砂浜)と海。SEA_X より右は地面の代わりに海を描く
    const seaScreenX = Math.min(Math.max(worldToScreen(SEA_X, cameraX), 0), VIEW_WIDTH);
    this.drawGround(cameraX, seaScreenX);
    this.drawSea(cameraX, seaScreenX);

    // 完成したイカダ(砂浜の端)
    if (raftComplete) this.drawRaft(cameraX);

    // ボス「カクレモモジリ」(素材があれば画像、なければ緑の四角形。頭上に残り体力バー)
    if (boss.alive) {
      this.bossFacing = nextFacing(this.bossFacing, boss.vx);
      const bx = worldToScreen(boss.x, cameraX);
      const bossImg = this.assets.get('boss');
      if (bossImg) {
        this.drawSprite(bossImg, { x: bx, y: boss.y, w: BOSS_WIDTH, h: BOSS_HEIGHT }, this.bossFacing);
      } else {
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(bx, boss.y, BOSS_WIDTH, BOSS_HEIGHT);
      }
      const seg = BOSS_WIDTH / BOSS_MAX_HP;
      for (let i = 0; i < BOSS_MAX_HP; i++) {
        ctx.fillStyle = i < boss.hp ? '#ff4d4d' : '#444444';
        ctx.fillRect(bx + i * seg + 1, boss.y - 12, seg - 2, 8);
      }
    }

    // イカダの部品(素材があれば画像、なければ黄色の小さな四角形)
    const partImg = this.assets.get('part');
    for (const part of parts) {
      const px = worldToScreen(part.x, cameraX);
      if (partImg) {
        this.drawSprite(partImg, { x: px, y: part.y, w: PART_WIDTH, h: PART_HEIGHT }, 1);
      } else {
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px, part.y, PART_WIDTH, PART_HEIGHT);
        ctx.strokeStyle = '#8a6d00';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, part.y + 1, PART_WIDTH - 2, PART_HEIGHT - 2);
      }
    }

    // プレイヤー(素材があれば画像、なければ四角形)
    this.playerFacing = nextFacing(this.playerFacing, player.vx);
    const playerImg = this.assets.get('player');
    const playerBox = {
      x: worldToScreen(player.x, cameraX),
      y: player.y,
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
    };
    if (playerImg) {
      this.drawSprite(playerImg, playerBox, this.playerFacing);
    } else {
      ctx.fillStyle = '#d2362b';
      ctx.fillRect(playerBox.x, playerBox.y, playerBox.w, playerBox.h);
    }

    // HUD(画面座標の固定位置。カメラの影響を受けない)
    this.text(`イカダの部品: ${partsCollected}`, 16, 12, 24, 'left');
    this.text(
      raftComplete ? 'イカダ: 完成! 右の海へ向かおう' : 'イカダ: 未完成',
      16,
      44,
      24,
      'left',
    );

    // 海の手前で、イカダがなくて進めないときの案内
    if (!raftComplete && player.x + PLAYER_WIDTH >= SEA_X - 1) {
      this.text('イカダがないと海へは出られない…', VIEW_WIDTH / 2, 150, 28, 'center');
    }

    if (flow.phase === 'title') this.drawTitle();
    if (flow.phase === 'cleared') this.drawCleared();
  }

  /** 画像を当たり判定の矩形(画面座標)に合わせて描く。左向きは左右反転。 */
  private drawSprite(img: HTMLImageElement, box: Rect, facing: Facing): void {
    const { ctx } = this;
    const r = fitToBox({ width: img.naturalWidth, height: img.naturalHeight }, box);
    if (facing === -1) {
      ctx.save();
      ctx.translate(r.x + r.w / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -r.w / 2, r.y, r.w, r.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    }
  }

  private drawBackground(cameraX: number): void {
    const { ctx } = this;
    const bg = this.assets.get('background');
    if (!bg) {
      ctx.fillStyle = '#87ceeb';
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      return;
    }
    // 高さを画面に合わせ、横に繰り返す。基準位置から幅ずつ並べて画面を覆う
    const w = (bg.naturalWidth * VIEW_HEIGHT) / bg.naturalHeight;
    for (let x = parallaxOffset(cameraX, PARALLAX_FACTOR, w); x < VIEW_WIDTH; x += w) {
      ctx.drawImage(bg, x, 0, w + 1, VIEW_HEIGHT);
    }
  }

  /** 地面・海の帯(GROUND_Y から画面下端)を、画像のタイルで [x0, x1) に描く。継ぎ目はワールド固定。 */
  private drawTiles(img: HTMLImageElement, cameraX: number, x0: number, x1: number): void {
    if (x1 <= x0) return;
    const { ctx } = this;
    const bandH = VIEW_HEIGHT - GROUND_Y;
    const tw = (img.naturalWidth * bandH) / img.naturalHeight;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, GROUND_Y, x1 - x0, bandH);
    ctx.clip();
    for (let x = tileStartX(cameraX, tw); x < x1; x += tw) {
      if (x + tw > x0) ctx.drawImage(img, x, GROUND_Y, tw + 1, bandH);
    }
    ctx.restore();
  }

  private drawGround(cameraX: number, seaScreenX: number): void {
    const { ctx } = this;
    const img = this.assets.get('ground');
    if (img) {
      this.drawTiles(img, cameraX, 0, seaScreenX);
      return;
    }
    ctx.fillStyle = '#e0c068';
    ctx.fillRect(0, GROUND_Y, seaScreenX, VIEW_HEIGHT - GROUND_Y);
    ctx.fillStyle = '#6b8e23';
    ctx.fillRect(0, GROUND_Y, seaScreenX, 8);

    // スクロールが分かる目印(一定間隔の縦線。海には描かない)
    ctx.fillStyle = '#b8964a';
    const first = Math.floor(cameraX / MARKER_INTERVAL) * MARKER_INTERVAL;
    for (let wx = first; wx <= cameraX + VIEW_WIDTH; wx += MARKER_INTERVAL) {
      if (wx < 0 || wx >= SEA_X) continue;
      ctx.fillRect(worldToScreen(wx, cameraX) - 2, GROUND_Y + 8, 4, VIEW_HEIGHT - GROUND_Y - 8);
    }
  }

  private drawSea(cameraX: number, seaScreenX: number): void {
    if (seaScreenX >= VIEW_WIDTH) return;
    const { ctx } = this;
    const img = this.assets.get('sea');
    if (img) {
      this.drawTiles(img, cameraX, seaScreenX, VIEW_WIDTH);
      return;
    }
    ctx.fillStyle = '#1e6fb8';
    ctx.fillRect(seaScreenX, GROUND_Y, VIEW_WIDTH - seaScreenX, VIEW_HEIGHT - GROUND_Y);
    ctx.fillStyle = '#4a9be0';
    for (let y = GROUND_Y + 14; y < VIEW_HEIGHT; y += 24) {
      for (let x = seaScreenX + 12; x < VIEW_WIDTH; x += 48) {
        ctx.fillRect(x, y, 24, 3);
      }
    }
  }

  private drawRaft(cameraX: number): void {
    const { ctx } = this;
    const img = this.assets.get('raft');
    if (img) {
      const box = {
        x: worldToScreen(SEA_X - RAFT_SPRITE_MARGIN - RAFT_SPRITE_WIDTH, cameraX),
        y: GROUND_Y - RAFT_SPRITE_HEIGHT,
        w: RAFT_SPRITE_WIDTH,
        h: RAFT_SPRITE_HEIGHT,
      };
      this.drawSprite(img, box, 1);
      return;
    }
    const rx = worldToScreen(SEA_X - 120, cameraX);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(rx, GROUND_Y - 14, 100, 14);
    ctx.fillStyle = '#5c3a1a';
    for (let i = 1; i < 5; i++) ctx.fillRect(rx + i * 20 - 1, GROUND_Y - 14, 2, 14);
  }

  private overlay(): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  }

  private drawTitle(): void {
    this.overlay();
    this.text('無人島脱出', VIEW_WIDTH / 2, 130, 72, 'center');
    this.text('Enter キーでスタート', VIEW_WIDTH / 2, 250, 32, 'center');
    this.text('← → / A D: 移動    Space: ジャンプ', VIEW_WIDTH / 2, 340, 22, 'center');
    this.text('ボスを上から踏んで倒し、イカダの部品を手に入れよう', VIEW_WIDTH / 2, 380, 22, 'center');
    this.text('イカダを完成させて、右端の海から脱出しよう', VIEW_WIDTH / 2, 420, 22, 'center');
  }

  private drawCleared(): void {
    this.overlay();
    this.text('脱出成功!', VIEW_WIDTH / 2, 170, 72, 'center');
    this.text('Enter キーでもう一度', VIEW_WIDTH / 2, 290, 32, 'center');
  }

  /** 白い文字に黒い縁取り。 */
  private text(label: string, x: number, y: number, size: number, align: CanvasTextAlign): void {
    const { ctx } = this;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = align;
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  }
}
