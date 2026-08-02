import * as THREE from "three";
import type { Car } from "./Car";
import { wrapCoord } from "../world/wrap";
import type { KimchiTemplate } from "../assets/KimchiModel";

const PICKUP_RADIUS = 2.8;
const RESPAWN_DELAY = 4.5;

export class KimchiJar {
  readonly mesh: THREE.Group;
  active = true;
  private respawnT = 0;
  private readonly bobPhase: number;
  private readonly baseY = 0;

  constructor(x: number, z: number, mesh: THREE.Group) {
    this.mesh = mesh;
    this.mesh.position.set(x, this.baseY, z);
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  update(dt: number, time: number): void {
    if (!this.active) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.active = true;
        this.mesh.visible = true;
      }
      return;
    }

    this.mesh.rotation.y += dt * 1.8;
    this.mesh.position.y = this.baseY + Math.sin(time * 3 + this.bobPhase) * 0.18;
  }

  collect(): void {
    this.active = false;
    this.mesh.visible = false;
    this.respawnT = RESPAWN_DELAY + Math.random() * 3;
  }
}

function buildFallbackMesh(): THREE.Group {
  const g = new THREE.Group();
  const jarMat = new THREE.MeshStandardMaterial({
    color: 0xc44a28,
    roughness: 0.35,
    metalness: 0.15,
    emissive: 0x4a1808,
    emissiveIntensity: 0.35,
  });
  const jar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 0.7, 10),
    jarMat,
  );
  jar.position.y = 0.35;
  g.add(jar);
  return g;
}

export class KimchiManager {
  readonly jars: KimchiJar[] = [];
  collected = 0;
  private readonly scene: THREE.Scene;
  private readonly citySize: number;
  private readonly template: KimchiTemplate | null;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    spawnPoints: THREE.Vector3[],
    citySize: number,
    count = 35,
    template: KimchiTemplate | null = null,
  ) {
    this.scene = scene;
    this.citySize = citySize;
    this.template = template;
    this.spawnAll(spawnPoints, count);
  }

  private makeMesh(): THREE.Group {
    return this.template?.createInstance() ?? buildFallbackMesh();
  }

  private spawnAll(spawnPoints: THREE.Vector3[], count: number): void {
    for (let i = 0; i < count; i++) {
      let x: number;
      let z: number;
      if (spawnPoints.length > 0) {
        const p = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
        x = p.x + (Math.random() - 0.5) * 10;
        z = p.z + (Math.random() - 0.5) * 10;
      } else {
        x = 15 + Math.random() * (this.citySize - 30);
        z = 15 + Math.random() * (this.citySize - 30);
      }
      x = wrapCoord(x, this.citySize);
      z = wrapCoord(z, this.citySize);
      const jar = new KimchiJar(x, z, this.makeMesh());
      this.jars.push(jar);
      this.scene.add(jar.mesh);
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const jar of this.jars) {
      jar.update(dt, this.time);
    }
  }

  collectNear(car: Car): number {
    let n = 0;
    const cx = car.mesh.position.x;
    const cz = car.mesh.position.z;
    for (const jar of this.jars) {
      if (!jar.active) continue;
      const dx = jar.mesh.position.x - cx;
      const dz = jar.mesh.position.z - cz;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        jar.collect();
        this.collected += 1;
        n += 1;
      }
    }
    return n;
  }

  reset(): void {
    this.collected = 0;
    for (const jar of this.jars) {
      jar.active = true;
      jar.mesh.visible = true;
    }
  }
}
