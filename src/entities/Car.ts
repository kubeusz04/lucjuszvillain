import * as THREE from "three";
import type { Input } from "../input/Input";
import type { AABB } from "../world/City";
import { wrapPosition } from "../world/wrap";
import type { CarStats, CarVisuals } from "../game/Upgrades";
import { PAINT_DEFS } from "../game/Upgrades";
import { assetUrl } from "../assetUrl";

const TANK_HALF_W = 1.45;
const TANK_HALF_L = 2.6;

const DEFAULT_STATS: CarStats = {
  accel: 22,
  brake: 36,
  reverse: 10,
  maxSpeed: 26,
  maxReverse: 9,
  friction: 14,
  turnRate: 1.85,
  maxLives: 3,
  hitInvuln: 1.35,
};

export class Car {
  readonly mesh: THREE.Group;
  speed = 0;
  heading = 0;
  stats: CarStats = { ...DEFAULT_STATS };
  /** 1 = dry, lower = wet / slippery */
  weatherGrip = 1;
  private justWrapped = false;
  private camYaw = 0;
  private camPitch = 0.5;
  private turretYaw = 0;

  private readonly cameraOffset = new THREE.Vector3(0, 10, 18);
  private readonly cameraLook = new THREE.Vector3(0, 1.6, 0);
  private readonly camPos = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private bodyMat!: THREE.MeshStandardMaterial;
  private turretMat!: THREE.MeshStandardMaterial;
  private trackMat!: THREE.MeshStandardMaterial;
  private spoiler!: THREE.Mesh;
  private neonLight!: THREE.PointLight;
  private neonMesh!: THREE.Mesh;
  private turret!: THREE.Group;

  constructor(start: THREE.Vector3) {
    this.mesh = this.buildMesh();
    this.mesh.position.copy(start);
    this.mesh.position.y = 0;
    this.heading = -Math.PI / 2;
    this.mesh.rotation.y = this.heading;
    this.camYaw = this.heading;
  }

  applyStats(stats: CarStats): void {
    this.stats = { ...stats };
  }

  applyVisuals(visuals: CarVisuals): void {
    const paint = PAINT_DEFS.find((p) => p.id === visuals.paint) ?? PAINT_DEFS[0];
    this.bodyMat.color.setHex(paint.color);
    this.bodyMat.metalness = Math.max(0.45, paint.metalness);
    this.bodyMat.roughness = 0.4 - paint.metalness * 0.1;
    this.turretMat.color.setHex(paint.color);
    this.turretMat.metalness = this.bodyMat.metalness;
    this.turretMat.roughness = this.bodyMat.roughness;

    this.spoiler.visible = visuals.spoiler;
    this.neonLight.visible = visuals.neon;
    this.neonMesh.visible = visuals.neon;
    this.trackMat.color.setHex(visuals.rims ? 0xb0b0b8 : 0x1a1a1a);
    this.trackMat.metalness = visuals.rims ? 0.75 : 0.25;
    this.trackMat.roughness = visuals.rims ? 0.3 : 0.75;
  }

