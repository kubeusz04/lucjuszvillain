import * as THREE from "three";
import type { AABB } from "../world/City";
import { wrapDelta, wrapPosition } from "../world/wrap";
import type { Car } from "./Car";
import { WantedSystem, type WantedUpdate } from "../game/Wanted";

const ACCEL = 16;
const MAX_SPEED = 17;
const FRICTION = 11;
const TURN_RATE = 2.4;
const HIT_R = 1.7;
/** Collision radius vs player tank */
const BODY_R = 2.35;
/** Min closing speed that costs a life */
const RAM_SPEED = 10;
/** Predict player movement for interception */
const LEAD_TIME = 0.4;

export class PoliceCar {
  readonly mesh: THREE.Group;
  speed = 0;
  heading = 0;
  alive = true;
  /** Shells to wreck this unit */
  hp = 2;
  private readonly lightMats: THREE.MeshBasicMaterial[] = [];
  private flashT = 0;
  /** Cooldown before this unit can deal another life hit */
  hitCooldown = 0;

  constructor(pos: THREE.Vector3, heading: number) {
    this.mesh = this.buildMesh();
    this.mesh.position.copy(pos);
    this.mesh.position.y = 0;
    this.heading = heading;
    this.mesh.rotation.y = heading;
  }

  getRadius(): number {
    return BODY_R;
  }

  applyBump(nx: number, nz: number, strength: number): void {
    const len = Math.hypot(nx, nz) || 1;
    this.mesh.position.x += (nx / len) * strength * 0.45;
    this.mesh.position.z += (nz / len) * strength * 0.45;
    this.speed *= 0.55;
  }

  /** Returns true if destroyed */
  takeShellHit(): boolean {
    if (!this.alive) return false;
    this.hp -= 1;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    this.speed *= 0.25;
    this.hitCooldown = 0.6;
    return false;
  }

  private buildMesh(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a44,
      roughness: 0.4,
      metalness: 0.4,
    });
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xd8dce4,
      roughness: 0.5,
      metalness: 0.2,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.7,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.7, 4.4), bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.35, 1.1),
      whiteMat,
    );
    stripe.position.set(0, 0.7, 0.1);
    g.add(stripe);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 2.0), bodyMat);
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    g.add(cabin);

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.18, 0.45),
      darkMat,
    );
    bar.position.set(0, 1.55, -0.15);
    g.add(bar);

    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    this.lightMats.push(redMat, blueMat);

    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.35), redMat);
    red.position.set(-0.35, 1.55, -0.15);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.35), blueMat);
    blue.position.set(0.35, 1.55, -0.15);
    g.add(blue);

    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 10);
    for (const [x, y, z] of [
      [-1.05, 0.38, 1.4],
      [1.05, 0.38, 1.4],
      [-1.05, 0.38, -1.4],
      [1.05, 0.38, -1.4],
    ] as [number, number, number][]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      g.add(w);
    }

    return g;
  }

  /** Chase the player. Solid contact / rams resolved by PoliceManager. */
  update(
    dt: number,
    target: Car,
    buildings: AABB[],
    citySize: number,
    aggression: number,
  ): void {
    if (!this.alive) return;

    this.flashT += dt * (4 + aggression);
    const on = Math.sin(this.flashT * Math.PI * 2) > 0;
    this.lightMats[0].color.setHex(on ? 0xff2244 : 0x440810);
    this.lightMats[1].color.setHex(on ? 0x2266ff : 0x081044);

    if (this.hitCooldown > 0) this.hitCooldown -= dt;

    const px = target.mesh.position.x;
    const pz = target.mesh.position.z;
    // Aim ahead of the player to cut them off
    const lead = LEAD_TIME * (0.7 + aggression * 0.08);
    const aimX = px + Math.sin(target.heading) * target.speed * lead;
    const aimZ = pz + Math.cos(target.heading) * target.speed * lead;

    const dx = wrapDelta(this.mesh.position.x, aimX, citySize);
    const dz = wrapDelta(this.mesh.position.z, aimZ, citySize);
    const distToPlayer = Math.hypot(
      wrapDelta(this.mesh.position.x, px, citySize),
      wrapDelta(this.mesh.position.z, pz, citySize),
    );
    const desiredHeading = Math.atan2(dx, dz);

    let headingDiff = desiredHeading - this.heading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;

    const turnMul = 1 + aggression * 0.18;
    const turn = THREE.MathUtils.clamp(
      headingDiff,
      -TURN_RATE * dt * turnMul,
      TURN_RATE * dt * turnMul,
    );
    if (this.speed > 0.8) this.heading += turn;

    const maxSpd = MAX_SPEED + aggression * 0.9;
    // Floor it when lined up for a ram
    const linedUp = Math.abs(headingDiff) < 0.85;
    const close = distToPlayer < 18;
    if (linedUp) {
      this.speed += ACCEL * (1.05 + aggression * 0.06) * dt;
      if (close) this.speed += ACCEL * 0.2 * dt;
    } else {
      this.speed += ACCEL * 0.35 * dt;
    }
    this.speed = Math.min(this.speed, maxSpd);
    this.speed = Math.max(0, this.speed - FRICTION * dt * 0.12);

    const prevX = this.mesh.position.x;
    const prevZ = this.mesh.position.z;
    this.mesh.position.x += Math.sin(this.heading) * this.speed * dt;
    this.mesh.position.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.rotation.y = this.heading;

    const w = wrapPosition(
      this.mesh.position.x,
      this.mesh.position.z,
      citySize,
    );
    this.mesh.position.x = w.x;
    this.mesh.position.z = w.z;

    if (this.collides(buildings)) {
      this.mesh.position.x = prevX;
      this.mesh.position.z = prevZ;
      this.heading += (Math.random() > 0.5 ? 1 : -1) * 0.8;
      this.speed *= 0.45;
    }
  }

  private collides(buildings: AABB[]): boolean {
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;
    const r = HIT_R;
    for (const b of buildings) {
      if (x - r < b.maxX && x + r > b.minX && z - r < b.maxZ && z + r > b.minZ) {
        return true;
      }
    }
    return false;
  }

  overlapsBuildings(buildings: AABB[]): boolean {
    return this.collides(buildings);
  }
}

