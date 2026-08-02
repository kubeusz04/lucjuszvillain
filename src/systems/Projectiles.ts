import * as THREE from "three";
import type { AABB } from "../world/City";
import { wrapCoord, wrapPosition } from "../world/wrap";
import type { Car } from "../entities/Car";
import type { Pedestrian } from "../entities/Pedestrian";
import type { PoliceCar } from "../entities/Police";

const SHELL_SPEED = 85;
const SHELL_LIFE = 1.8;
const SHELL_RADIUS = 1.4;
const SHELL_RADIUS_COP = 2.9;
const FIRE_COOLDOWN = 0.55;
const MAX_SHELLS = 12;

export type ShellHit =
  | {
      kind: "pedestrian";
      pedestrian: Pedestrian;
      position: THREE.Vector3;
      points: number;
    }
  | {
      kind: "police";
      cop: PoliceCar;
      position: THREE.Vector3;
      points: number;
    }
  | {
      kind: "structure";
      id: number;
      position: THREE.Vector3;
      points: number;
    };

export class ProjectileSystem {
  private readonly scene: THREE.Scene;
  private readonly shells: {
    mesh: THREE.Mesh;
    vx: number;
    vz: number;
    life: number;
  }[] = [];
  private cooldown = 0;
  private readonly muzzleFlash: THREE.PointLight;
  private flashT = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.muzzleFlash = new THREE.PointLight(0xffaa44, 0, 18, 2);
    scene.add(this.muzzleFlash);
  }

  get ready(): boolean {
    return this.cooldown <= 0;
  }

  /** Returns true if a shell was fired */
  tryFire(car: Car): boolean {
    if (this.cooldown > 0) return false;
    if (this.shells.length >= MAX_SHELLS) return false;

    const heading = car.getFireHeading();
    car.getMuzzleWorldPosition(this.tmp);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc66 }),
    );
    mesh.position.copy(this.tmp);
    this.scene.add(mesh);

    this.shells.push({
      mesh,
      vx: Math.sin(heading) * SHELL_SPEED,
      vz: Math.cos(heading) * SHELL_SPEED,
      life: SHELL_LIFE,
    });

    this.muzzleFlash.position.copy(this.tmp);
    this.muzzleFlash.intensity = 4.5;
    this.flashT = 0.08;
    this.cooldown = FIRE_COOLDOWN;
    return true;
  }

  update(
    dt: number,
    buildings: AABB[],
    buildingIds: number[],
    citySize: number,
    pedestrians: Pedestrian[],
    cops: PoliceCar[],
  ): ShellHit[] {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.muzzleFlash.intensity = Math.max(0, 4.5 * (this.flashT / 0.08));
    } else {
      this.muzzleFlash.intensity = 0;
    }

    const hits: ShellHit[] = [];

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      const prevX = s.mesh.position.x;
      const prevZ = s.mesh.position.z;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.position.y = 1.6;

      const wrapped = wrapPosition(
        s.mesh.position.x,
        s.mesh.position.z,
        citySize,
      );
      s.mesh.position.x = wrapped.x;
      s.mesh.position.z = wrapped.z;

      let dead = s.life <= 0;
      let structureHit: ShellHit | null = null;

      const x = s.mesh.position.x;
      const z = s.mesh.position.z;
      structureHit = this.structureAt(x, z, buildings, buildingIds);
      if (structureHit) dead = true;

      if (!dead) {
        const hit = this.hitTest(x, z, pedestrians, cops);
        if (hit) {
          hits.push(hit);
          dead = true;
        }
      }

      // Segment check — entities + structures (anti-tunnel)
      if (!dead) {
        const steps = 3;
        for (let step = 1; step <= steps; step++) {
          const t = step / (steps + 1);
          const ix = wrapCoord(prevX + s.vx * dt * t, citySize);
          const iz = wrapCoord(prevZ + s.vz * dt * t, citySize);
          structureHit = this.structureAt(ix, iz, buildings, buildingIds);
          if (structureHit) {
            dead = true;
            break;
          }
          const hit = this.hitTest(ix, iz, pedestrians, cops);
          if (hit) {
            hits.push(hit);
            dead = true;
            break;
          }
        }
      }

      if (structureHit) hits.push(structureHit);

      if (dead) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.shells.splice(i, 1);
      }
    }

    return hits;
  }

  private structureAt(
    x: number,
    z: number,
    buildings: AABB[],
    buildingIds: number[],
  ): ShellHit | null {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) {
        return {
          kind: "structure",
          id: buildingIds[i],
          position: new THREE.Vector3(
            (b.minX + b.maxX) * 0.5,
            1.2,
            (b.minZ + b.maxZ) * 0.5,
          ),
          points: 2,
        };
      }
    }
    return null;
  }

  private hitTest(
    x: number,
    z: number,
    pedestrians: Pedestrian[],
    cops: PoliceCar[],
  ): ShellHit | null {
    const r2 = SHELL_RADIUS * SHELL_RADIUS;
    const cr2 = SHELL_RADIUS_COP * SHELL_RADIUS_COP;

    for (const cop of cops) {
      if (!cop.alive) continue;
      const dx = cop.mesh.position.x - x;
      const dz = cop.mesh.position.z - z;
      if (dx * dx + dz * dz < cr2) {
        return {
          kind: "police",
          cop,
          position: cop.mesh.position.clone(),
          points: 8,
        };
      }
    }

    for (const ped of pedestrians) {
      if (!ped.alive) continue;
      const dx = ped.mesh.position.x - x;
      const dz = ped.mesh.position.z - z;
      if (dx * dx + dz * dz < r2) {
        return {
          kind: "pedestrian",
          pedestrian: ped,
          position: ped.mesh.position.clone(),
          points: 3,
        };
      }
    }

    return null;
  }

  clear(): void {
    for (const s of this.shells) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    }
    this.shells.length = 0;
    this.muzzleFlash.intensity = 0;
    this.cooldown = 0;
  }
}
