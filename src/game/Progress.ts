import type { PaintId, StyleId, UpgradeId } from "./Upgrades";

export interface ProgressStats {
  missionsCompleted: number;
  totalHits: number;
  totalRuns: number;
  playTimeSec: number;
  bestWanted: number;
}

export interface SaveData {
  version: 1;
  cash: number;
  levels: Record<UpgradeId, number>;
  paint: PaintId;
  /** Currently equipped style parts */
  styles: Record<StyleId, boolean>;
  /** Purchased style parts (can toggle off) */
  ownedStyles: Record<StyleId, boolean>;
  /** Purchased paints (re-equip free) */
  ownedPaints: PaintId[];
  highscore: number;
  stats: ProgressStats;
  savedAt: number;
}

const STORAGE_KEY = "villain-drive-save-v1";

function defaultOwnedStyles(): Record<StyleId, boolean> {
  return { spoiler: false, neon: false, rims: false };
}

function defaultSave(): SaveData {
  return {
    version: 1,
    cash: 0,
    levels: {
      engine: 0,
      turbo: 0,
      tires: 0,
      brakes: 0,
      armor: 0,
    },
    paint: "crimson",
    styles: defaultOwnedStyles(),
    ownedStyles: defaultOwnedStyles(),
    ownedPaints: ["crimson"],
    highscore: 0,
    stats: {
      missionsCompleted: 0,
      totalHits: 0,
      totalRuns: 0,
      playTimeSec: 0,
      bestWanted: 0,
    },
    savedAt: Date.now(),
  };
}

export class Progress {
  data: SaveData = defaultSave();

  constructor() {
    this.load();
  }

  get hasSave(): boolean {
    return (
      this.data.stats.totalRuns > 0 ||
      this.data.cash > 0 ||
      this.data.highscore > 0 ||
      Object.values(this.data.levels).some((v) => v > 0)
    );
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        this.data = this.merge(defaultSave(), parsed);
        return;
      }
      // Migrate older keys
      this.migrateLegacy();
    } catch {
      this.data = defaultSave();
    }
  }

  save(): void {
    this.data.savedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }

  reset(): void {
    this.data = defaultSave();
    this.save();
    try {
      localStorage.removeItem("villain-drive-upgrades-v1");
      localStorage.removeItem("villain-drive-upgrades-v2");
      localStorage.removeItem("villain-drive-highscore-v1");
    } catch {
      /* ignore */
    }
  }

  recordRun(): void {
    this.data.stats.totalRuns += 1;
    this.save();
  }

  recordHit(count = 1): void {
    this.data.stats.totalHits += count;
    this.save();
  }

  recordMission(): void {
    this.data.stats.missionsCompleted += 1;
    this.save();
  }

  recordPlayTime(dt: number): void {
    this.data.stats.playTimeSec += dt;
  }

  /** Flush playtime periodically */
  flushPlayTime(): void {
    this.save();
  }

  recordWanted(stars: number): void {
    if (stars > this.data.stats.bestWanted) {
      this.data.stats.bestWanted = stars;
      this.save();
    }
  }

  submitScore(score: number): boolean {
    if (score > this.data.highscore) {
      this.data.highscore = score;
      this.save();
      return true;
    }
    return false;
  }

  private merge(base: SaveData, partial: Partial<SaveData>): SaveData {
    const styles = { ...base.styles, ...(partial.styles ?? {}) };
    const ownedStyles = {
      ...base.ownedStyles,
      ...(partial.ownedStyles ?? {}),
    };
    // Legacy saves only had styles — treat equipped as owned
    if (!partial.ownedStyles && partial.styles) {
      for (const id of Object.keys(styles) as StyleId[]) {
        if (styles[id]) ownedStyles[id] = true;
      }
    }
    const ownedPaints = new Set<PaintId>(
      partial.ownedPaints ?? base.ownedPaints,
    );
    ownedPaints.add("crimson");
    if (partial.paint) ownedPaints.add(partial.paint);
    if (!partial.ownedPaints && partial.paint) {
      ownedPaints.add(partial.paint);
    }

    return {
      ...base,
      ...partial,
      levels: { ...base.levels, ...(partial.levels ?? {}) },
      styles,
      ownedStyles,
      ownedPaints: [...ownedPaints],
      stats: { ...base.stats, ...(partial.stats ?? {}) },
      version: 1,
    };
  }

  private migrateLegacy(): void {
    const data = defaultSave();
    try {
      const hs = localStorage.getItem("villain-drive-highscore-v1");
      if (hs) {
        const n = Number(hs);
        if (Number.isFinite(n) && n > 0) data.highscore = Math.floor(n);
      }
      const up =
        localStorage.getItem("villain-drive-upgrades-v2") ??
        localStorage.getItem("villain-drive-upgrades-v1");
      if (up) {
        const parsed = JSON.parse(up) as {
          cash?: number;
          levels?: Partial<Record<UpgradeId, number>>;
          paint?: PaintId;
          styles?: Partial<Record<StyleId, boolean>>;
        };
        if (typeof parsed.cash === "number") data.cash = parsed.cash;
        if (parsed.levels) data.levels = { ...data.levels, ...parsed.levels };
        if (parsed.paint) data.paint = parsed.paint;
        if (parsed.styles) {
          data.styles = { ...data.styles, ...parsed.styles };
          for (const id of Object.keys(parsed.styles) as StyleId[]) {
            if (parsed.styles[id]) data.ownedStyles[id] = true;
          }
        }
        if (parsed.paint) {
          if (!data.ownedPaints.includes(parsed.paint)) {
            data.ownedPaints.push(parsed.paint);
          }
        }
      }
    } catch {
      /* ignore */
    }
    this.data = data;
    this.save();
  }
}