export class PoliceManager {
  readonly cops: PoliceCar[] = [];
  readonly wanted = new WantedSystem();
  private readonly scene: THREE.Scene;
  private readonly citySize: number;
  private spawnCooldown = 0;

  constructor(scene: THREE.Scene, citySize: number) {
    this.scene = scene;
    this.citySize = citySize;
  }

  get stars(): number {
    return this.wanted.stars;
  }

  onCrime(intensity = 0.45): void {
    this.wanted.onCrime(intensity);
    this.spawnCooldown = Math.min(this.spawnCooldown, 0.35);
  }

  update(
    dt: number,
    player: Car,
    buildings: AABB[],
  ): { ramHits: number; wanted: WantedUpdate } {
    // Faster heat drop when far from every cop (escape)
    let nearest = Infinity;
    for (const cop of this.cops) {
      const d = Math.hypot(
        wrapDelta(cop.mesh.position.x, player.mesh.position.x, this.citySize),
        wrapDelta(cop.mesh.position.z, player.mesh.position.z, this.citySize),
      );
      nearest = Math.min(nearest, d);
    }
    if (this.cops.length === 0) nearest = Infinity;
    const escapeBoost = nearest > 55 ? 1.85 : nearest > 35 ? 1.35 : 1;
    const wanted = this.wanted.update(dt * escapeBoost);
    const tier = wanted.tier;

    this.spawnCooldown -= dt;
    const targetCops = tier.cops;

    while (this.cops.length < targetCops && this.spawnCooldown <= 0) {
      this.spawnNear(player, tier.spawnDistMin, tier.spawnDistMax);
      this.spawnCooldown = tier.spawnCooldown;
    }

    while (this.cops.length > targetCops) {
      const c = this.cops.pop()!;
      this.scene.remove(c.mesh);
    }

    let ramHits = 0;
    for (const cop of this.cops) {
      cop.update(dt, player, buildings, this.citySize, tier.aggression);
    }

    // Solid body vs tank — cops bounce off the heavy tank (don't shove player into walls)
    const playerR = player.getHitRadius() * 0.85;
    for (const cop of this.cops) {
      if (!cop.alive) continue;

      const dx = wrapDelta(
        player.mesh.position.x,
        cop.mesh.position.x,
        this.citySize,
      );
      const dz = wrapDelta(
        player.mesh.position.z,
        cop.mesh.position.z,
        this.citySize,
      );
      const dist = Math.hypot(dx, dz);
      const minDist = playerR + cop.getRadius();
      if (dist >= minDist || dist < 1e-4) continue;

      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;

      const playerX = player.mesh.position.x;
      const playerZ = player.mesh.position.z;
      const copX = cop.mesh.position.x;
      const copZ = cop.mesh.position.z;

      // Almost all separation on the lighter police car
      cop.mesh.position.x += nx * overlap;
      cop.mesh.position.z += nz * overlap;
      const cw = wrapPosition(
        cop.mesh.position.x,
        cop.mesh.position.z,
        this.citySize,
      );
      cop.mesh.position.x = cw.x;
      cop.mesh.position.z = cw.z;

      // If cop can't move (into a building), nudge player only if still free
      if (cop.overlapsBuildings(buildings)) {
        cop.mesh.position.x = copX;
        cop.mesh.position.z = copZ;
        player.mesh.position.x -= nx * overlap;
        player.mesh.position.z -= nz * overlap;
        const pw = wrapPosition(
          player.mesh.position.x,
          player.mesh.position.z,
          this.citySize,
        );
        player.mesh.position.x = pw.x;
        player.mesh.position.z = pw.z;
        if (player.overlapsBuildings(buildings)) {
          // Stuck between wall and cop — keep player free, allow slight overlap
          player.mesh.position.x = playerX;
          player.mesh.position.z = playerZ;
          cop.mesh.position.x = copX + nx * overlap * 0.35;
          cop.mesh.position.z = copZ + nz * overlap * 0.35;
          const cw2 = wrapPosition(
            cop.mesh.position.x,
            cop.mesh.position.z,
            this.citySize,
          );
          cop.mesh.position.x = cw2.x;
          cop.mesh.position.z = cw2.z;
          if (cop.overlapsBuildings(buildings)) {
            cop.mesh.position.x = copX;
            cop.mesh.position.z = copZ;
          }
        }
      }

      const pvx = Math.sin(player.heading) * player.speed;
      const pvz = Math.cos(player.heading) * player.speed;
      const cvx = Math.sin(cop.heading) * cop.speed;
      const cvz = Math.cos(cop.heading) * cop.speed;
      const closing = (pvx - cvx) * nx + (pvz - cvz) * nz;

      player.speed *= 0.78;
      cop.speed *= 0.35;

      if (closing > RAM_SPEED && cop.hitCooldown <= 0) {
        cop.hitCooldown = 2.4;
        player.applyBump(-nx, -nz, 8 + tier.aggression, buildings);
        cop.applyBump(nx, nz, 6);
        if (cop.overlapsBuildings(buildings)) {
          cop.mesh.position.x = copX;
          cop.mesh.position.z = copZ;
        }
        ramHits += 1;
      } else if (Math.abs(closing) > 3) {
        player.applyBump(-nx, -nz, 3, buildings);
        cop.applyBump(nx, nz, 4);
        if (cop.overlapsBuildings(buildings)) {
          cop.mesh.position.x = copX;
          cop.mesh.position.z = copZ;
        }
      }
    }

    // Drop wrecked units (shell hits)
    for (let i = this.cops.length - 1; i >= 0; i--) {
      if (!this.cops[i].alive) {
        this.scene.remove(this.cops[i].mesh);
        this.cops.splice(i, 1);
      }
    }

    return { ramHits, wanted };
  }

