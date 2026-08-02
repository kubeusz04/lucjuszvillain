import * as THREE from "three";
import type { Car } from "../entities/Car";
import type { Pedestrian } from "../entities/Pedestrian";

export interface HitResult {
  pedestrian: Pedestrian;
  points: number;
  position: THREE.Vector3;
}

export function checkCarPedestrianHits(
  car: Car,
  pedestrians: Pedestrian[],
): HitResult[] {
  const hits: HitResult[] = [];
  const carPos = car.mesh.position;
  const radius = car.getHitRadius();
  const speedBonus = Math.floor(Math.abs(car.speed) / 8);

  for (const ped of pedestrians) {
    if (!ped.alive) continue;
    const dx = ped.mesh.position.x - carPos.x;
    const dz = ped.mesh.position.z - carPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < radius) {
      hits.push({
        pedestrian: ped,
        points: 1 + speedBonus,
        position: ped.mesh.position.clone(),
      });
    }
  }
  return hits;
}

const MAX_PARTICLES = 40;
const RUBBLE_BURST = 6;
const HIT_BURST = 10;

/** Simple burst of particles at hit location */
export class HitFx {
  private particles: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    life: number;
  }[] = [];
  private readonly scene: THREE.Scene;
  private readonly sharedHitGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  private readonly sharedRubbleGeo = new THREE.BoxGeometry(0.18, 0.12, 0.18);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(at: THREE.Vector3): void {
    this.burst(at, HIT_BURST, 0xc45c3a, this.sharedHitGeo, 0.8);
  }

  /** Cheap gray debris for structure destruction */
  spawnRubble(at: THREE.Vector3): void {
    this.burst(at, RUBBLE_BURST, 0x6a655c, this.sharedRubbleGeo, 0.5);
  }

  private burst(
    at: THREE.Vector3,
    count: number,
    color: number,
    geo: THREE.BufferGeometry,
    y: number,
  ): void {
    const room = Math.max(0, MAX_PARTICLES - this.particles.length);
    const n = Math.min(count, room);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.position.copy(at);
      mesh.position.y = y;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          2 + Math.random() * 5,
          (Math.random() - 0.5) * 8,
        ),
        life: 0.35 + Math.random() * 0.3,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        // Shared geos — only dispose material
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles.length = 0;
  }
}