  private buildMesh(): THREE.Group {
    const g = new THREE.Group();

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0x4a5a3a,
      roughness: 0.55,
      metalness: 0.45,
    });
    this.turretMat = new THREE.MeshStandardMaterial({
      color: 0x4a5a3a,
      roughness: 0.5,
      metalness: 0.5,
    });
    this.trackMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.75,
      metalness: 0.25,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.8,
      metalness: 0.2,
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.4,
      metalness: 0.7,
    });

    // Hull
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.95, 4.4),
      this.bodyMat,
    );
    hull.position.y = 0.85;
    hull.castShadow = true;
    g.add(hull);

    // Sloped front
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.55, 1.1),
      this.bodyMat,
    );
    nose.position.set(0, 0.95, 2.0);
    nose.rotation.x = -0.35;
    nose.castShadow = true;
    g.add(nose);

    // Side skirts / tracks housings
    for (const sx of [-1.45, 1.45]) {
      const skirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.7, 4.5),
        this.trackMat,
      );
      skirt.position.set(sx, 0.45, 0);
      skirt.castShadow = true;
      g.add(skirt);

      // Track wheels
      for (const z of [-1.5, -0.5, 0.5, 1.5]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.32, 0.35, 8),
          darkMat,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx, 0.32, z);
        g.add(wheel);
      }
    }

    // Turret
    this.turret = new THREE.Group();
    this.turret.position.set(0, 1.35, -0.15);
    g.add(this.turret);

    const turretBody = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, 0.75, 10),
      this.turretMat,
    );
    turretBody.position.y = 0.4;
    turretBody.castShadow = true;
    this.turret.add(turretBody);

    const turretTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 0.28, 8),
      this.turretMat,
    );
    turretTop.position.y = 0.9;
    this.turret.add(turretTop);

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 3.2, 8),
      barrelMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.45, 2.2);
    barrel.castShadow = true;
    this.turret.add(barrel);

    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.18, 0.35, 8),
      darkMat,
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.45, 3.7);
    this.turret.add(muzzle);

    // Hatch / cupola
    const hatch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.2, 8),
      darkMat,
    );
    hatch.position.set(0.35, 1.05, -0.2);
    this.turret.add(hatch);

    this.addCatRider(this.turret);

    // "Spoiler" → rear crate / ammo box
    this.spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.55, 0.7),
      this.bodyMat,
    );
    this.spoiler.position.set(0, 1.35, -2.0);
    this.spoiler.visible = false;
    this.spoiler.castShadow = true;
    g.add(this.spoiler);

    this.neonMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.08, 4.0),
      new THREE.MeshBasicMaterial({ color: 0xff44aa }),
    );
    this.neonMesh.position.set(0, 0.1, 0);
    this.neonMesh.visible = false;
    g.add(this.neonMesh);

    this.neonLight = new THREE.PointLight(0xff44aa, 1.8, 12, 2);
    this.neonLight.position.set(0, 0.35, 0);
    this.neonLight.visible = false;
    g.add(this.neonLight);

    return g;
  }

  /** Burglar cat with kimchi sack — billboard on the turret */
  private addCatRider(turret: THREE.Group): void {
    const loader = new THREE.TextureLoader();
    loader.load(assetUrl("models/kimchi-cat.png"), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.35,
        depthWrite: true,
        opacity: 1,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.4, 2.4, 1);
      sprite.position.set(0.15, 2.15, -0.1);
      sprite.renderOrder = 2;
      turret.add(sprite);
    });
  }

  reset(start: THREE.Vector3): void {
    this.mesh.position.copy(start);
    this.mesh.position.y = 0;
    this.speed = 0;
    this.heading = -Math.PI / 2;
    this.mesh.rotation.y = this.heading;
    this.camYaw = this.heading;
    this.camPitch = 0.5;
    this.turretYaw = 0;
    this.turret.rotation.y = 0;
  }

  applyBump(nx: number, nz: number, strength: number, buildings?: AABB[]): void {
    const len = Math.hypot(nx, nz) || 1;
    const ux = nx / len;
    const uz = nz / len;
    const prevX = this.mesh.position.x;
    const prevZ = this.mesh.position.z;
    // Tiny knockback — tank is heavy; avoids being shoved into walls
    this.mesh.position.x += ux * strength * 0.06;
    this.mesh.position.z += uz * strength * 0.06;
    if (buildings && this.overlapsBuildings(buildings)) {
      this.mesh.position.x = prevX;
      this.mesh.position.z = prevZ;
    }
    this.speed *= 0.65;
  }

  overlapsBuildings(buildings: AABB[]): boolean {
    return this.collidesBuildings(buildings);
  }

  update(dt: number, input: Input, buildings: AABB[], citySize: number): void {
    const s = this.stats;
    const grip = THREE.MathUtils.clamp(this.weatherGrip, 0.5, 1);
    const accel = s.accel * (0.75 + grip * 0.25);
    const turn = s.turnRate * grip * 0.85;
    const maxSpd = s.maxSpeed * (0.85 + grip * 0.15);
    const maxRev = s.maxReverse * (0.85 + grip * 0.15);
    const friction = s.friction * (2.1 - grip);

    if (input.driveAxis > 0.05) {
      this.speed += accel * input.driveAxis * dt;
    } else if (input.driveAxis < -0.05) {
      if (this.speed > 0.5) {
        this.speed -= s.brake * Math.abs(input.driveAxis) * dt;
      } else {
        this.speed -= s.reverse * Math.abs(input.driveAxis) * dt;
      }
    } else {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - friction * dt);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + friction * dt);
      }
    }

    this.speed = THREE.MathUtils.clamp(this.speed, -maxRev, maxSpd);

    // Tanks can pivot at low speed
    const steerFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 6, 0.45, 1);
    const steer = input.steerAxis;
    if (Math.abs(this.speed) > 0.15 || Math.abs(steer) > 0.08) {
      const dir = this.speed >= 0 ? 1 : -1;
      // steer -1 = left (heading+), +1 = right (heading-)
      this.heading -= turn * steerFactor * dir * steer * dt;
    }

    const prevX = this.mesh.position.x;
    const prevZ = this.mesh.position.z;

    this.mesh.position.x += Math.sin(this.heading) * this.speed * dt;
    this.mesh.position.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.rotation.y = this.heading;

    // Turret slowly tracks camera look / forward bias
    const desiredTurret = THREE.MathUtils.euclideanModulo(
      this.camYaw - this.heading + Math.PI,
      Math.PI * 2,
    ) - Math.PI;
    this.turretYaw = THREE.MathUtils.lerp(this.turretYaw, desiredTurret, 1 - Math.exp(-3 * dt));
    this.turret.rotation.y = this.turretYaw;

    const wrapped = wrapPosition(
      this.mesh.position.x,
      this.mesh.position.z,
      citySize,
    );
    this.justWrapped = wrapped.wrapped;
    this.mesh.position.x = wrapped.x;
    this.mesh.position.z = wrapped.z;

    if (this.collidesBuildings(buildings)) {
      this.mesh.position.x = prevX;
      this.mesh.position.z = prevZ;
      this.speed *= -0.25;
      this.justWrapped = false;
    }
  }

  private collidesBuildings(buildings: AABB[]): boolean {
    const aabb = this.getAABB();
    for (const b of buildings) {
      if (
        aabb.minX < b.maxX &&
        aabb.maxX > b.minX &&
        aabb.minZ < b.maxZ &&
        aabb.maxZ > b.minZ
      ) {
        return true;
      }
    }
    return false;
  }

  getAABB(): AABB {
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;
    const r = Math.max(TANK_HALF_W, TANK_HALF_L) * 0.9;
    return {
      minX: x - r,
      maxX: x + r,
      minZ: z - r,
      maxZ: z + r,
    };
  }

  getHitRadius(): number {
    return 2.6;
  }

  /** World yaw the barrel is aiming (hull + turret) */
  getFireHeading(): number {
    return this.heading + this.turretYaw;
  }

  /** Tip of the cannon in world space */
  getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const h = this.getFireHeading();
    const dist = 4.15;
    out.set(
      this.mesh.position.x + Math.sin(h) * dist,
      1.85,
      this.mesh.position.z + Math.cos(h) * dist,
    );
    return out;
  }

  updateCamera(
    camera: THREE.PerspectiveCamera,
    dt: number,
    lookX = 0,
    lookY = 0,
  ): void {
    const sens = 0.0035;
    this.camYaw -= lookX * sens;
    this.camPitch = THREE.MathUtils.clamp(
      this.camPitch + lookY * sens,
      0.05,
      1.15,
    );

    const dist = this.cameraOffset.z;
    const flat = Math.cos(this.camPitch) * dist;
    const height = 4 + Math.sin(this.camPitch) * 18;

    const desired = new THREE.Vector3(
      this.mesh.position.x - Math.sin(this.camYaw) * flat,
      height,
      this.mesh.position.z - Math.cos(this.camYaw) * flat,
    );

    if (this.justWrapped) {
      this.camPos.copy(desired);
      this.justWrapped = false;
    } else {
      this.camPos.lerp(desired, 1 - Math.exp(-6 * dt));
    }
    camera.position.copy(this.camPos);

    const skyLift = THREE.MathUtils.mapLinear(this.camPitch, 0.05, 1.15, 6, 0);
    this.lookTarget
      .copy(this.mesh.position)
      .add(this.cameraLook)
      .add(new THREE.Vector3(0, skyLift, 0));
    camera.lookAt(this.lookTarget);
  }
}
