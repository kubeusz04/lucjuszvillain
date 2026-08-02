import type { CityConfig } from "../world/City";
import { blockOrigin } from "../world/City";

export interface MinimapBlip {
  x: number;
  z: number;
  /** Optional facing (radians, Three.js Y) for player arrow */
  heading?: number;
}

const SIZE = 148;

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly citySize: number;
  private readonly cfg: CityConfig;

  constructor(citySize: number, cfg: CityConfig) {
    this.citySize = citySize;
    this.cfg = cfg;
    this.canvas = document.getElementById("minimap") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
  }

  setVisible(visible: boolean): void {
    this.canvas.classList.toggle("hidden", !visible);
  }

  draw(opts: {
    player: MinimapBlip;
    cops: MinimapBlip[];
    kimchi: MinimapBlip[];
    shops: MinimapBlip[];
  }): void {
    const ctx = this.ctx;
    const s = this.citySize;
    const scale = SIZE / s;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = "#12161c";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Block fills (subtle)
    ctx.fillStyle = "#1a2028";
    for (let bx = 0; bx < this.cfg.blocks; bx++) {
      for (let bz = 0; bz < this.cfg.blocks; bz++) {
        const ox = blockOrigin(bx, this.cfg) * scale;
        const oz = blockOrigin(bz, this.cfg) * scale;
        const bs = this.cfg.blockSize * scale;
        ctx.fillRect(ox, oz, bs, bs);
      }
    }

    // Roads
    ctx.fillStyle = "#2a3038";
    const rw = this.cfg.roadWidth * scale;
    for (let i = 0; i <= this.cfg.blocks; i++) {
      const o = i * (this.cfg.blockSize + this.cfg.roadWidth) * scale;
      ctx.fillRect(0, o, SIZE, rw);
      ctx.fillRect(o, 0, rw, SIZE);
    }

    // Kimchi
    for (const k of opts.kimchi) {
      const p = this.toMap(k.x, k.z, scale);
      ctx.fillStyle = "#c45c3a";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shops
    for (const shop of opts.shops) {
      const p = this.toMap(shop.x, shop.z, scale);
      ctx.fillStyle = "#d4a574";
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    }

    // Cops
    for (const cop of opts.cops) {
      const p = this.toMap(cop.x, cop.z, scale);
      ctx.fillStyle = "#3a6ad4";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#88aaff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Player (triangle facing heading)
    const pp = this.toMap(opts.player.x, opts.player.z, scale);
    const heading = opts.player.heading ?? 0;
    ctx.save();
    ctx.translate(pp.x, pp.y);
    // Map Z is down; Three heading 0 looks +Z → down on map
    ctx.rotate(heading);
    ctx.fillStyle = "#e8e4dc";
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-4, -5);
    ctx.lineTo(4, -5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c45c3a";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // Border
    ctx.strokeStyle = "rgba(196, 92, 58, 0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  }

  private toMap(x: number, z: number, scale: number): { x: number; y: number } {
    return {
      x: x * scale,
      y: z * scale,
    };
  }
}
