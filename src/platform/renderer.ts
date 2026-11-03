import { worldToScreen } from '../core/camera';
import {
  GROUND_Y,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WORLD_WIDTH,
} from '../core/config';
import type { Player } from '../core/player';

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

  draw(player: Player, cameraX: number): void {
    const { ctx } = this;

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

    // プレイヤー(四角形)
    ctx.fillStyle = '#d2362b';
    ctx.fillRect(worldToScreen(player.x, cameraX), player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
  }
}
