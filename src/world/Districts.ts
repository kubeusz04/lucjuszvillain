export type DistrictId =
  | "oldtown"
  | "downtown"
  | "docks"
  | "gardens"
  | "housing"
  | "neon";

export interface DistrictStyle {
  id: DistrictId;
  name: string;
  colors: number[];
  glow: number;
  minHeight: number;
  maxHeight: number;
  minCount: number;
  maxCount: number;
  ground: number;
  curb: number;
  lamp: number;
  metalness: number;
  roughness: number;
  /** Extra props: trees / crates / neon strips */
  props: "none" | "trees" | "crates" | "neon";
}

export const DISTRICTS: DistrictStyle[] = [
  {
    id: "oldtown",
    name: "Old Town",
    colors: [0x4a3428, 0x3d2e24, 0x5a4030, 0x2e241c, 0x6a4838],
    glow: 0xffaa66,
    minHeight: 5,
    maxHeight: 14,
    minCount: 3,
    maxCount: 5,
    ground: 0x2a241c,
    curb: 0x6a5e50,
    lamp: 0xffb060,
    metalness: 0.08,
    roughness: 0.88,
    props: "none",
  },
  {
    id: "downtown",
    name: "Downtown",
    colors: [0x1c2430, 0x243040, 0x2a3548, 0x1a222c, 0x303848],
    glow: 0x88ccff,
    minHeight: 18,
    maxHeight: 42,
    minCount: 1,
    maxCount: 3,
    ground: 0x181c22,
    curb: 0x4a5058,
    lamp: 0xaaccff,
    metalness: 0.45,
    roughness: 0.35,
    props: "none",
  },
  {
    id: "docks",
    name: "Docks",
    colors: [0x3a3a38, 0x4a4038, 0x2e322e, 0x5a4838, 0x34322c],
    glow: 0xff8844,
    minHeight: 4,
    maxHeight: 12,
    minCount: 2,
    maxCount: 4,
    ground: 0x222018,
    curb: 0x5a5248,
    lamp: 0xff9944,
    metalness: 0.55,
    roughness: 0.55,
    props: "crates",
  },
  {
    id: "gardens",
    name: "Gardens",
    colors: [0x2a3428, 0x3a4030, 0x243028, 0x384034, 0x2e382c],
    glow: 0xaadd88,
    minHeight: 4,
    maxHeight: 10,
    minCount: 1,
    maxCount: 2,
    ground: 0x1a2818,
    curb: 0x4a5a40,
    lamp: 0xccffaa,
    metalness: 0.05,
    roughness: 0.9,
    props: "trees",
  },
  {
    id: "housing",
    name: "Housing",
    colors: [0x3a3834, 0x4a4440, 0x2e2c2a, 0x504840, 0x383430],
    glow: 0xffdd99,
    minHeight: 10,
    maxHeight: 22,
    minCount: 3,
    maxCount: 4,
    ground: 0x22201c,
    curb: 0x5a544c,
    lamp: 0xffcc88,
    metalness: 0.12,
    roughness: 0.8,
    props: "none",
  },
  {
    id: "neon",
    name: "Neon District",
    colors: [0x1a1220, 0x221828, 0x2a1a30, 0x18141c, 0x301828],
    glow: 0xff44aa,
    minHeight: 8,
    maxHeight: 28,
    minCount: 2,
    maxCount: 5,
    ground: 0x140e18,
    curb: 0x4a3850,
    lamp: 0xff66cc,
    metalness: 0.35,
    roughness: 0.4,
    props: "neon",
  },
];

/** Map block indices to a district (6 regions on a 12×12 grid). */
export function districtForBlock(bx: number, bz: number, blocks: number): DistrictStyle {
  const hx = blocks / 2;
  const qx = blocks / 4;
  const top = bz < hx;
  const farLeft = bx < qx;
  const farRight = bx >= blocks - qx;

  if (top && farLeft) return DISTRICTS[0]; // oldtown
  if (top && !farLeft && !farRight) return DISTRICTS[1]; // downtown
  if (top && farRight) return DISTRICTS[2]; // docks
  if (!top && farLeft) return DISTRICTS[3]; // gardens
  if (!top && !farLeft && !farRight) return DISTRICTS[4]; // housing
  return DISTRICTS[5]; // neon
}

export function districtAtWorld(
  x: number,
  z: number,
  blocks: number,
  blockSize: number,
  roadWidth: number,
): DistrictStyle {
  const cell = blockSize + roadWidth;
  const bx = Math.floor((x - roadWidth) / cell);
  const bz = Math.floor((z - roadWidth) / cell);
  const cx = Math.max(0, Math.min(blocks - 1, bx));
  const cz = Math.max(0, Math.min(blocks - 1, bz));
  return districtForBlock(cx, cz, blocks);
}
