import * as THREE from "three";
import {
  districtAtWorld,
  districtForBlock,
  type DistrictStyle,
} from "./Districts";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type DestKind = "building" | "prop";

export interface Destructible {
  id: number;
  kind: DestKind;
  aabb: AABB;
  alive: boolean;
  /** Index into buildings[] while alive */
  collIndex: number;
}

/** Pedestrian crossing — axis is the direction they walk when crossing */
export interface Crosswalk {
  x: number;
  z: number;
  axis: "x" | "z";
}

export interface CityConfig {
  blocks: number;
  blockSize: number;
  roadWidth: number;
  sidewalkWidth: number;
}

export const DEFAULT_CITY: CityConfig = {
  blocks: 12,
  blockSize: 24,
  roadWidth: 12,
  sidewalkWidth: 1.8,
};

export function cityExtent(cfg: CityConfig): number {
  return cfg.blocks * cfg.blockSize + (cfg.blocks + 1) * cfg.roadWidth;
}

export function blockOrigin(index: number, cfg: CityConfig): number {
  return cfg.roadWidth + index * (cfg.blockSize + cfg.roadWidth);
}
export class City {
  readonly group = new THREE.Group();
  /** Live collision AABBs only (swap-removed on destroy) */
  readonly buildings: AABB[] = [];
  /** Parallel to buildings — destroy id for each collider */
  readonly buildingIds: number[] = [];
  readonly destructibles: Destructible[] = [];
  private readonly idToDest = new Map<number, number>();
  private readonly meshIndex = new Map<number, THREE.Object3D[]>();
  private nextDestroyId = 1;
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly crosswalks: Crosswalk[] = [];
  readonly streetLamps: {
    light: THREE.PointLight;
    bulb: THREE.Mesh;
    baseIntensity: number;
  }[] = [];
  readonly cfg: CityConfig;
  readonly size: number;

  constructor(cfg: CityConfig = DEFAULT_CITY) {
    this.cfg = cfg;
    this.size = cityExtent(cfg);
    this.buildGround();
    this.buildRoadsAndSidewalks();
    this.buildLaneLines();
    this.buildCrosswalks();
    this.buildBuildings();
    this.buildStreetLights();
    this.collectSpawnPoints();
  }

  private buildGround(): void {
    const geo = new THREE.PlaneGeometry(this.size + 40, this.size + 40);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1c18,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.size / 2, -0.05, this.size / 2);
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  private buildRoadsAndSidewalks(): void {
    const { blocks, blockSize, roadWidth, sidewalkWidth } = this.cfg;
    const asphalt = new THREE.MeshStandardMaterial({
      color: 0x1e2228,
      roughness: 0.9,
      metalness: 0.1,
    });

    // Continuous asphalt strips (full city) — no markings
    for (let row = 0; row <= blocks; row++) {
      const z = row * (blockSize + roadWidth);
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(this.size, roadWidth),
        asphalt,
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(this.size / 2, 0.01, z + roadWidth / 2);
      road.receiveShadow = true;
      this.group.add(road);
    }

    for (let col = 0; col <= blocks; col++) {
      const x = col * (blockSize + roadWidth);
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth, this.size),
        asphalt,
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(x + roadWidth / 2, 0.012, this.size / 2);
      road.receiveShadow = true;
      this.group.add(road);
    }

