import { worldToScreen } from '../core/camera';
import {
  BOSS_HEIGHT,
  BOSS_MAX_HP,
  BOSS_WIDTH,
  PART_HEIGHT,
  PART_WIDTH,
  GROUND_Y,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WORLD_WIDTH,
} from '../core/config';
import type { GameState } from '../core/game';

const MARKER_INTERVAL = 160;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
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

  draw(state: GameState, cameraX: number): void {
    const { ctx } = this;
    const { player, boss, parts, partsCollected } = state;

    // 空
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    // 地面
    ctx.fillStyle = '#e0c068';
    ctx.fillRect(0, GROUND_Y, VIEW_WIDTH, VIEW_HEIGHT - GROUND_Y);
    ctx.fillStyle = '#6b8e23';
    ctx.fillRect(0, GROUND_Y, VIEW_WIDTH, 8);

    // スクロールが分かる目印(一定間隔の縦線)
    ctx.fillStyle = '#b8964a';
    const first = Math.floor(cameraX / MARKER_INTERVAL) * MARKER_INTERVAL;
    for (let wx = first; wx <= cameraX + VIEW_WIDTH; wx += MARKER_INTERVAL) {
      if (wx < 0 || wx > WORLD_WIDTH) continue;
      ctx.fillRect(worldToScreen(wx, cameraX) - 2, GROUND_Y + 8, 4, VIEW_HEIGHT - GROUND_Y - 8);
    }

    // ボス「カクレモモジリ」(緑の四角形 + 頭上の残り体力バー)
    if (boss.alive) {
      const bx = worldToScreen(boss.x, cameraX);
      ctx.fillStyle = '#2e8b57';
      ctx.fillRect(bx, boss.y, BOSS_WIDTH, BOSS_HEIGHT);
      const seg = BOSS_WIDTH / BOSS_MAX_HP;
      for (let i = 0; i < BOSS_MAX_HP; i++) {
        ctx.fillStyle = i < boss.hp ? '#ff4d4d' : '#444444';
        ctx.fillRect(bx + i * seg + 1, boss.y - 12, seg - 2, 8);
      }
    }

    // イカダの部品(黄色の小さな四角形)
    for (const part of parts) {
      const px = worldToScreen(part.x, cameraX);
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(px, part.y, PART_WIDTH, PART_HEIGHT);
      ctx.strokeStyle = '#8a6d00';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, part.y + 1, PART_WIDTH - 2, PART_HEIGHT - 2);
    }

    // プレイヤー(四角形)
    ctx.fillStyle = '#d2362b';
    ctx.fillRect(worldToScreen(player.x, cameraX), player.y, PLAYER_WIDTH, PLAYER_HEIGHT);

    // HUD(画面座標の固定位置。カメラの影響を受けない)
    ctx.font = 'bold 24px sans-serif';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#ffffff';
    const label = `イカダの部品: ${partsCollected}`;
    ctx.strokeText(label, 16, 12);
    ctx.fillText(label, 16, 12);
  }
}
