export type UpgradeId = "engine" | "turbo" | "tires" | "brakes" | "armor";
export type PaintId = "crimson" | "midnight" | "toxic" | "ivory" | "violet" | "gold";
export type StyleId = "spoiler" | "neon" | "rims";

export type ShopKind = "performance" | "paint" | "style";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  maxLevel: number;
}

export const UPGRADE_DEFS: UpgradeDef[] = [
  {
    id: "engine",
    name: "Engine",
    desc: "Higher top speed",
    maxLevel: 5,
  },
  {
    id: "turbo",
    name: "Turbo",
    desc: "Faster acceleration",
    maxLevel: 5,
  },
  {
    id: "tires",
    name: "Tracks",
    desc: "Better turning for the tank",
    maxLevel: 5,
  },
  {
    id: "brakes",
    name: "Brakes",
    desc: "Stronger braking",
    maxLevel: 5,
  },
  {
    id: "armor",
    name: "Armor",
    desc: "More lives and longer protection after a hit",
    maxLevel: 5,
  },
];

export interface PaintDef {
  id: PaintId;
  name: string;
  color: number;
  metalness: number;
  cost: number;
}

export const PAINT_DEFS: PaintDef[] = [
  { id: "crimson", name: "Crimson", color: 0x8b1a1a, metalness: 0.35, cost: 0 },
  { id: "midnight", name: "Midnight", color: 0x1a2233, metalness: 0.55, cost: 60 },
  { id: "toxic", name: "Toxic", color: 0x2a8a3a, metalness: 0.4, cost: 80 },
  { id: "ivory", name: "Ivory", color: 0xd8d0c0, metalness: 0.25, cost: 70 },
  { id: "violet", name: "Violet", color: 0x5a1a6a, metalness: 0.5, cost: 90 },
  { id: "gold", name: "Gold", color: 0xc4a050, metalness: 0.75, cost: 150 },
];

export interface StyleDef {
  id: StyleId;
  name: string;
  desc: string;
  cost: number;
}

export const STYLE_DEFS: StyleDef[] = [
  {
    id: "spoiler",
    name: "Rear Crate",
    desc: "Extra cargo box — looks + a bit of stability",
    cost: 100,
  },
  {
    id: "neon",
    name: "Underglow",
    desc: "Neon underbody lights",
    cost: 120,
  },
  {
    id: "rims",
    name: "Chrome Tracks",
    desc: "Shiny track rollers",
    cost: 90,
  },
];

export interface CarStats {
  accel: number;
  brake: number;
  reverse: number;
  maxSpeed: number;
  maxReverse: number;
  friction: number;
  turnRate: number;
  /** Base lives this round (armor adds more) */
  maxLives: number;
  /** Seconds of invulnerability after a police ram */
  hitInvuln: number;
}

export interface CarVisuals {
  paint: PaintId;
  spoiler: boolean;
  neon: boolean;
  rims: boolean;
}

import type { Progress } from "./Progress";

export class UpgradeSystem {
  cash = 0;
  levels: Record<UpgradeId, number> = {
    engine: 0,
    turbo: 0,
    tires: 0,
    brakes: 0,
    armor: 0,
  };
  paint: PaintId = "crimson";
  /** Equipped style parts */
  styles: Record<StyleId, boolean> = {
    spoiler: false,
    neon: false,
    rims: false,
  };
  ownedStyles: Record<StyleId, boolean> = {
    spoiler: false,
    neon: false,
    rims: false,
  };
  ownedPaints: Set<PaintId> = new Set(["crimson"]);
  private progress: Progress;

  constructor(progress: Progress) {
    this.progress = progress;
    this.loadFromProgress();
  }

  loadFromProgress(): void {
    const d = this.progress.data;
    this.cash = Math.max(0, d.cash);
    for (const id of Object.keys(this.levels) as UpgradeId[]) {
      const v = d.levels[id];
      if (typeof v === "number") {
        this.levels[id] = Math.max(0, Math.min(5, Math.floor(v)));
      }
    }
    if (PAINT_DEFS.some((p) => p.id === d.paint)) this.paint = d.paint;
    this.ownedPaints = new Set(d.ownedPaints ?? ["crimson"]);
    this.ownedPaints.add("crimson");
    this.ownedPaints.add(this.paint);
    for (const id of Object.keys(this.styles) as StyleId[]) {
      this.styles[id] = Boolean(d.styles[id]);
      this.ownedStyles[id] = Boolean(
        d.ownedStyles?.[id] || d.styles[id],
      );
    }
  }

