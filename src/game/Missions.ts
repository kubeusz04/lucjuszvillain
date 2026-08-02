import type { DistrictId } from "../world/Districts";
import { DISTRICTS } from "../world/Districts";

export type MissionKind =
  | "hits"
  | "district"
  | "districts"
  | "speed_hits"
  | "wanted"
  | "score"
  | "kimchi";

export interface MissionDef {
  id: string;
  kind: MissionKind;
  title: string;
  /** Target amount (hits, districts, stars, score, etc.) */
  target: number;
  /** Optional district for district missions */
  districtId?: DistrictId;
  /** Min speed for speed_hits */
  minSpeed?: number;
  rewardScore: number;
  rewardCash: number;
}

export interface MissionProgress {
  def: MissionDef;
  current: number;
  done: boolean;
}

function pickDistrict(): DistrictId {
  return DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)].id;
}

function districtName(id: DistrictId): string {
  return DISTRICTS.find((d) => d.id === id)?.name ?? id;
}

/** Build a random mission from the pool */
export function createRandomMission(excludeIds: string[] = []): MissionDef {
  const districtId = pickDistrict();
  const pool: MissionDef[] = [
    {
      id: "hits_8",
      kind: "hits",
      title: "Run over 8 pedestrians",
      target: 8,
      rewardScore: 15,
      rewardCash: 40,
    },
    {
      id: "hits_15",
      kind: "hits",
      title: "Run over 15 pedestrians",
      target: 15,
      rewardScore: 30,
      rewardCash: 80,
    },
    {
      id: "district_visit",
      kind: "district",
      title: `Drive to: ${districtName(districtId)}`,
      target: 1,
      districtId,
      rewardScore: 12,
      rewardCash: 35,
    },
    {
      id: "districts_3",
      kind: "districts",
      title: "Visit 3 districts",
      target: 3,
      rewardScore: 20,
      rewardCash: 55,
    },
    {
      id: "districts_5",
      kind: "districts",
      title: "Visit 5 districts",
      target: 5,
      rewardScore: 40,
      rewardCash: 100,
    },
    {
      id: "speed_hits",
      kind: "speed_hits",
      title: "3 victims at high speed",
      target: 3,
      minSpeed: 22,
      rewardScore: 25,
      rewardCash: 70,
    },
    {
      id: "wanted_2",
      kind: "wanted",
      title: "Reach 2★ wanted",
      target: 2,
      rewardScore: 18,
      rewardCash: 50,
    },
    {
      id: "wanted_4",
      kind: "wanted",
      title: "Reach 4★ wanted",
      target: 4,
      rewardScore: 35,
      rewardCash: 90,
    },
    {
      id: "score_25",
      kind: "score",
      title: "Score 25 points",
      target: 25,
      rewardScore: 20,
      rewardCash: 60,
    },
    {
      id: "score_40",
      kind: "score",
      title: "Score 40 points",
      target: 40,
      rewardScore: 35,
      rewardCash: 100,
    },
    {
      id: "kimchi_5",
      kind: "kimchi",
      title: "Collect 5 kimchi jars",
      target: 5,
      rewardScore: 15,
      rewardCash: 45,
    },
    {
      id: "kimchi_10",
      kind: "kimchi",
      title: "Collect 10 kimchi jars",
      target: 10,
      rewardScore: 28,
      rewardCash: 80,
    },
  ];

  const available = pool.filter((m) => !excludeIds.includes(m.id));
  const list = available.length > 0 ? available : pool;
  const base = list[Math.floor(Math.random() * list.length)];

  // Fresh district id each time for district missions
  if (base.kind === "district") {
    const id = pickDistrict();
    return {
      ...base,
      id: `district_${id}_${Date.now()}`,
      districtId: id,
      title: `Drive to: ${districtName(id)}`,
    };
  }
  return { ...base, id: `${base.id}_${Date.now()}` };
}

export class MissionSystem {
  current: MissionProgress | null = null;
  completed = 0;
  private recentIds: string[] = [];
  private visited = new Set<DistrictId>();

  startRound(): void {
    this.completed = 0;
    this.visited.clear();
    this.recentIds = [];
    this.assignNext();
  }

  private assignNext(): void {
    const def = createRandomMission(this.recentIds);
    this.recentIds.push(def.id.split("_").slice(0, 2).join("_"));
    if (this.recentIds.length > 4) this.recentIds.shift();
    this.current = { def, current: 0, done: false };
    this.visited.clear();
  }

  get label(): string {
    if (!this.current) return "";
    const { def, current, done } = this.current;
    if (done) return `✓ ${def.title}`;
    return `${def.title} (${Math.min(current, def.target)}/${def.target})`;
  }

  /** Returns reward if mission just completed */
  onHit(speed: number): { score: number; cash: number } | null {
    if (!this.current || this.current.done) return null;
    const m = this.current;
    if (m.def.kind === "hits") {
      m.current += 1;
    } else if (m.def.kind === "speed_hits") {
      if (Math.abs(speed) >= (m.def.minSpeed ?? 20)) m.current += 1;
    }
    return this.checkComplete();
  }

  onDistrict(districtId: DistrictId): { score: number; cash: number } | null {
    if (!this.current || this.current.done) return null;
    const m = this.current;

    if (m.def.kind === "district" && m.def.districtId === districtId) {
      m.current = 1;
      return this.checkComplete();
    }

    if (m.def.kind === "districts") {
      const before = this.visited.size;
      this.visited.add(districtId);
      if (this.visited.size > before) {
        m.current = this.visited.size;
        return this.checkComplete();
      }
    }
    return null;
  }

  onWanted(stars: number): { score: number; cash: number } | null {
    if (!this.current || this.current.done) return null;
    if (this.current.def.kind === "wanted") {
      this.current.current = Math.max(this.current.current, stars);
      return this.checkComplete();
    }
    return null;
  }

  onScore(score: number): { score: number; cash: number } | null {
    if (!this.current || this.current.done) return null;
    if (this.current.def.kind === "score") {
      this.current.current = score;
      return this.checkComplete();
    }
    return null;
  }

  onKimchi(count: number): { score: number; cash: number } | null {
    if (!this.current || this.current.done || count <= 0) return null;
    if (this.current.def.kind === "kimchi") {
      this.current.current += count;
      return this.checkComplete();
    }
    return null;
  }

  private checkComplete(): { score: number; cash: number } | null {
    if (!this.current || this.current.done) return null;
    if (this.current.current < this.current.def.target) return null;

    this.current.done = true;
    this.current.current = this.current.def.target;
    this.completed += 1;
    const reward = {
      score: this.current.def.rewardScore,
      cash: this.current.def.rewardCash,
    };
    // Queue next mission shortly — caller can assignNext after toast
    return reward;
  }

  nextMission(): void {
    this.assignNext();
  }
}
