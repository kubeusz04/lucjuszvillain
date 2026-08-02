import * as THREE from "three";
import { wrapCoord } from "../world/wrap";
import type { Crosswalk } from "../world/City";
import { playHitSfx } from "../audio/Sfx";
import type { PeopleLibrary } from "../assets/PeopleModels";

const COLORS = [0xc45c3a, 0xd4a574, 0x6a8a9a, 0x8a7a6a, 0xb8a090, 0x5a6a7a];
const GRAVITY = 28;
/** Only ghost peds this close to a map edge */
const EDGE_GHOST_BAND = 28;
/** Max simultaneous wrap ghosts (cheap box impostors) */
const MAX_EDGE_GHOSTS = 48;

export class Pedestrian {
  readonly mesh: THREE.Group;
  alive = true;
  flying = false;
  private dir: THREE.Vector3;
  private speed: number;
  private crossTimer: number;
  private readonly citySize: number;
  private readonly crosswalks: Crosswalk[];
  private target: Crosswalk | null = null;
  private crossing = false;
  private readonly flyVel = new THREE.Vector3();
  private readonly spin = new THREE.Vector3();

  constructor(
    position: THREE.Vector3,
    citySize: number,
    crosswalks: Crosswalk[],
    mesh?: THREE.Group,
  ) {
    this.citySize = citySize;
    this.crosswalks = crosswalks;
    this.mesh = mesh ?? this.buildFallbackMesh();
    this.mesh.position.copy(position);
    this.mesh.position.y = 0;

    const angle = Math.random() * Math.PI * 2;
    this.dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    this.speed = 1.4 + Math.random() * 1.8;
    this.crossTimer = 1 + Math.random() * 4;
  }

