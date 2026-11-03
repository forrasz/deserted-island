import { worldToScreen, worldToScreenY } from '../core/camera';
import type { Rect } from '../core/collision';
import {
  BOSS_HEIGHT,
  BOSS_WIDTH,
  ENEMY_SIZE,
  PARALLAX_FACTOR,
  PLAYER_MAX_HP,
  RAFT_PARTS_REQUIRED,
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
  WORLD_HEIGHT,
} from '../core/config';
import { blinkVisible } from '../core/blink';
import type { Enemy } from '../core/enemy';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { nextFacing, type Facing } from '../core/facing';
import type { Flow } from '../core/flow';
import { fitToBox, parallaxOffset, tileStartX } from '../core/sprite-layout';
import { STAGE } from '../core/stage';
import type { AssetStore } from './assets';

const MARKER_INTERVAL = 160;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private playerFacing: Facing = 1;
  /** ボスごとの向き(停止中は直前の向きを保つ)。 */
  private readonly bossFacings = new Map<number, Facing>();
  /** 描画中のカメラ y(ワールド y を画面 y に変換するのに使う)。 */
  private cameraY = 0;

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

  draw(flow: Flow, cameraX: number, cameraY: number = WORLD_HEIGHT - VIEW_HEIGHT): void {
    const { ctx } = this;
    this.cameraY = cameraY;
    const { player, bosses, enemies, parts, partsCollected, raftComplete, hp, hitInvuln } = flow.game;

    // 背景(素材があれば視差つきで横に繰り返す。なければ空色)
    this.drawBackground(cameraX);

    // 地面(砂浜)と海。SEA_X より右は地面の代わりに海を描く
    const seaScreenX = Math.min(Math.max(worldToScreen(SEA_X, cameraX), 0), VIEW_WIDTH);
    this.drawGround(cameraX, seaScreenX);
    this.drawSea(cameraX, seaScreenX);

    // 崖と浮島(図形)
    this.drawTerrain(cameraX);

    // 完成したイカダ(砂浜の端)
    if (raftComplete) this.drawRaft(cameraX);

    // ザコ敵(種類ごとの色と目印の図形。倒された敵・隠れている敵・画面外の敵は描かない)
    for (const e of enemies) this.drawEnemy(e, cameraX);

    // ボス「カクレモモジリ」10 体(素材があれば画像、なければ緑の四角形。頭上に残り体力バー)
    for (const boss of bosses) {
      if (!boss.alive) continue;
      const bx = worldToScreen(boss.x, cameraX);
      if (bx + BOSS_WIDTH < 0 || bx > VIEW_WIDTH) continue;
      const facing = nextFacing(this.bossFacings.get(boss.id) ?? 1, boss.vx);
      this.bossFacings.set(boss.id, facing);
      const bossImg = this.assets.get('boss');
      if (bossImg) {
        this.drawSprite(bossImg, { x: bx, y: this.sy(boss.y), w: BOSS_WIDTH, h: BOSS_HEIGHT }, facing);
      } else {
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(bx, this.sy(boss.y), BOSS_WIDTH, BOSS_HEIGHT);
      }
      const seg = BOSS_WIDTH / boss.maxHp;
      for (let i = 0; i < boss.maxHp; i++) {
        ctx.fillStyle = i < boss.hp ? '#ff4d4d' : '#444444';
        ctx.fillRect(bx + i * seg + 1, this.sy(boss.y) - 12, seg - 2, 8);
      }
    }

    // イカダの部品(素材があれば画像、なければ黄色の小さな四角形)
    const partImg = this.assets.get('part');
    for (const part of parts) {
      const px = worldToScreen(part.x, cameraX);
      if (partImg) {
        this.drawSprite(partImg, { x: px, y: this.sy(part.y), w: PART_WIDTH, h: PART_HEIGHT }, 1);
      } else {
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px, this.sy(part.y), PART_WIDTH, PART_HEIGHT);
        ctx.strokeStyle = '#8a6d00';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, this.sy(part.y) + 1, PART_WIDTH - 2, PART_HEIGHT - 2);
      }
    }

    // プレイヤー(素材があれば画像、なければ四角形)
    this.playerFacing = nextFacing(this.playerFacing, player.vx);
    const playerImg = this.assets.get('player');
    const playerBox = {
      x: worldToScreen(player.x, cameraX),
      y: this.sy(player.y),
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
    };
    // 無敵中は点滅(素材の有無に関係なく同じ判定)
    if (blinkVisible(hitInvuln)) {
      if (playerImg) {
        this.drawSprite(playerImg, playerBox, this.playerFacing);
      } else {
        ctx.fillStyle = '#d2362b';
        ctx.fillRect(playerBox.x, playerBox.y, playerBox.w, playerBox.h);
      }
    }

    // HUD(画面座標の固定位置。カメラの影響を受けない)
    this.drawHp(hp);
    this.text(`イカダの部品: ${partsCollected}/${RAFT_PARTS_REQUIRED}`, 16, 44, 24, 'left');
    this.text(
      raftComplete ? 'イカダ: 完成! 右の海へ向かおう' : 'イカダ: 未完成',
      16,
      76,
      24,
      'left',
    );

    // 海の手前で、イカダがなくて進めないときの案内
    if (!raftComplete && player.x + PLAYER_WIDTH >= SEA_X - 1) {
      this.text('イカダがないと海へは出られない…', VIEW_WIDTH / 2, 150, 28, 'center');
    }

    if (flow.phase === 'title') this.drawTitle();
    if (flow.phase === 'cleared') this.drawCleared();
    if (flow.phase === 'gameover') this.drawGameOver();
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

  /** ワールド y を画面 y に変換する(カメラの縦のずらし)。 */
  private sy(worldY: number): number {
    return worldToScreenY(worldY, this.cameraY);
  }

  /** 地面・海の帯(地面の上面からステージの下端まで、80px)を、画像のタイルで [x0, x1) に描く。継ぎ目はワールド固定。 */
  private drawTiles(img: HTMLImageElement, cameraX: number, x0: number, x1: number): void {
    if (x1 <= x0) return;
    const { ctx } = this;
    const bandH = WORLD_HEIGHT - GROUND_Y;
    const top = this.sy(GROUND_Y);
    const tw = (img.naturalWidth * bandH) / img.naturalHeight;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, x1 - x0, bandH);
    ctx.clip();
    for (let x = tileStartX(cameraX, tw); x < x1; x += tw) {
      if (x + tw > x0) ctx.drawImage(img, x, top, tw + 1, bandH);
    }
    ctx.restore();
  }

  /** 地面(砂浜)。穴で分割された区間ごとに描き、穴は描かない(背景が見える)。 */
  private drawGround(cameraX: number, seaScreenX: number): void {
    const { ctx } = this;
    const img = this.assets.get('ground');
    const bandH = WORLD_HEIGHT - GROUND_Y;
    const top = this.sy(GROUND_Y);
    const slabs = (STAGE.world.solids ?? []).filter((r) => r.y === GROUND_Y);
    for (const slab of slabs) {
      const x0 = Math.max(worldToScreen(slab.x, cameraX), 0);
      const x1 = Math.min(worldToScreen(slab.x + slab.w, cameraX), seaScreenX);
      if (x1 <= x0) continue;
      if (img) {
        this.drawTiles(img, cameraX, x0, x1);
        continue;
      }
      ctx.fillStyle = '#e0c068';
      ctx.fillRect(x0, top, x1 - x0, bandH);
      ctx.fillStyle = '#6b8e23';
      ctx.fillRect(x0, top, x1 - x0, 8);

      // スクロールが分かる目印(一定間隔の縦線。海には描かない)
      ctx.fillStyle = '#b8964a';
      const wx0 = cameraX + x0;
      const wx1 = cameraX + x1;
      for (let wx = Math.ceil(wx0 / MARKER_INTERVAL) * MARKER_INTERVAL; wx <= wx1; wx += MARKER_INTERVAL) {
        if (wx < 0 || wx >= SEA_X) continue;
        ctx.fillRect(worldToScreen(wx, cameraX) - 2, top + 8, 4, bandH - 8);
      }
    }
  }

  private drawSea(cameraX: number, seaScreenX: number): void {
    if (seaScreenX >= VIEW_WIDTH) return;
    const { ctx } = this;
    const top = this.sy(GROUND_Y);
    const bandH = WORLD_HEIGHT - GROUND_Y;
    const img = this.assets.get('sea');
    if (img) {
      this.drawTiles(img, cameraX, seaScreenX, VIEW_WIDTH);
      return;
    }
    ctx.fillStyle = '#1e6fb8';
    ctx.fillRect(seaScreenX, top, VIEW_WIDTH - seaScreenX, bandH);
    ctx.fillStyle = '#4a9be0';
    for (let y = top + 14; y < top + bandH; y += 24) {
      for (let x = seaScreenX + 12; x < VIEW_WIDTH; x += 48) {
        ctx.fillRect(x, y, 24, 3);
      }
    }
  }

  /** ザコ敵を図形で描く。本体の色は種類ごとに異なり、目と、種類ごとの目印を付ける。 */
  private drawEnemy(e: Enemy, cameraX: number): void {
    if (!e.alive || e.hidden) return;
    const x = worldToScreen(e.x, cameraX);
    const y = this.sy(e.y);
    if (x + ENEMY_SIZE < 0 || x > VIEW_WIDTH || y > VIEW_HEIGHT || y + ENEMY_SIZE < 0) return;
    const def = ENEMY_DEFS[e.kind];
    const { ctx } = this;

    // 本体
    ctx.fillStyle = def.color;
    ctx.fillRect(x, y, ENEMY_SIZE, ENEMY_SIZE);

    // 種類ごとの目印
    ctx.fillStyle = def.accent;
    switch (e.kind) {
      case 'scurrier': // 速さを表す横線
        ctx.fillRect(x - 6, y + 12, 6, 3);
        ctx.fillRect(x - 10, y + 22, 10, 3);
        break;
      case 'hopper': // ばね(下の脚)
        ctx.fillRect(x + 6, y + ENEMY_SIZE - 6, 8, 6);
        ctx.fillRect(x + ENEMY_SIZE - 14, y + ENEMY_SIZE - 6, 8, 6);
        break;
      case 'chaser': // とがった眉
        ctx.fillRect(x + 4, y + 4, 14, 3);
        ctx.fillRect(x + ENEMY_SIZE - 18, y + 4, 14, 3);
        break;
      case 'floater': // 上の輪(浮いている印)
        ctx.fillRect(x + 8, y - 6, ENEMY_SIZE - 16, 4);
        break;
      case 'swooper': // 翼
        ctx.fillRect(x - 8, y + 10, 8, 14);
        ctx.fillRect(x + ENEMY_SIZE, y + 10, 8, 14);
        break;
      case 'bouncer': // 横じま
        ctx.fillRect(x, y + 24, ENEMY_SIZE, 4);
        ctx.fillRect(x, y + 32, ENEMY_SIZE, 4);
        break;
      case 'hider': // 点線(消える印)
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 2 + i * 10, y + ENEMY_SIZE - 5, 6, 3);
        break;
      case 'charger': // 角
        ctx.fillRect(x + 6, y - 8, 6, 8);
        ctx.fillRect(x + ENEMY_SIZE - 12, y - 8, 6, 8);
        break;
      case 'sleeper': // 眠っている間は目を閉じる(下の線)。突進中は目が開く
        if (e.phase !== 'dash') ctx.fillRect(x + 6, y + 18, ENEMY_SIZE - 12, 3);
        break;
      default:
        break;
    }

    // 目(進む向きに少し寄せる)。ねぼすけは眠っている間は描かない
    if (!(e.kind === 'sleeper' && e.phase !== 'dash')) {
      const shift = e.dir === 1 ? 3 : -3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 8 + shift, y + 10, 8, 10);
      ctx.fillRect(x + ENEMY_SIZE - 16 + shift, y + 10, 8, 10);
      ctx.fillStyle = '#111111';
      ctx.fillRect(x + 11 + shift + (e.dir === 1 ? 2 : 0), y + 13, 4, 5);
      ctx.fillRect(x + ENEMY_SIZE - 13 + shift + (e.dir === 1 ? 2 : 0), y + 13, 4, 5);
    }
  }

  /** 崖(茶色の壁。上面に草の帯)と浮島(薄い足場)。図形で描く。画面外のものは描かない。 */
  private drawTerrain(cameraX: number): void {
    const { ctx } = this;
    for (const c of STAGE.cliffs) {
      const x = worldToScreen(c.x, cameraX);
      const y = this.sy(c.y);
      if (x + c.w < 0 || x > VIEW_WIDTH || y > VIEW_HEIGHT || y + c.h < 0) continue;
      ctx.fillStyle = '#8b6b3d';
      ctx.fillRect(x, y, c.w, c.h);
      ctx.fillStyle = '#6b8e23';
      ctx.fillRect(x, y, c.w, 8);
      ctx.fillStyle = '#5c4526';
      ctx.fillRect(x, y, 3, c.h);
      ctx.fillRect(x + c.w - 3, y, 3, c.h);
    }
    for (const i of STAGE.islands) {
      const x = worldToScreen(i.x, cameraX);
      const y = this.sy(i.y);
      if (x + i.w < 0 || x > VIEW_WIDTH || y > VIEW_HEIGHT || y + i.h < 0) continue;
      ctx.fillStyle = '#7a5c2e';
      ctx.fillRect(x, y, i.w, i.h);
      ctx.fillStyle = '#5fa042';
      ctx.fillRect(x, y, i.w, 7);
    }
  }

  private drawRaft(cameraX: number): void {
    const { ctx } = this;
    const img = this.assets.get('raft');
    if (img) {
      const box = {
        x: worldToScreen(SEA_X - RAFT_SPRITE_MARGIN - RAFT_SPRITE_WIDTH, cameraX),
        y: this.sy(GROUND_Y - RAFT_SPRITE_HEIGHT),
        w: RAFT_SPRITE_WIDTH,
        h: RAFT_SPRITE_HEIGHT,
      };
      this.drawSprite(img, box, 1);
      return;
    }
    const rx = worldToScreen(SEA_X - 120, cameraX);
    const ry = this.sy(GROUND_Y - 14);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(rx, ry, 100, 14);
    ctx.fillStyle = '#5c3a1a';
    for (let i = 1; i < 5; i++) ctx.fillRect(rx + i * 20 - 1, ry, 2, 14);
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

  /** 画面左上のHP。「HP」の文字と、残りHPの数だけの赤いハート(失ったぶんは暗いハート)。 */
  private drawHp(hp: number): void {
    this.text('HP', 16, 12, 24, 'left');
    for (let i = 0; i < PLAYER_MAX_HP; i++) {
      this.text('♥', 72 + i * 30, 10, 28, 'left', i < hp ? '#ff4d4d' : '#4a4a4a');
    }
  }

  private drawGameOver(): void {
    this.overlay();
    this.text('ゲームオーバー', VIEW_WIDTH / 2, 170, 72, 'center');
    this.text('Enter キーでもう一度', VIEW_WIDTH / 2, 290, 32, 'center');
  }

  private drawCleared(): void {
    this.overlay();
    this.text('脱出成功!', VIEW_WIDTH / 2, 170, 72, 'center');
    this.text('Enter キーでもう一度', VIEW_WIDTH / 2, 290, 32, 'center');
  }

  /** 白い文字に黒い縁取り。 */
  private text(
    label: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign,
    color: string = '#ffffff',
  ): void {
    const { ctx } = this;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = align;
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = color;
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  }
}
