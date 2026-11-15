import { itemRect, type BonusState } from '../core/bonus';
import {
  chargeForecast,
  dyingBlinkWhite,
  dyingBossVisible,
  dyingFlash,
  dyingProgress,
  dyingShake,
  ENDING_ISLAND_WIDTH,
  endingScene,
  explosions,
  IMPACT_TEXT,
  impactDebris,
  impactShake,
  impactTextAlpha,
  introTimeline,
  weakSignal,
} from '../core/cinematic';
import { worldToScreen, worldToScreenY } from '../core/camera';
import type { Rect } from '../core/collision';
import {
  BONUS_BANNER_TIME,
  BONUS_DURATION,
  BONUS_EXIT_WIDTH,
  BONUS_GROUND_Y,
  BONUS_ITEM_SIZE,
  BONUS_WIDTH as BONUS_WORLD_WIDTH,
  COCONUT_MAX_HELD,
  PALM_CANOPY_LOW,
  BONUS_VENTS,
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
  PLAYER_DISPLAY_HEIGHT,
  PLAYER_FOOT_SINK,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WORLD_HEIGHT,
} from '../core/config';
import { blinkVisible } from '../core/blink';
import { bossRect, type Boss } from '../core/boss';
import { bossFlags, weakPointOf } from '../core/boss-scripts';
import { coconutRect, thrownRect } from '../core/coconut';
import type { Enemy } from '../core/enemy';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { nextFacing, type Facing } from '../core/facing';
import type { Pillar } from '../core/pillar';
import type { Player } from '../core/player';
import { initialAnim, stepAnim, type AnimState } from '../core/player-anim';
import type { Projectile } from '../core/projectile';
import type { Flow } from '../core/flow';
import { fitToBox, parallaxOffset, tileStartX } from '../core/sprite-layout';
import { STAGE } from '../core/stage';
import type { AssetStore } from './assets';