  private buildFallbackMesh(): THREE.Group {
    const g = new THREE.Group();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.05,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xc4a882,
      roughness: 0.7,
    });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.3), bodyMat);
    legs.position.y = 0.35;
    g.add(legs);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.65, 0.28), bodyMat);
    torso.position.y = 0.95;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), headMat);
    head.position.y = 1.45;
    g.add(head);

    return g;
  }

  private pickCrosswalk(): Crosswalk | null {
    if (this.crosswalks.length === 0) return null;
    let best: Crosswalk | null = null;
    let bestDist = Infinity;
    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const cw =
        this.crosswalks[Math.floor(Math.random() * this.crosswalks.length)];
      const d = Math.hypot(
        cw.x - this.mesh.position.x,
        cw.z - this.mesh.position.z,
      );
      if (d < bestDist) {
        bestDist = d;
        best = cw;
      }
    }
    return best;
  }

  update(dt: number): void {
    if (this.flying) {
      this.flyVel.y -= GRAVITY * dt;
      this.mesh.position.x += this.flyVel.x * dt;
      this.mesh.position.y += this.flyVel.y * dt;
      this.mesh.position.z += this.flyVel.z * dt;
      this.mesh.rotation.x += this.spin.x * dt;
      this.mesh.rotation.y += this.spin.y * dt;
      this.mesh.rotation.z += this.spin.z * dt;

      this.mesh.position.x = wrapCoord(this.mesh.position.x, this.citySize);
      this.mesh.position.z = wrapCoord(this.mesh.position.z, this.citySize);

      if (this.mesh.position.y <= 0 && this.flyVel.y <= 0) {
        this.mesh.position.y = 0;
        this.flying = false;
        this.mesh.visible = false;
      }
      return;
    }

    if (!this.alive) return;

    this.crossTimer -= dt;

    if (this.target) {
      const dx = this.target.x - this.mesh.position.x;
      const dz = this.target.z - this.mesh.position.z;
      const dist = Math.hypot(dx, dz);

      if (!this.crossing) {
        if (dist > 1.2) {
          this.dir.set(dx / dist, 0, dz / dist);
          this.speed = 1.6 + Math.random() * 0.4;
        } else {
          this.crossing = true;
          if (this.target.axis === "x") {
            this.dir.set(Math.random() > 0.5 ? 1 : -1, 0, 0);
          } else {
            this.dir.set(0, 0, Math.random() > 0.5 ? 1 : -1);
          }
          this.speed = 2.2 + Math.random() * 1.2;
          this.crossTimer = 2.5;
        }
      } else if (this.crossTimer <= 0) {
        this.target = null;
        this.crossing = false;
        this.crossTimer = 2 + Math.random() * 5;
        const angle = Math.random() * Math.PI * 2;
        this.dir.set(Math.sin(angle), 0, Math.cos(angle));
        this.speed = 1.3 + Math.random() * 1.5;
      }
    } else if (this.crossTimer <= 0) {
      if (Math.random() < 0.65) {
        this.target = this.pickCrosswalk();
        this.crossing = false;
        this.crossTimer = 12;
      } else {
        const angle = Math.random() * Math.PI * 2;
        this.dir.set(Math.sin(angle), 0, Math.cos(angle));
        this.speed = 1.2 + Math.random() * 2;
        this.crossTimer = 1.5 + Math.random() * 5;
      }
    }

    this.mesh.position.x += this.dir.x * this.speed * dt;
    this.mesh.position.z += this.dir.z * this.speed * dt;

    this.mesh.position.x = wrapCoord(this.mesh.position.x, this.citySize);
    this.mesh.position.z = wrapCoord(this.mesh.position.z, this.citySize);

    if (this.dir.lengthSq() > 0.001) {
      this.mesh.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    }
  }

  hit(carHeading: number, carSpeed: number): void {
    if (!this.alive || this.flying) return;
    this.alive = false;
    this.flying = true;
    this.target = null;
    this.crossing = false;
    this.mesh.visible = true;

    const push = 10 + Math.abs(carSpeed) * 0.85;
    this.flyVel.set(
      Math.sin(carHeading) * push + (Math.random() - 0.5) * 6,
      12 + Math.abs(carSpeed) * 0.55 + Math.random() * 4,
      Math.cos(carHeading) * push + (Math.random() - 0.5) * 6,
    );
    this.spin.set(
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 18,
    );

    playHitSfx();
  }

  get readyToRespawn(): boolean {
    return !this.alive && !this.flying;
  }

  /** True when near a wrap edge (needs a visual ghost on the other side) */
  nearEdge(): boolean {
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;
    const s = this.citySize;
    return (
      x < EDGE_GHOST_BAND ||
      x > s - EDGE_GHOST_BAND ||
      z < EDGE_GHOST_BAND ||
      z > s - EDGE_GHOST_BAND
    );
  }

  respawnAt(position: THREE.Vector3): void {
    this.mesh.position.copy(position);
    this.mesh.position.y = 0;
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
    this.alive = true;
    this.flying = false;
    this.target = null;
    this.crossing = false;
    this.flyVel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    const angle = Math.random() * Math.PI * 2;
    this.dir.set(Math.sin(angle), 0, Math.cos(angle));
    this.speed = 1.4 + Math.random() * 1.8;
    this.crossTimer = 1 + Math.random() * 4;
  }
}

/** Shared low-poly impostor for wrap-edge ghosts (not skinned GLBs) */
function createGhostPool(scene: THREE.Scene, count: number): THREE.Mesh[] {
  const geo = new THREE.CapsuleGeometry(0.28, 0.9, 3, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a7a6a,
    roughness: 0.85,
    metalness: 0.05,
  });
  const pool: THREE.Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = false;
    m.visible = false;
    m.frustumCulled = true;
    scene.add(m);
    pool.push(m);
  }
  return pool;
}

export class PedestrianManager {
  readonly pedestrians: Pedestrian[] = [];
  private readonly scene: THREE.Scene;
  private readonly spawnPoints: THREE.Vector3[];
  private readonly crosswalks: Crosswalk[];
  private readonly citySize: number;
  private readonly targetCount: number;
  private readonly people: PeopleLibrary | null;
  private respawnCooldown = 0;
  private readonly ghostPool: THREE.Mesh[];
  private ghostCursor = 0;

  constructor(
    scene: THREE.Scene,
    spawnPoints: THREE.Vector3[],
    citySize: number,
    count = 40,
    crosswalks: Crosswalk[] = [],
    people: PeopleLibrary | null = null,
  ) {
    this.scene = scene;
    this.spawnPoints = spawnPoints;
    this.crosswalks = crosswalks;
    this.citySize = citySize;
    this.targetCount = count;
    this.people = people;
    this.ghostPool = createGhostPool(scene, MAX_EDGE_GHOSTS);
    this.spawnInitial(count);
  }

