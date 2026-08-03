export type QualityTier = 0 | 1 | 2;

function detectChromium(): boolean {
  const ua = navigator.userAgent;
  // True Chrome / Edge / Opera — not Firefox, not Safari-only
  if (/Firefox\//.test(ua)) return false;
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/CriOS\//.test(ua)) {
    return false;
  }
  return /Chrome\/|CriOS\/|Edg\/|OPR\//.test(ua);
}

function detectMobile(): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Adaptive graphics — non-Chromium browsers start lower;
 * tiers move with smoothed FPS.
 */
export class GraphicsQuality {
  tier: QualityTier;
  readonly isChromium: boolean;
  readonly isMobile: boolean;
  private fpsEma = 60;
  private cooldown = 3;
  private readonly maxTier: QualityTier;

  constructor() {
    this.isChromium = detectChromium();
    this.isMobile = detectMobile();
    const cores = navigator.hardwareConcurrency || 4;

    if (this.isMobile && !this.isChromium) {
      this.tier = 0;
      this.maxTier = 1;
    } else if (!this.isChromium || this.isMobile || cores <= 4) {
      this.tier = 1;
      this.maxTier = this.isChromium ? 2 : 1;
    } else {
      this.tier = 2;
      this.maxTier = 2;
    }
  }

  get dprCap(): number {
    return ([1, 1.15, 1.5] as const)[this.tier];
  }

  get antialias(): boolean {
    return this.tier >= 2;
  }

  get shadows(): boolean {
    return this.tier >= 1;
  }

  get softShadows(): boolean {
    return this.tier >= 2;
  }

  get shadowMapSize(): number {
    return this.tier >= 2 ? 1024 : 512;
  }

  get maxLamps(): number {
    return ([6, 12, 22] as const)[this.tier];
  }

  get lampDist(): number {
    return ([48, 68, 85] as const)[this.tier];
  }

  get rainFraction(): number {
    return ([0.22, 0.45, 1] as const)[this.tier];
  }

  get pedCount(): number {
    return ([40, 65, 100] as const)[this.tier];
  }

  get wrapMargin(): number {
    return ([50, 72, 95] as const)[this.tier];
  }

  get fps(): number {
    return this.fpsEma;
  }

  /** Returns true when tier changed */
  update(dt: number): boolean {
    if (dt > 0 && dt < 0.2) {
      const fps = 1 / dt;
      this.fpsEma = this.fpsEma * 0.92 + fps * 0.08;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0) return false;

    let next: QualityTier = this.tier;
    if (this.fpsEma < 38 && this.tier > 0) {
      next = (this.tier - 1) as QualityTier;
    } else if (this.fpsEma > 54 && this.tier < this.maxTier) {
      next = (this.tier + 1) as QualityTier;
    }

    if (next !== this.tier) {
      this.tier = next;
      this.cooldown = 2.8;
      return true;
    }
    this.cooldown = 0.8;
    return false;
  }
}
