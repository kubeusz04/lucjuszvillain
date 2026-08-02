/** GTA-style wanted star tiers */
export interface WantedTier {
  stars: number;
  cops: number;
  aggression: number;
  spawnDistMin: number;
  spawnDistMax: number;
  spawnCooldown: number;
  /** Heat decay per second when not committing crime */
  decay: number;
  label: string;
}

export const WANTED_TIERS: WantedTier[] = [
  {
    stars: 0,
    cops: 0,
    aggression: 0,
    spawnDistMin: 50,
    spawnDistMax: 80,
    spawnCooldown: 2,
    decay: 0.15,
    label: "Clean",
  },
  {
    stars: 1,
    cops: 1,
    aggression: 1,
    spawnDistMin: 40,
    spawnDistMax: 70,
    spawnCooldown: 2.2,
    decay: 0.14,
    label: "Patrol",
  },
  {
    stars: 2,
    cops: 2,
    aggression: 2,
    spawnDistMin: 35,
    spawnDistMax: 60,
    spawnCooldown: 1.8,
    decay: 0.12,
    label: "Chase",
  },
  {
    stars: 3,
    cops: 3,
    aggression: 3,
    spawnDistMin: 28,
    spawnDistMax: 55,
    spawnCooldown: 1.4,
    decay: 0.1,
    label: "Siege",
  },
  {
    stars: 4,
    cops: 4,
    aggression: 4,
    spawnDistMin: 22,
    spawnDistMax: 48,
    spawnCooldown: 1.1,
    decay: 0.08,
    label: "Lockdown",
  },
  {
    stars: 5,
    cops: 5,
    aggression: 5.5,
    spawnDistMin: 18,
    spawnDistMax: 40,
    spawnCooldown: 0.85,
    decay: 0.06,
    label: "Max Alert",
  },
];

export function tierForStars(stars: number): WantedTier {
  const s = Math.max(0, Math.min(5, stars));
  return WANTED_TIERS[s];
}

export interface WantedUpdate {
  stars: number;
  /** 0..1 progress within current star toward the next */
  progress: number;
  /** True when about to lose a star (heat near floor) */
  flashing: boolean;
  /** Fired once when stars increase */
  gainedStar: boolean;
  /** Fired once when stars decrease */
  lostStar: boolean;
  label: string;
  tier: WantedTier;
}

export class WantedSystem {
  heat = 0;
  private decayPause = 0;
  private prevStars = 0;

  get stars(): number {
    return Math.min(5, Math.floor(this.heat));
  }

  get tier(): WantedTier {
    return tierForStars(this.stars);
  }

  onCrime(intensity = 0.45): void {
    const before = this.stars;
    this.heat = Math.min(5.35, this.heat + intensity);
    this.decayPause = 3.5 + this.stars * 0.6;
    // Ensure crossing into a new star feels snappy
    if (this.stars > before) {
      this.heat = Math.max(this.heat, this.stars + 0.05);
    }
  }

  update(dt: number): WantedUpdate {
    if (this.decayPause > 0) {
      this.decayPause -= dt;
    } else if (this.heat > 0) {
      this.heat = Math.max(0, this.heat - this.tier.decay * dt);
    }

    const stars = this.stars;
    const frac = this.heat - stars;
    const progress = stars >= 5 ? 1 : frac;
    // Flash when heat is close to dropping below current star
    const flashing =
      stars > 0 && this.decayPause <= 0 && frac < 0.28 && frac > 0.001;

    const gainedStar = stars > this.prevStars;
    const lostStar = stars < this.prevStars;
    this.prevStars = stars;

    const tier = tierForStars(stars);
    return {
      stars,
      progress,
      flashing,
      gainedStar,
      lostStar,
      label: tier.label,
      tier,
    };
  }

  reset(): void {
    this.heat = 0;
    this.decayPause = 0;
    this.prevStars = 0;
  }
}