  private randomSpawn(): THREE.Vector3 {
    if (this.spawnPoints.length === 0) {
      return new THREE.Vector3(
        10 + Math.random() * (this.citySize - 20),
        0,
        10 + Math.random() * (this.citySize - 20),
      );
    }
    const p = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    return p.clone().add(
      new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4),
    );
  }

  private spawnInitial(count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnOne();
    }
  }

  private createMesh(): THREE.Group | undefined {
    const mesh = this.people?.createInstance();
    if (mesh) {
      mesh.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = false;
          m.receiveShadow = false;
          m.frustumCulled = true;
        }
      });
    }
    return mesh;
  }

  private spawnOne(): Pedestrian {
    const ped = new Pedestrian(
      this.randomSpawn(),
      this.citySize,
      this.crosswalks,
      this.createMesh(),
    );
    this.pedestrians.push(ped);
    this.scene.add(ped.mesh);
    return ped;
  }

  /**
   * Place cheap capsule ghosts across wrap seams for edge peds only.
   * Replaces the old 4× skinned clone per pedestrian.
   */
  syncWrapGhosts(cameraPos: THREE.Vector3): void {
    for (const g of this.ghostPool) g.visible = false;
    this.ghostCursor = 0;

    const s = this.citySize;
    const maxDist = 70;
    const maxDistSq = maxDist * maxDist;
    const camX = cameraPos.x;
    const camZ = cameraPos.z;

    for (const ped of this.pedestrians) {
      if ((!ped.alive && !ped.flying) || !ped.mesh.visible) continue;
      if (!ped.nearEdge()) continue;
      if (this.ghostCursor >= MAX_EDGE_GHOSTS) break;

      const x = ped.mesh.position.x;
      const y = ped.mesh.position.y + 0.85;
      const z = ped.mesh.position.z;

      const candidates: [number, number][] = [];
      if (x < EDGE_GHOST_BAND) candidates.push([x + s, z]);
      if (x > s - EDGE_GHOST_BAND) candidates.push([x - s, z]);
      if (z < EDGE_GHOST_BAND) candidates.push([x, z + s]);
      if (z > s - EDGE_GHOST_BAND) candidates.push([x, z - s]);
      // Corners
      if (x < EDGE_GHOST_BAND && z < EDGE_GHOST_BAND)
        candidates.push([x + s, z + s]);
      if (x < EDGE_GHOST_BAND && z > s - EDGE_GHOST_BAND)
        candidates.push([x + s, z - s]);
      if (x > s - EDGE_GHOST_BAND && z < EDGE_GHOST_BAND)
        candidates.push([x - s, z + s]);
      if (x > s - EDGE_GHOST_BAND && z > s - EDGE_GHOST_BAND)
        candidates.push([x - s, z - s]);

      for (const [gx, gz] of candidates) {
        if (this.ghostCursor >= MAX_EDGE_GHOSTS) break;
        const dx = gx - camX;
        const dz = gz - camZ;
        if (dx * dx + dz * dz > maxDistSq) continue;

        const ghost = this.ghostPool[this.ghostCursor++];
        ghost.visible = true;
        ghost.position.set(gx, y, gz);
        ghost.rotation.y = ped.mesh.rotation.y;
      }
    }
  }

  update(dt: number): void {
    for (const p of this.pedestrians) {
      p.update(dt);
    }

    const alive = this.pedestrians.filter((p) => p.alive).length;
    this.respawnCooldown -= dt;
    if (alive < this.targetCount && this.respawnCooldown <= 0) {
      const deficit = this.targetCount - alive;
      const batch = Math.min(4, deficit);
      for (let i = 0; i < batch; i++) {
        const dead = this.pedestrians.find((p) => p.readyToRespawn);
        if (dead) {
          dead.respawnAt(this.randomSpawn());
        } else if (
          this.pedestrians.filter((p) => p.alive || p.flying).length <
          this.targetCount
        ) {
          this.spawnOne();
        }
      }
      this.respawnCooldown = 0.1;
    }
  }

  reset(): void {
    for (const g of this.ghostPool) g.visible = false;
    for (const p of this.pedestrians) {
      this.scene.remove(p.mesh);
    }
    this.pedestrians.length = 0;
    this.spawnInitial(this.targetCount);
    this.respawnCooldown = 0;
  }
}