  cost(id: UpgradeId): number {
    const level = this.levels[id];
    const def = UPGRADE_DEFS.find((d) => d.id === id)!;
    if (level >= def.maxLevel) return Infinity;
    return Math.floor(20 * Math.pow(1.75, level) + level * 15);
  }

  canBuy(id: UpgradeId): boolean {
    const def = UPGRADE_DEFS.find((d) => d.id === id)!;
    return this.levels[id] < def.maxLevel && this.cash >= this.cost(id);
  }

  buy(id: UpgradeId): boolean {
    if (!this.canBuy(id)) return false;
    this.cash -= this.cost(id);
    this.levels[id] += 1;
    this.save();
    return true;
  }

  ownsPaint(id: PaintId): boolean {
    return this.ownedPaints.has(id);
  }

  canBuyPaint(id: PaintId): boolean {
    if (this.paint === id) return false;
    if (this.ownsPaint(id)) return true;
    const def = PAINT_DEFS.find((p) => p.id === id)!;
    return this.cash >= def.cost;
  }

  buyPaint(id: PaintId): boolean {
    if (!this.canBuyPaint(id)) return false;
    if (!this.ownsPaint(id)) {
      const def = PAINT_DEFS.find((p) => p.id === id)!;
      this.cash -= def.cost;
      this.ownedPaints.add(id);
    }
    this.paint = id;
    this.save();
    return true;
  }

  ownsStyle(id: StyleId): boolean {
    return this.ownedStyles[id];
  }

  canBuyStyle(id: StyleId): boolean {
    if (this.ownedStyles[id]) return false;
    const def = STYLE_DEFS.find((s) => s.id === id)!;
    return this.cash >= def.cost;
  }

  buyStyle(id: StyleId): boolean {
    if (!this.canBuyStyle(id)) return false;
    const def = STYLE_DEFS.find((s) => s.id === id)!;
    this.cash -= def.cost;
    this.ownedStyles[id] = true;
    this.styles[id] = true;
    this.save();
    return true;
  }

  /** Toggle an owned style part on/off */
  toggleStyle(id: StyleId): boolean {
    if (!this.ownedStyles[id]) return false;
    this.styles[id] = !this.styles[id];
    this.save();
    return true;
  }

  /** Unequip all style parts (keeps ownership) + default paint */
  clearCosmetics(): boolean {
    let changed = false;
    for (const id of Object.keys(this.styles) as StyleId[]) {
      if (this.styles[id]) {
        this.styles[id] = false;
        changed = true;
      }
    }
    if (this.paint !== "crimson") {
      this.paint = "crimson";
      changed = true;
    }
    if (changed) this.save();
    return changed;
  }

  addCash(amount: number): void {
    this.cash += amount;
    this.save();
  }

  getStats(): CarStats {
    const e = this.levels.engine;
    const t = this.levels.turbo;
    const ti = this.levels.tires;
    const b = this.levels.brakes;
    const a = this.levels.armor;
    const spoilerBonus = this.styles.spoiler ? 0.15 : 0;
    return {
      accel: 22 + t * 4,
      brake: 36 + b * 8,
      reverse: 10 + t * 1.2,
      maxSpeed: 26 + e * 4,
      maxReverse: 9 + e * 1.2,
      friction: 14 + (this.styles.spoiler ? 1.5 : 0),
      turnRate: 1.85 + ti * 0.35 + spoilerBonus,
      maxLives: 3 + a,
      hitInvuln: 1.35 + a * 0.25,
    };
  }

  getVisuals(): CarVisuals {
    return {
      paint: this.paint,
      spoiler: this.styles.spoiler,
      neon: this.styles.neon,
      rims: this.styles.rims,
    };
  }

  private save(): void {
    this.progress.data.cash = this.cash;
    this.progress.data.levels = { ...this.levels };
    this.progress.data.paint = this.paint;
    this.progress.data.styles = { ...this.styles };
    this.progress.data.ownedStyles = { ...this.ownedStyles };
    this.progress.data.ownedPaints = [...this.ownedPaints];
    this.progress.save();
  }
}