    // Sidewalks + district plazas only along block edges — never across intersections
    for (let bx = 0; bx < blocks; bx++) {
      for (let bz = 0; bz < blocks; bz++) {
        const district = districtForBlock(bx, bz, blocks);
        const ox = blockOrigin(bx, this.cfg);
        const oz = blockOrigin(bz, this.cfg);
        const cx = ox + blockSize / 2;
        const cz = oz + blockSize / 2;

        const plaza = new THREE.Mesh(
          new THREE.PlaneGeometry(blockSize - 0.4, blockSize - 0.4),
          new THREE.MeshStandardMaterial({
            color: district.ground,
            roughness: 0.95,
            metalness: 0.05,
          }),
        );
        plaza.rotation.x = -Math.PI / 2;
        plaza.position.set(cx, 0.02, cz);
        plaza.receiveShadow = true;
        this.group.add(plaza);

        const curb = new THREE.MeshStandardMaterial({
          color: district.curb,
          roughness: 0.85,
          metalness: 0.05,
        });

        for (const side of [-1, 1] as const) {
          const sw = new THREE.Mesh(
            new THREE.BoxGeometry(blockSize, 0.12, sidewalkWidth),
            curb,
          );
          const z =
            side === -1
              ? oz - sidewalkWidth / 2
              : oz + blockSize + sidewalkWidth / 2;
          sw.position.set(cx, 0.06, z);
          sw.receiveShadow = true;
          this.group.add(sw);
        }

        for (const side of [-1, 1] as const) {
          const sw = new THREE.Mesh(
            new THREE.BoxGeometry(sidewalkWidth, 0.12, blockSize),
            curb,
          );
          const x =
            side === -1
              ? ox - sidewalkWidth / 2
              : ox + blockSize + sidewalkWidth / 2;
          sw.position.set(x, 0.065, cz);
          sw.receiveShadow = true;
          this.group.add(sw);
        }
      }
    }
  }

  private buildLaneLines(): void {
    const { blocks, blockSize, roadWidth } = this.cfg;
    const solidMat = new THREE.MeshStandardMaterial({
      color: 0xd8d2c8,
      roughness: 0.95,
      metalness: 0,
    });
    const dashMat = new THREE.MeshStandardMaterial({
      color: 0xc8c0a8,
      roughness: 0.95,
      metalness: 0,
    });

    const y = 0.018;
    const lineW = 0.18;
    const edgeInset = 0.55;
    const dashLen = 2.4;
    const dashGap = 2.2;

    // Horizontal roads: solid edges + dashed center, per block segment (skip intersections)
    for (let row = 0; row <= blocks; row++) {
      const z = row * (blockSize + roadWidth) + roadWidth / 2;
      for (let col = 0; col < blocks; col++) {
        const ox = blockOrigin(col, this.cfg);
        const segLen = blockSize;
        const cx = ox + blockSize / 2;

        // Continuous edge lines
        for (const side of [-1, 1] as const) {
          const edge = new THREE.Mesh(
            new THREE.BoxGeometry(segLen, 0.02, lineW),
            solidMat,
          );
          edge.position.set(
            cx,
            y,
            z + side * (roadWidth / 2 - edgeInset),
          );
          this.group.add(edge);
        }

        // Dashed center line
        let x = ox + 0.4;
        while (x + dashLen < ox + blockSize - 0.2) {
          const dash = new THREE.Mesh(
            new THREE.BoxGeometry(dashLen, 0.02, lineW),
            dashMat,
          );
          dash.position.set(x + dashLen / 2, y, z);
          this.group.add(dash);
          x += dashLen + dashGap;
        }
      }
    }

    // Vertical roads
    for (let col = 0; col <= blocks; col++) {
      const x = col * (blockSize + roadWidth) + roadWidth / 2;
      for (let row = 0; row < blocks; row++) {
        const oz = blockOrigin(row, this.cfg);
        const segLen = blockSize;
        const cz = oz + blockSize / 2;

        for (const side of [-1, 1] as const) {
          const edge = new THREE.Mesh(
            new THREE.BoxGeometry(lineW, 0.02, segLen),
            solidMat,
          );
          edge.position.set(
            x + side * (roadWidth / 2 - edgeInset),
            y,
            cz,
          );
          this.group.add(edge);
        }

        let z = oz + 0.4;
        while (z + dashLen < oz + blockSize - 0.2) {
          const dash = new THREE.Mesh(
            new THREE.BoxGeometry(lineW, 0.02, dashLen),
            dashMat,
          );
          dash.position.set(x, y, z + dashLen / 2);
          this.group.add(dash);
          z += dashLen + dashGap;
        }
      }
    }
  }

  private buildCrosswalks(): void {
    const { blocks, blockSize, roadWidth } = this.cfg;
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xe8e4dc,
      roughness: 0.9,
      metalness: 0.05,
    });
    const stripeCount = 6;
    const stripeThick = 0.65;
    const stripeGap = 0.45;
    const span = roadWidth * 0.88;

    const addZebra = (cx: number, cz: number, axis: "x" | "z") => {
      this.crosswalks.push({ x: cx, z: cz, axis });
      for (let i = 0; i < stripeCount; i++) {
        const offset =
          (i - (stripeCount - 1) / 2) * (stripeThick + stripeGap);
        let mesh: THREE.Mesh;
        if (axis === "z") {
          // Crossing horizontal road — stripes across the road (spaced along Z)
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(span, 0.03, stripeThick),
            stripeMat,
          );
          mesh.position.set(cx, 0.025, cz + offset);
        } else {
          // Crossing vertical road — stripes across the road (spaced along X)
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(stripeThick, 0.03, span),
            stripeMat,
          );
          mesh.position.set(cx + offset, 0.025, cz);
        }
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    };

    // One zebra per road segment (no duplicates from adjacent blocks)
    for (let row = 0; row <= blocks; row++) {
      const z = row * (blockSize + roadWidth) + roadWidth / 2;
      for (let col = 0; col < blocks; col++) {
        const x = blockOrigin(col, this.cfg) + blockSize / 2;
        addZebra(x, z, "z");
      }
    }
    for (let col = 0; col <= blocks; col++) {
      const x = col * (blockSize + roadWidth) + roadWidth / 2;
      for (let row = 0; row < blocks; row++) {
        const z = blockOrigin(row, this.cfg) + blockSize / 2;
        addZebra(x, z, "x");
      }
    }
  }

  private buildBuildings(): void {
    const { blocks, blockSize } = this.cfg;
    const rng = mulberry32(42);

    for (let bx = 0; bx < blocks; bx++) {
      for (let bz = 0; bz < blocks; bz++) {
        const district = districtForBlock(bx, bz, blocks);
        const ox = blockOrigin(bx, this.cfg);
        const oz = blockOrigin(bz, this.cfg);

        const countRange = district.maxCount - district.minCount + 1;
        const buildingsInBlock =
          district.minCount + Math.floor(rng() * countRange);

        for (let n = 0; n < buildingsInBlock; n++) {
          const w = 4 + rng() * (blockSize * 0.35);
          const d = 4 + rng() * (blockSize * 0.35);
          const h =
            district.minHeight +
            rng() * (district.maxHeight - district.minHeight);
          const margin = 1.2;
          const px =
            ox +
            margin +
            rng() * Math.max(0.1, blockSize - w - margin * 2) +
            w / 2;
          const pz =
            oz +
            margin +
            rng() * Math.max(0.1, blockSize - d - margin * 2) +
            d / 2;

          const color =
            district.colors[Math.floor(rng() * district.colors.length)];
          const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: district.roughness,
            metalness: district.metalness,
          });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          mesh.position.set(px, h / 2, pz);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.group.add(mesh);

          const parts: { obj: THREE.Object3D; role: "primary" | "hide" }[] = [
            { obj: mesh, role: "primary" },
          ];
          if (rng() > 0.3) {
            const glow = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.85, h * 0.7, 0.08),
              new THREE.MeshBasicMaterial({
                color: district.glow,
                transparent: true,
                opacity: 0.1 + rng() * 0.2,
              }),
            );
            glow.position.set(px, h * 0.45, pz + d / 2 + 0.05);
            this.group.add(glow);
            parts.push({ obj: glow, role: "hide" });
          }

          this.registerDestructible(
            "building",
            {
              minX: px - w / 2,
              maxX: px + w / 2,
              minZ: pz - d / 2,
              maxZ: pz + d / 2,
            },
            parts,
          );
        }

        this.addDistrictProps(district, ox, oz, blockSize, rng);
      }
    }
  }

  private addDistrictProps(
    district: DistrictStyle,
    ox: number,
    oz: number,
    blockSize: number,
    rng: () => number,
  ): void {
    if (district.props === "none") return;

    if (district.props === "trees") {
      const trees = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < trees; i++) {
        const tx = ox + 2 + rng() * (blockSize - 4);
        const tz = oz + 2 + rng() * (blockSize - 4);
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.28, 1.4, 6),
          new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9 }),
        );
        trunk.position.set(tx, 0.7, tz);
        trunk.castShadow = true;
        this.group.add(trunk);
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(1.1 + rng() * 0.6, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x2a4a28, roughness: 0.85 }),
        );
        crown.position.set(tx, 2.1 + rng() * 0.4, tz);
        crown.castShadow = true;
        this.group.add(crown);
        this.registerDestructible(
          "prop",
          {
            minX: tx - 0.5,
            maxX: tx + 0.5,
            minZ: tz - 0.5,
            maxZ: tz + 0.5,
          },
          [
            { obj: trunk, role: "primary" },
            { obj: crown, role: "hide" },
          ],
        );
      }
    }

    if (district.props === "crates") {
      const crates = 4 + Math.floor(rng() * 5);
      for (let i = 0; i < crates; i++) {
        const cx = ox + 2 + rng() * (blockSize - 4);
        const cz = oz + 2 + rng() * (blockSize - 4);
        const s = 0.8 + rng() * 1.4;
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(s, s * 0.7, s),
          new THREE.MeshStandardMaterial({
            color: 0x6a5438,
            roughness: 0.85,
            metalness: 0.1,
          }),
        );
        crate.position.set(cx, (s * 0.7) / 2, cz);
        crate.castShadow = true;
        this.group.add(crate);
        this.registerDestructible(
          "prop",
          {
            minX: cx - s / 2,
            maxX: cx + s / 2,
            minZ: cz - s / 2,
            maxZ: cz + s / 2,
          },
          [{ obj: crate, role: "primary" }],
        );
      }
    }

    if (district.props === "neon") {
      const signs = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < signs; i++) {
        const sx = ox + 3 + rng() * (blockSize - 6);
        const sz = oz + blockSize - 0.3;
        const neon = new THREE.Mesh(
          new THREE.BoxGeometry(2.5 + rng() * 2, 0.6, 0.12),
          new THREE.MeshBasicMaterial({
            color: rng() > 0.5 ? 0xff44aa : 0x44ffcc,
          }),
        );
        neon.position.set(sx, 4 + rng() * 8, sz);
        this.group.add(neon);
      }
    }
  }

  private buildStreetLights(): void {
    const { blocks, blockSize, roadWidth } = this.cfg;
    for (let row = 0; row <= blocks; row++) {
      for (let col = 0; col <= blocks; col++) {
        if ((row + col) % 3 !== 0) continue;
        const x = col * (blockSize + roadWidth) + roadWidth / 2;
        const z = row * (blockSize + roadWidth) + roadWidth / 2;

        const bx = Math.min(blocks - 1, Math.max(0, col === blocks ? col - 1 : col));
        const bz = Math.min(blocks - 1, Math.max(0, row === blocks ? row - 1 : row));
        const district = districtForBlock(bx, bz, blocks);

        const px = x + roadWidth * 0.35;
        const pz = z + roadWidth * 0.35;

        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.15, 5.5, 6),
          new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.6 }),
        );
        pole.position.set(px, 2.75, pz);
        pole.castShadow = true;
        this.group.add(pole);

        const half = 0.2;
        const lamp = new THREE.PointLight(district.lamp, 2.2, 28, 2);
        lamp.position.set(px, 5.4, pz);
        lamp.castShadow = false;
        this.group.add(lamp);

        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 8, 8),
          new THREE.MeshBasicMaterial({
            color: district.lamp,
            transparent: true,
            opacity: 1,
          }),
        );
        bulb.position.copy(lamp.position);
        this.group.add(bulb);

        this.registerDestructible(
          "prop",
          {
            minX: px - half,
            maxX: px + half,
            minZ: pz - half,
            maxZ: pz + half,
          },
          [
            { obj: pole, role: "primary" },
            { obj: bulb, role: "hide" },
            { obj: lamp, role: "hide" },
          ],
        );

        this.streetLamps.push({
          light: lamp,
          bulb,
          baseIntensity: 2.2,
        });
      }
    }
  }

  private registerDestructible(
    kind: DestKind,
    aabb: AABB,
    parts: { obj: THREE.Object3D; role: "primary" | "hide" }[],
  ): number {
    const id = this.nextDestroyId++;
    const collIndex = this.buildings.length;
    this.buildings.push(aabb);
    this.buildingIds.push(id);
    this.idToDest.set(id, this.destructibles.length);
    this.destructibles.push({ id, kind, aabb, alive: true, collIndex });
    for (const { obj, role } of parts) {
      obj.userData.destroyId = id;
      obj.userData.destroyRole = role;
    }
    return id;
  }

  /**
   * Call once after wrap tiles are cloned — builds O(1) mesh lookup
   * including wrap copies (no traverse on destroy).
   */
  buildDestructionIndex(
    wrapTiles: { group: THREE.Group }[],
  ): void {
    this.meshIndex.clear();
    const collect = (root: THREE.Object3D) => {
      root.traverse((obj) => {
        const id = obj.userData.destroyId as number | undefined;
        if (typeof id !== "number") return;
        let list = this.meshIndex.get(id);
        if (!list) {
          list = [];
          this.meshIndex.set(id, list);
        }
        list.push(obj);
      });
    };
    collect(this.group);
    for (const tile of wrapTiles) collect(tile.group);
  }

  getKind(id: number): DestKind | null {
    const idx = this.idToDest.get(id);
    if (idx === undefined) return null;
    return this.destructibles[idx].kind;
  }

  /** Returns false if already destroyed / unknown */
  destroy(id: number): boolean {
    const idx = this.idToDest.get(id);
    if (idx === undefined) return false;
    const d = this.destructibles[idx];
    if (!d.alive) return false;
    d.alive = false;

    // Swap-remove collider
    const i = d.collIndex;
    if (i >= 0 && i < this.buildings.length) {
      const last = this.buildings.length - 1;
      if (i !== last) {
        this.buildings[i] = this.buildings[last];
        this.buildingIds[i] = this.buildingIds[last];
        const otherId = this.buildingIds[i];
        const otherIdx = this.idToDest.get(otherId);
        if (otherIdx !== undefined) {
          this.destructibles[otherIdx].collIndex = i;
        }
      }
      this.buildings.pop();
      this.buildingIds.pop();
    }
    d.collIndex = -1;

    const meshes = this.meshIndex.get(id);
    if (meshes) {
      for (const obj of meshes) {
        const light = obj as THREE.Light;
        if (light.isLight) {
          light.intensity = 0;
          light.visible = false;
          continue;
        }
        const mesh = obj as THREE.Mesh;
        if (obj.userData.destroyRole === "hide") {
          obj.visible = false;
        } else {
          // Rubble stub — local scale only (shared geo OK)
          const py = mesh.position.y;
          mesh.scale.y = 0.12;
          mesh.position.y = Math.max(0.12, py * 0.12);
          mesh.castShadow = false;
        }
      }
    }

    for (const sl of this.streetLamps) {
      if (sl.light.userData.destroyId === id) {
        sl.baseIntensity = 0;
        sl.light.intensity = 0;
        sl.bulb.visible = false;
      }
    }

    return true;
  }

  /**
   * First live prop overlapping circle — for tank crush (max callers/frame).
   */
  findPropNear(x: number, z: number, radius: number): number | null {
    const r = radius;
    for (let i = 0; i < this.buildings.length; i++) {
      const id = this.buildingIds[i];
      const di = this.idToDest.get(id);
      if (di === undefined) continue;
      const d = this.destructibles[di];
      if (!d.alive || d.kind !== "prop") continue;
      const b = this.buildings[i];
      const cx = (b.minX + b.maxX) * 0.5;
      const cz = (b.minZ + b.maxZ) * 0.5;
      const hx = (b.maxX - b.minX) * 0.5 + r;
      const hz = (b.maxZ - b.minZ) * 0.5 + r;
      if (Math.abs(x - cx) <= hx && Math.abs(z - cz) <= hz) {
        return id;
      }
    }
    return null;
  }

  getDistrictAt(x: number, z: number): DistrictStyle {
    return districtAtWorld(
      x,
      z,
      this.cfg.blocks,
      this.cfg.blockSize,
      this.cfg.roadWidth,
    );
  }

  private collectSpawnPoints(): void {
    const { blocks, blockSize, roadWidth, sidewalkWidth } = this.cfg;
    // Sidewalk midpoints along horizontal roads
    for (let row = 0; row <= blocks; row++) {
      const zRoad = row * (blockSize + roadWidth) + roadWidth / 2;
      for (let i = 0; i < blocks; i++) {
        const x = blockOrigin(i, this.cfg) + blockSize / 2;
        if (row > 0) {
          this.spawnPoints.push(
            new THREE.Vector3(x, 0, zRoad - roadWidth / 2 - sidewalkWidth / 2),
          );
        }
        if (row < blocks) {
          this.spawnPoints.push(
            new THREE.Vector3(x, 0, zRoad + roadWidth / 2 + sidewalkWidth / 2),
          );
        }
      }
    }
    // Along vertical roads
    for (let col = 0; col <= blocks; col++) {
      const xRoad = col * (blockSize + roadWidth) + roadWidth / 2;
      for (let j = 0; j < blocks; j++) {
        const z = blockOrigin(j, this.cfg) + blockSize / 2;
        if (col > 0) {
          this.spawnPoints.push(
            new THREE.Vector3(xRoad - roadWidth / 2 - sidewalkWidth / 2, 0, z),
          );
        }
        if (col < blocks) {
          this.spawnPoints.push(
            new THREE.Vector3(xRoad + roadWidth / 2 + sidewalkWidth / 2, 0, z),
          );
        }
      }
    }
  }

  /** Middle of a vertical road — good car start */
  getStartPosition(): THREE.Vector3 {
    const { roadWidth } = this.cfg;
    return new THREE.Vector3(roadWidth / 2, 0, this.size / 2);
  }
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