const MARKER_INTERVAL = 160;
/** エンディングのプレイヤーの表示の高さ(px。イカダの倍率 1 のとき)と、待機の動きの 1 コマの時間(秒)。 */
const ENDING_PLAYER_HEIGHT = 90;
const ENDING_IDLE_PERIOD = 0.15;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private playerFacing: Facing = 1;
  /** プレイヤーのアニメーションの状態(描画の経過時間で進める)。 */
  private anim: AnimState = initialAnim();
  private lastAnimMs = 0;
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
    // エンディングは、本編を描かず、専用の絵を描く
    if (flow.phase === 'ending') {
      this.drawEnding(flow.ending);
      return;
    }
    // 演出の画面の揺れ(登場演出・撃破演出)。揺れるのは世界とHUD。暗転・文字・フラッシュは、揺らさない
    let shakeX = 0;
    let shakeY = 0;
    const intro = flow.game.intro;
    if (intro.state === 'playing') {
      const tl = introTimeline(intro.t);
      shakeX = tl.shakeX;
      shakeY = tl.shakeY;
    }
    const dyingBoss = flow.game.bosses.find((b) => b.dying > 0);
    if (dyingBoss) {
      const sh = dyingShake(dyingProgress(dyingBoss.dying));
      shakeX = sh.x;
      shakeY = sh.y;
    }
    if (flow.game.impact && !dyingBoss && intro.state !== 'playing') {
      const sh = impactShake(flow.game.impact.t);
      shakeX = sh.x;
      shakeY = sh.y;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.drawScene(flow, cameraX, cameraY);
    ctx.restore();
    this.drawCinematicEffects(flow, dyingBoss?.dying);
    if (flow.phase === 'title') this.drawTitle(flow.game.invincible);
    if (flow.phase === 'cleared') this.drawCleared();
    if (flow.phase === 'gameover') this.drawGameOver();
  }

  private drawScene(flow: Flow, cameraX: number, cameraY: number): void {
    const { ctx } = this;
    this.cameraY = cameraY;
    const { player, bosses, enemies, projectiles, parts, partsCollected, raftComplete, hp, hitInvuln } = flow.game;

    // ボーナスステージの最中は、地下の広間だけを描く
    if (flow.game.bonus) {
      this.drawBonus(flow.game.bonus, hp, hitInvuln, cameraX, flow.game.invincible);
      return;
    }

    // 背景(素材があれば視差つきで横に繰り返す。なければ空色)
    this.drawBackground(cameraX);

    // 地面(砂浜)と海。SEA_X より右は地面の代わりに海を描く
    const seaScreenX = Math.min(Math.max(worldToScreen(SEA_X, cameraX), 0), VIEW_WIDTH);
    this.drawGround(cameraX, seaScreenX);
    this.drawSea(cameraX, seaScreenX);

    // 崖と浮島(図形)
    this.drawTerrain(cameraX);

    // 最終ボスの闘技場の柱(壊れている間は描かない)
    for (const pillar of flow.game.pillars) if (pillar.alive) this.drawPillar(pillar, cameraX);

    // 完成したイカダ(砂浜の端)
    if (raftComplete) this.drawRaft(cameraX);

    // ザコ敵(種類ごとの色と目印の図形。倒された敵・隠れている敵・画面外の敵は描かない)
    for (const e of enemies) this.drawEnemy(e, cameraX);

    // ボス 10 体(素材があれば画像、なければ種類ごとの色の図形。頭上に残り体力バー)
    for (const boss of bosses) {
      if (!boss.alive) continue;
      const bx = worldToScreen(boss.x, cameraX);
      if (bx + boss.w < 0 || bx > VIEW_WIDTH) continue;
      const facing = nextFacing(this.bossFacings.get(boss.id) ?? 1, boss.vx);
      this.bossFacings.set(boss.id, facing);
      this.drawBoss(boss, bx, facing);
    }

    // ヌシ戦の合図(突進の予告・弱点の光と文字)と、ヤシの実・的
    this.drawNushiBattle(flow, cameraX);

    // ボスが出した弾と衝撃波
    for (const p of projectiles) this.drawProjectile(p, cameraX);

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

    this.drawPlayer(player, hitInvuln, cameraX, flow.game.invincible, flow.game.dead, false);
    this.drawImpact(flow, cameraX);
    if (flow.game.invincible) this.text('無敵モード', 16, 108, 24, 'left', '#ffd700');

    // HUD(画面座標の固定位置。カメラの影響を受けない)
    this.drawHp(hp);
    // 手持ちのヤシの実(X キー / 投げるボタンで投げる)
    const { held } = flow.game;
    for (let i = 0; i < COCONUT_MAX_HELD; i++) this.drawCoconut(VIEW_WIDTH - 40 - i * 34, 30, 12, i < held);
    this.text('ヤシの実', VIEW_WIDTH - 16, 48, 16, 'right');
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
  }

  /** プレイヤー(素材があれば画像、なければ四角形)。無敵中は点滅する。 */
  private drawPlayer(
    player: Pick<Player, 'x' | 'y' | 'vx' | 'vy' | 'onGround'>,
    hitInvuln: number,
    cameraX: number,
    invincible: boolean,
    dead: boolean,
    stunned: boolean,
  ): void {
    const { ctx } = this;
    this.playerFacing = nextFacing(this.playerFacing, player.vx);
    const playerImg = this.assets.get('player');
    const playerBox = {
      x: worldToScreen(player.x, cameraX),
      y: this.sy(player.y),
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
    };
    // スプライトシートが使えるときは、状態に合わせて動きとコマを選び、足元をそろえて描く
    const sheet = this.assets.playerSheet;
    if (sheet) {
      const now = performance.now();
      const dt = this.lastAnimMs === 0 ? 0 : Math.min(0.1, (now - this.lastAnimMs) / 1000);
      this.lastAnimMs = now;
      this.anim = stepAnim(
        this.anim,
        { onGround: player.onGround, vx: player.vx, vy: player.vy, dead, hitInvuln, stunned },
        dt,
      );
    }
    // 無敵中は点滅(素材の有無に関係なく同じ判定)
    if (blinkVisible(hitInvuln)) {
      if (sheet) {
        const frame = sheet.atlas.clips[this.anim.clip][this.anim.frame]!;
        const k = PLAYER_DISPLAY_HEIGHT / sheet.atlas.referenceHeight;
        const footX = playerBox.x + playerBox.w / 2;
        const footY = playerBox.y + playerBox.h + PLAYER_FOOT_SINK;
        const dw = frame.w * k;
        const dh = frame.h * k;
        ctx.save();
        if (invincible) {
          // 無敵モード: 金色の光で示す
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 10;
        }
        ctx.imageSmoothingEnabled = true;
        if (this.playerFacing === -1) {
          ctx.translate(footX, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(sheet.image, frame.x, frame.y, frame.w, frame.h, -frame.fx * k, footY - frame.fy * k, dw, dh);
        } else {
          ctx.drawImage(sheet.image, frame.x, frame.y, frame.w, frame.h, footX - frame.fx * k, footY - frame.fy * k, dw, dh);
        }
        ctx.restore();
      } else if (playerImg) {
        this.drawSprite(playerImg, playerBox, this.playerFacing);
        if (invincible) {
          // 画像は色を変えられないので、金色の枠で示す
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 3;
          ctx.strokeRect(playerBox.x - 1, playerBox.y - 1, playerBox.w + 2, playerBox.h + 2);
        }
      } else {
        ctx.fillStyle = invincible ? '#ffd700' : '#d2362b';
        ctx.fillRect(playerBox.x, playerBox.y, playerBox.w, playerBox.h);
      }
    }
  }

  /** ボーナスステージ(地下の広間)。暗い背景・床・吹き出し口・ハートと石・プレイヤー・HUD。 */
  private drawBonus(bonus: BonusState, hp: number, hitInvuln: number, cameraX: number, invincible: boolean): void {
    const { ctx } = this;
    ctx.fillStyle = '#241a2e';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    // 岩壁の模様(カメラに合わせて動く縦縞)
    ctx.fillStyle = '#2e2240';
    for (let x = -(cameraX % 240); x < VIEW_WIDTH; x += 240) ctx.fillRect(x, 0, 120, BONUS_GROUND_Y);
    // 床
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(0, BONUS_GROUND_Y, VIEW_WIDTH, VIEW_HEIGHT - BONUS_GROUND_Y);
    ctx.fillStyle = '#8a643f';
    ctx.fillRect(0, BONUS_GROUND_Y, VIEW_WIDTH, 8);
    // 吹き出し口
    ctx.fillStyle = '#120c18';
    for (const vx of BONUS_VENTS) {
      const sx = worldToScreen(vx, cameraX);
      if (sx < -40 || sx > VIEW_WIDTH + 40) continue;
      ctx.fillRect(sx - 22, BONUS_GROUND_Y, 44, 10);
    }
    // ハートと石
    for (const it of bonus.items) {
      const r = itemRect(it);
      const sx = worldToScreen(r.x, cameraX);
      if (sx + BONUS_ITEM_SIZE < 0 || sx > VIEW_WIDTH) continue;
      if (it.kind === 'heart') this.drawHeart(sx, r.y);
      else this.drawStone(sx, r.y);
    }
    // 出口(右端)の目印
    const exitX = worldToScreen(this.bonusExitX(), cameraX);
    if (exitX < VIEW_WIDTH) {
      ctx.fillStyle = 'rgba(255, 240, 150, 0.35)';
      ctx.fillRect(exitX, 0, VIEW_WIDTH - exitX + 40, BONUS_GROUND_Y);
      this.text('出口', exitX + 6, BONUS_GROUND_Y - 60, 24, 'left', '#fff3a0');
    }

    this.drawPlayer(bonus.player, hitInvuln, cameraX, invincible, false, bonus.stun > 0);
    if (invincible) this.text('無敵モード', 16, 108, 24, 'left', '#ffd700');

    // HUD
    this.drawHp(hp);
    const left = Math.max(0, Math.ceil(BONUS_DURATION - bonus.t));
    this.text(`ボーナスステージ  のこり ${left} 秒`, VIEW_WIDTH - 16, 12, 26, 'right');
    if (bonus.stun > 0) this.text('しびれて動けない!', VIEW_WIDTH / 2, 120, 32, 'center', '#ffb347');
    if (bonus.t < BONUS_BANNER_TIME) {
      this.text('ボーナスステージ!', VIEW_WIDTH / 2, 170, 64, 'center', '#ffe27a');
      this.text('ハートでHP回復 / 石はよけろ', VIEW_WIDTH / 2, 250, 28, 'center');
    }
  }

  /** 出口の左端(広間のワールド x)。 */
  private bonusExitX(): number {
    return BONUS_WORLD_WIDTH - BONUS_EXIT_WIDTH;
  }

  private drawHeart(x: number, y: number): void {
    const { ctx } = this;
    const s = BONUS_ITEM_SIZE;
    ctx.fillStyle = '#ff4d6d';
    ctx.strokeStyle = '#7a1230';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y + s);
    ctx.bezierCurveTo(x - s * 0.2, y + s * 0.5, x + s * 0.1, y - s * 0.1, x + s / 2, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.9, y - s * 0.1, x + s * 1.2, y + s * 0.5, x + s / 2, y + s);
    ctx.fill();
    ctx.stroke();
  }

  private drawStone(x: number, y: number): void {
    const { ctx } = this;
    const s = BONUS_ITEM_SIZE;
    ctx.fillStyle = '#8c8c94';
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.15, y + s * 0.2);
    ctx.lineTo(x + s * 0.6, y);
    ctx.lineTo(x + s, y + s * 0.35);
    ctx.lineTo(x + s * 0.85, y + s * 0.9);
    ctx.lineTo(x + s * 0.3, y + s);
    ctx.lineTo(x, y + s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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

  /** ボス 1 体を描く。予備動作は点滅、もぐっている間は盛り上がりだけ、転がっている間は円、変身中は赤白の点滅。 */
  private drawBoss(boss: Boss, bx: number, facing: Facing): void {
    const { ctx } = this;
    const flags = bossFlags(boss);
    const rect = bossRect(boss); // 休んで身をかがめている間は、高さが低い
    const top = this.sy(rect.y);
    const bh = rect.h;

    if (flags.hidden) {
      // もぐっている: 地面に小さな盛り上がりだけを描く
      ctx.fillStyle = boss.color;
      ctx.fillRect(bx + boss.w / 2 - 20, this.sy(boss.y + boss.h) - 8, 40, 8);
      return;
    }

    // 撃破演出: 体が白と元の色で光り、爆発が重なる。フラッシュの頂点で消える
    if (boss.dying > 0) {
      const p = dyingProgress(boss.dying);
      if (dyingBossVisible(p)) {
        ctx.fillStyle = dyingBlinkWhite(boss.dying) ? '#ffffff' : boss.color;
        ctx.fillRect(bx, top, boss.w, bh);
        ctx.fillStyle = '#111111';
        ctx.fillRect(bx + boss.w * 0.3, top + bh * 0.2, 16, 6);
        ctx.fillRect(bx + boss.w * 0.62, top + bh * 0.2, 16, 6);
      }
      for (const e of explosions(p)) {
        const cx = bx + e.x * boss.w;
        const cy = top + e.y * bh;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, e.r);
        g.addColorStop(0, `rgba(255,255,220,${e.alpha})`);
        g.addColorStop(0.45, `rgba(255,${Math.round(200 - 120 * e.u)},40,${e.alpha * 0.9})`);
        g.addColorStop(1, `rgba(200,40,20,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // 点滅: 予備動作(白と元の色)、変身中(赤と白)
    const flash = Math.floor(Math.max(boss.t, 0) / 0.08) % 2 === 0;
    const transformFlash = boss.transformT > 0 && Math.floor(boss.transformT / 0.08) % 2 === 0;
    let color = boss.color;
    if (flags.telegraph && flash) color = '#ffffff';
    if (transformFlash) color = '#ffffff';

    const bossImg = this.assets.get('boss');
    if (bossImg && color === boss.color) {
      this.drawSprite(bossImg, { x: bx, y: top, w: boss.w, h: bh }, facing);
    } else if (flags.stompImmune) {
      // 転がっている: 円
      const r = boss.w / 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx + r, top + bh - r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#00000044';
      ctx.fillRect(bx + r - 3, top + bh - r * 2, 6, r * 2);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(bx, top, boss.w, bh);
      // 強化形態は、赤い縁取り
      if (boss.form === 2) {
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 4;
        ctx.strokeRect(bx + 2, top + 2, boss.w - 4, bh - 4);
      }
      // 目(向きに寄せる)。大型のボスは大きく描く
      const k = boss.w / 80;
      const shift = facing === 1 ? 6 * k : -6 * k;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + boss.w * 0.25 + shift, top + bh * 0.15, 14 * k, 18 * k);
      ctx.fillRect(bx + boss.w * 0.6 + shift, top + bh * 0.15, 14 * k, 18 * k);
      ctx.fillStyle = '#111111';
      ctx.fillRect(bx + boss.w * 0.25 + shift + 4 * k, top + bh * 0.15 + 5 * k, 6 * k, 9 * k);
      ctx.fillRect(bx + boss.w * 0.6 + shift + 4 * k, top + bh * 0.15 + 5 * k, 6 * k, 9 * k);
      // 最終ボスは、角を付ける
      if (boss.kind === 'nushi') {
        ctx.fillStyle = '#ffd740';
        ctx.fillRect(bx + 20, top - 24, 24, 24);
        ctx.fillRect(bx + boss.w - 44, top - 24, 24, 24);
      }
    }

    // 気絶している間は、頭上で星が回る
    if (flags.staggered && boss.kind !== 'nushi') {
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd740';
      for (let i = 0; i < 3; i++) {
        const a = boss.stagger * 5 + (i * Math.PI * 2) / 3;
        ctx.fillText('★', bx + boss.w / 2 + Math.cos(a) * 50, top - 58 + Math.sin(a) * 10);
      }
    }

    // 残り体力バー(頭上)
    const seg = boss.w / boss.maxHp;
    for (let i = 0; i < boss.maxHp; i++) {
      ctx.fillStyle = i < boss.hp ? '#ff4d4d' : '#444444';
      ctx.fillRect(bx + i * seg + 1, top - (boss.kind === 'nushi' ? 32 : 12), seg - 2, 8);
    }
  }

  /** ヤシの実 1 個(円と、ふくらみの線)。active が false なら、薄い輪郭だけ。 */
  private drawCoconut(cx: number, cy: number, r: number, active = true): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (active) {
      ctx.fillStyle = '#7b4a1e';
      ctx.fill();
      ctx.strokeStyle = '#3e2410';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#a8703a';
      ctx.beginPath();
      ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /** ヌシ戦の描画: 地面のヤシの実・飛んでいる実・的・突進の予告(目標の柱の枠と足元の矢印)・弱点の光と文字。 */
  private drawNushiBattle(flow: Flow, cameraX: number): void {
    const { ctx } = this;
    const g = flow.game;
    for (const palm of g.palms) {
      const px = worldToScreen(palm.x, cameraX);
      if (px + 120 < 0 || px - 120 > VIEW_WIDTH) continue;
      this.drawPalmTree(px, this.sy(GROUND_Y), PALM_CANOPY_LOW, palm.ready, palm.ready);
    }
    for (const c of g.coconuts) {
      const r = coconutRect(c);
      const x = worldToScreen(r.x, cameraX);
      if (x + r.w < 0 || x > VIEW_WIDTH) continue;
      this.drawCoconut(x + r.w / 2, this.sy(r.y) + r.h / 2, r.w / 2);
    }
    if (g.target) {
      const x = worldToScreen(g.target.x, cameraX);
      if (x + g.target.w >= 0 && x <= VIEW_WIDTH) {
        const cx = x + g.target.w / 2;
        const cy = this.sy(g.target.y) + g.target.h / 2;
        const hit = g.targetFlash > 0;
        ctx.fillStyle = hit ? '#ffee58' : '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, g.target.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hit ? '#ff7043' : '#e53935';
        ctx.beginPath();
        ctx.arc(cx, cy, g.target.w / 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hit ? '#ffee58' : '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, g.target.w / 6, 0, Math.PI * 2);
        ctx.fill();
        // 的を支える杭
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(cx - 2, cy + g.target.h / 2, 4, GROUND_Y - g.target.y - g.target.h);
      }
    }
    for (const t of g.thrown) {
      const r = thrownRect(t);
      this.drawCoconut(worldToScreen(r.x, cameraX) + r.w / 2, this.sy(r.y) + r.h / 2, r.w / 2);
    }

    for (const boss of g.bosses) {
      if (boss.kind !== 'nushi' || !boss.alive) continue;
      // 突進の予告: 向かう側の柱を暖色の枠で強調し(点滅しない)、足元に向きの矢印
      const fc = chargeForecast(boss, g.pillars);
      if (fc) {
        const pillar = g.pillars.find((p) => p.alive && p.side === fc.pillar);
        if (pillar) {
          const px = worldToScreen(pillar.x, cameraX);
          ctx.strokeStyle = '#ff9100';
          ctx.lineWidth = 5;
          ctx.strokeRect(px - 4, this.sy(pillar.y) - 12, pillar.w + 8, pillar.h + 12);
        }
        const bx = worldToScreen(boss.x, cameraX);
        const ay = this.sy(GROUND_Y) - 14;
        const ax = bx + boss.w / 2;
        ctx.fillStyle = '#ff9100';
        ctx.beginPath();
        for (const off of [0, 36]) {
          const x0 = ax + fc.dir * (60 + off);
          ctx.moveTo(x0 + fc.dir * 22, ay);
          ctx.lineTo(x0 - fc.dir * 4, ay - 14);
          ctx.lineTo(x0 - fc.dir * 4, ay + 14);
        }
        ctx.fill();
      }
      // 弱点の光・矢印・文字・円の目盛り
      const weak = weakPointOf(boss);
      const sig = weakSignal(boss, g.held, g.hitStop);
      if (weak && sig.glow) {
        const wx = worldToScreen(weak.rect.x, cameraX);
        const wy = this.sy(weak.rect.y);
        ctx.fillStyle = 'rgba(255, 235, 59, 0.55)';
        ctx.fillRect(wx, wy, weak.rect.w, weak.rect.h);
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 4;
        ctx.strokeRect(wx, wy, weak.rect.w, weak.rect.h);
        const cx = wx + weak.rect.w / 2;
        if (sig.arrow) {
          ctx.fillStyle = '#ffeb3b';
          ctx.beginPath();
          ctx.moveTo(cx, wy - 40);
          ctx.lineTo(cx - 14, wy - 66);
          ctx.lineTo(cx + 14, wy - 66);
          ctx.fill();
        }
        if (sig.text) this.text(sig.text, cx, wy - 138, 26, 'center', '#ffeb3b');
        if (sig.ring !== null) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx, wy - 92, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sig.ring);
          ctx.stroke();
        }
      }
    }
  }

  /** 柱への衝突の演出: 柱の破片と、擬音。 */
  private drawImpact(flow: Flow, cameraX: number): void {
    const im = flow.game.impact;
    if (!im) return;
    const { ctx } = this;
    const ox = worldToScreen(im.x, cameraX);
    const oy = this.sy(GROUND_Y);
    ctx.fillStyle = '#8d8d94';
    for (const d of impactDebris(im.t, im.dir)) {
      ctx.save();
      ctx.translate(ox + d.x, oy + d.y);
      ctx.rotate(d.rot);
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.restore();
    }
    const a = impactTextAlpha(im.t);
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha = a;
      this.text(IMPACT_TEXT, VIEW_WIDTH / 2, 100, 56, 'center', '#ffeb3b');
      ctx.restore();
    }
  }

  /**
   * ヤシの木: 少し曲がった幹と、広がる葉、梢の実。height は幹の高さ(地面から梢まで)。
   * fruit が true なら梢に実を描き、hint が true なら、頭突きできる高さを示す上向きの印(点滅しない)を出す。
   */
  private drawPalmTree(cx: number, groundScreenY: number, height: number, fruit: boolean, hint: boolean): void {
    const { ctx } = this;
    const topY = groundScreenY - height;
    const lean = 16;
    // 幹(少し曲がる)
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, groundScreenY);
    ctx.quadraticCurveTo(cx - lean, groundScreenY - height * 0.5, cx + 4, topY);
    ctx.stroke();
    ctx.strokeStyle = '#5a3a1e';
    ctx.lineWidth = 3;
    for (let i = 1; i < 8; i++) {
      const y = groundScreenY - (height * i) / 8;
      ctx.beginPath();
      ctx.moveTo(cx - 10 - lean * Math.sin((i / 8) * Math.PI) * 0.6, y);
      ctx.lineTo(cx + 10 - lean * Math.sin((i / 8) * Math.PI) * 0.6, y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // 葉(梢から広がる)
    ctx.fillStyle = '#2e8b3d';
    for (const ang of [-2.7, -2.1, -1.57, -1.0, -0.45]) {
      ctx.save();
      ctx.translate(cx + 4, topY);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(34, 0, 38, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 実
    if (fruit) {
      for (const [dx, dy] of [[-8, 12], [8, 14], [0, 22]] as const) this.drawCoconut(cx + 4 + dx, topY + dy, 8);
    }
    // 頭突きの印(梢の少し下の、幹のわき)
    if (hint) {
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.moveTo(cx + 30, topY + 50);
      ctx.lineTo(cx + 20, topY + 68);
      ctx.lineTo(cx + 40, topY + 68);
      ctx.fill();
    }
  }

  /** 闘技場の柱。ヤシの木の幹として、大きなヤシの木で描く(実は、衝突のときに落ちるので、梢にいくつか描く)。 */
  private drawPillar(p: Pillar, cameraX: number): void {
    const x = worldToScreen(p.x, cameraX);
    if (x + p.w < -80 || x > VIEW_WIDTH + 80) return;
    this.drawPalmTree(x + p.w / 2, this.sy(p.y + p.h), p.h, true, false);
  }

  /** 弾(黄色の円)・放物線の弾(オレンジの円)・衝撃波(赤い帯)を描く。画面外は描かない。 */
  private drawProjectile(p: Projectile, cameraX: number): void {
    if (!p.alive) return;
    const x = worldToScreen(p.x, cameraX);
    const y = this.sy(p.y);
    if (x + p.w < 0 || x > VIEW_WIDTH || y > VIEW_HEIGHT || y + p.h < 0) return;
    const { ctx } = this;
    if (p.kind === 'wave') {
      ctx.fillStyle = '#e53935';
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = '#ff8a80';
      ctx.fillRect(x, y, p.w, 6);
      return;
    }
    ctx.fillStyle = p.kind === 'shot' ? '#ffeb3b' : '#ff9800';
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + p.h / 2, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6d4c00';
    ctx.lineWidth = 2;
    ctx.stroke();
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

  /** 登場演出(暗転・WARNING・名前)と、撃破演出の白いフラッシュ。画面に固定で、揺らさない。 */
  private drawCinematicEffects(flow: Flow, dying: number | undefined): void {
    const { ctx } = this;
    const intro = flow.game.intro;
    if (intro.state === 'playing') {
      const tl = introTimeline(intro.t);
      ctx.fillStyle = `rgba(0, 0, 0, ${tl.dark})`;
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      if (tl.warning) {
        ctx.fillStyle = 'rgba(170, 0, 0, 0.55)';
        ctx.fillRect(0, 110, VIEW_WIDTH, 8);
        ctx.fillRect(0, 232, VIEW_WIDTH, 8);
        this.text('WARNING', VIEW_WIDTH / 2, 130, 84, 'center', '#ff3b30');
      }
      if (tl.nameAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = tl.nameAlpha;
        this.text('ヌシ', VIEW_WIDTH / 2, 290, 110, 'center', '#ffe0d0');
        ctx.restore();
      }
    }
    if (dying !== undefined) {
      const f = dyingFlash(dyingProgress(dying));
      if (f > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${f})`;
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      }
    }
  }

  /** エンディング: 夕焼けの水平線を、イカダに乗ったプレイヤーが遠ざかる。 */
  private drawEnding(t: number): void {
    const { ctx } = this;
    const s = endingScene(t);
    const W = VIEW_WIDTH;
    const H = VIEW_HEIGHT;

    // 空(紫 → 橙 → 水平線の近くの明るい橙)
    const sky = ctx.createLinearGradient(0, 0, 0, s.horizonY);
    sky.addColorStop(0, '#3a2a6e');
    sky.addColorStop(0.55, '#d9644a');
    sky.addColorStop(1, '#ffc27a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, s.horizonY);

    // 夕日と、そのまわりの光
    const glow = ctx.createRadialGradient(s.sunX, s.sunY, s.sunR * 0.5, s.sunX, s.sunY, s.sunR * 4);
    glow.addColorStop(0, 'rgba(255, 220, 150, 0.7)');
    glow.addColorStop(1, 'rgba(255, 160, 90, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, s.horizonY);
    ctx.fillStyle = '#ffe7a6';
    ctx.beginPath();
    ctx.arc(s.sunX, s.sunY, s.sunR, 0, Math.PI * 2);
    ctx.fill();

    // 島(水平線の上のシルエット。沈まず、同じ大きさ・同じ濃さで残る)
    ctx.save();
    ctx.globalAlpha = s.islandAlpha;
    ctx.fillStyle = '#25193a';
    const iw = ENDING_ISLAND_WIDTH * s.islandScale;
    const ih = 62 * s.islandScale;
    ctx.beginPath();
    ctx.moveTo(s.islandX - iw / 2, s.horizonY);
    ctx.quadraticCurveTo(s.islandX, s.horizonY - ih * 1.6, s.islandX + iw / 2, s.horizonY);
    ctx.closePath();
    ctx.fill();
    // ヤシの木
    ctx.fillRect(s.islandX + iw * 0.1, s.horizonY - ih * 1.45, 3 * s.islandScale + 1, ih * 0.9);
    ctx.beginPath();
    ctx.arc(s.islandX + iw * 0.1 + 1, s.horizonY - ih * 1.45, 14 * s.islandScale + 1, Math.PI, 0);
    ctx.fill();
    ctx.restore();

    // 海(水平線の橙 → 手前の濃い青)
    const sea = ctx.createLinearGradient(0, s.horizonY, 0, H);
    sea.addColorStop(0, '#e08a58');
    sea.addColorStop(0.35, '#7a4a6a');
    sea.addColorStop(1, '#241f4a');
    ctx.fillStyle = sea;
    ctx.fillRect(0, s.horizonY, W, H - s.horizonY);

    // 夕日の照り返し(縦に並ぶ光の筋。波でゆれる)
    for (let i = 0; i < 9; i++) {
      const y = s.horizonY + 6 + i * 16;
      const w = (70 - i * 5) * (1 + 0.15 * Math.sin(s.wave * 2 + i));
      ctx.fillStyle = `rgba(255, 220, 150, ${0.5 - i * 0.045})`;
      ctx.fillRect(s.sunX - w / 2 + 5 * Math.sin(s.wave * 1.5 + i), y, w, 4);
    }

    // 波の線(ゆっくり動く)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 7; row++) {
      const y = s.horizonY + 24 + row * 34;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = y + 3 * Math.sin(x * 0.03 + s.wave * 1.2 + row);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // イカダとプレイヤー(ゆっくり上下にゆれる)
    const k = s.raftScale;
    const bob = 3 * Math.sin(s.wave * 2) * k;
    const rx = s.raftX;
    const ry = s.raftY + bob;
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(rx - 70 * k, ry - 4 * k, 140 * k, 16 * k);
    ctx.fillStyle = '#6b431e';
    for (let i = 1; i < 5; i++) ctx.fillRect(rx - 70 * k + i * 28 * k, ry - 4 * k, 2 * k + 0.5, 16 * k);
    const sheet = this.assets.playerSheet;
    if (sheet) {
      // 新しいイメージ: 待機の動きのコマで、島の方(左)を向いて、イカダの倍率で小さくなる。足元はイカダの上面
      const frames = sheet.atlas.clips.idle;
      const frame = frames[Math.floor(Math.max(t, 0) / ENDING_IDLE_PERIOD) % frames.length]!;
      const kk = (ENDING_PLAYER_HEIGHT * k) / sheet.atlas.referenceHeight;
      const footX = rx;
      const footY = ry - 4 * k;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.translate(footX, 0);
      ctx.scale(-1, 1); // 左向き(島の方向)
      ctx.drawImage(sheet.image, frame.x, frame.y, frame.w, frame.h, -frame.fx * kk, footY - frame.fy * kk, frame.w * kk, frame.h * kk);
      ctx.restore();
    } else {
      ctx.fillStyle = '#d2362b';
      ctx.fillRect(rx - 10 * k, ry - 4 * k - 34 * k, 20 * k, 34 * k); // 立っているプレイヤー(シートがないとき)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx - 5 * k, ry - 4 * k - 26 * k, 4 * k + 0.5, 5 * k + 0.5);
      ctx.fillRect(rx + 2 * k, ry - 4 * k - 26 * k, 4 * k + 0.5, 5 * k + 0.5);
    }

    // 鳥(小さな V 字)
    ctx.strokeStyle = '#2a1a3a';
    ctx.lineWidth = 2;
    for (const b of s.birds) {
      const up = 6 * b.flap;
      ctx.beginPath();
      ctx.moveTo(b.x - 10, b.y - up);
      ctx.quadraticCurveTo(b.x - 4, b.y - up - 4, b.x, b.y);
      ctx.quadraticCurveTo(b.x + 4, b.y - up - 4, b.x + 10, b.y - up);
      ctx.stroke();
    }

    // メッセージ(静かに現れて、消える)
    for (const m of s.messages) {
      if (m.alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = m.alpha;
      this.text(m.text, W / 2, 56, 30, 'center', '#fff3e0');
      ctx.restore();
    }

    // 終わりの暗転
    if (s.fadeOut > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${s.fadeOut * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private overlay(): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  }

  private drawTitle(invincible: boolean): void {
    this.overlay();
    this.text('無人島脱出', VIEW_WIDTH / 2, 130, 72, 'center');
    this.text('Enter キーでスタート', VIEW_WIDTH / 2, 250, 32, 'center');
    this.text('← → / A D: 移動    Space: ジャンプ', VIEW_WIDTH / 2, 340, 22, 'center');
    this.text('ボスを上から踏んで倒し、イカダの部品を手に入れよう', VIEW_WIDTH / 2, 380, 22, 'center');
    this.text('イカダを完成させて、右端の海から脱出しよう', VIEW_WIDTH / 2, 420, 22, 'center');
    if (invincible) this.text('無敵モード', VIEW_WIDTH / 2, 470, 28, 'center', '#ffd700');
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