  /** Apply shell damage; returns true if the unit was destroyed */
  damageCop(cop: PoliceCar): boolean {
    if (!cop.alive) return false;
    const wrecked = cop.takeShellHit();
    if (wrecked) {
      const idx = this.cops.indexOf(cop);
      if (idx >= 0) {
        this.scene.remove(cop.mesh);
        this.cops.splice(idx, 1);
      }
    }
    return wrecked;
  }

  private spawnNear(
    player: Car,
    distMin: number,
    distMax: number,
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = distMin + Math.random() * (distMax - distMin);
    let x = player.mesh.position.x + Math.sin(angle) * dist;
    let z = player.mesh.position.z + Math.cos(angle) * dist;
    const w = wrapPosition(x, z, this.citySize);
    x = w.x;
    z = w.z;

    const dx = wrapDelta(x, player.mesh.position.x, this.citySize);
    const dz = wrapDelta(z, player.mesh.position.z, this.citySize);
    const heading = Math.atan2(dx, dz);

    const cop = new PoliceCar(new THREE.Vector3(x, 0, z), heading);
    this.cops.push(cop);
    this.scene.add(cop.mesh);
  }

  reset(): void {
    for (const c of this.cops) {
      this.scene.remove(c.mesh);
    }
    this.cops.length = 0;
    this.wanted.reset();
    this.spawnCooldown = 0;
  }
}
