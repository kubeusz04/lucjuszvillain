import * as THREE from "three";

export type WeatherKind = "clear" | "cloudy" | "rain" | "storm" | "fog";

export interface WeatherModifiers {
  kind: WeatherKind;
  label: string;
  /** Extra fog density added on top of day/night */
  fogBoost: number;
  /** Multiply sun intensity */
  sunMul: number;
  /** Multiply ambient intensity */
  ambientMul: number;
  /** 0..1 gray/dark overlay on sky */
  overcast: number;
  /** Car handling multiplier (1 = dry) */
  grip: number;
  /** Rain particle intensity 0..1 */
  rain: number;
}

const LABELS: Record<WeatherKind, string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  rain: "Rain",
  storm: "Storm",
  fog: "Fog",
};

const POOL: WeatherKind[] = [
  "clear",
  "clear",
  "cloudy",
  "cloudy",
  "rain",
  "rain",
  "storm",
  "fog",
];

export class WeatherSystem {
  kind: WeatherKind = "clear";
  private nextKind: WeatherKind = "clear";
  private blend = 1;
  private timer = 25 + Math.random() * 20;
  private lightningT = 0;
  private flash = 0;

  private readonly rain: THREE.Points;
  private readonly rainPositions: Float32Array;
  private readonly rainCount = 1200;
  private readonly rainGroup = new THREE.Group();
  private readonly flashLight: THREE.AmbientLight;

  constructor(scene: THREE.Scene) {
    this.rainPositions = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 80;
      this.rainPositions[i * 3 + 1] = Math.random() * 40;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.rainPositions, 3),
    );
    this.rain = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xa8c0d8,
        size: 0.15,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rainGroup.add(this.rain);
    scene.add(this.rainGroup);

    this.flashLight = new THREE.AmbientLight(0xc8d8ff, 0);
    scene.add(this.flashLight);
  }

  get label(): string {
    return LABELS[this.kind];
  }

  get modifiers(): WeatherModifiers {
    const from = this.modsFor(this.kind);
    const to = this.modsFor(this.nextKind);
    const t = this.blend;
    return {
      kind: t > 0.5 ? this.nextKind : this.kind,
      label: t > 0.5 ? LABELS[this.nextKind] : LABELS[this.kind],
      fogBoost: THREE.MathUtils.lerp(from.fogBoost, to.fogBoost, t),
      sunMul: THREE.MathUtils.lerp(from.sunMul, to.sunMul, t),
      ambientMul: THREE.MathUtils.lerp(from.ambientMul, to.ambientMul, t),
      overcast: THREE.MathUtils.lerp(from.overcast, to.overcast, t),
      grip: THREE.MathUtils.lerp(from.grip, to.grip, t),
      rain: THREE.MathUtils.lerp(from.rain, to.rain, t),
    };
  }

  private modsFor(kind: WeatherKind): WeatherModifiers {
    switch (kind) {
      case "clear":
        return {
          kind,
          label: LABELS[kind],
          fogBoost: 0,
          sunMul: 1,
          ambientMul: 1,
          overcast: 0,
          grip: 1,
          rain: 0,
        };
      case "cloudy":
        return {
          kind,
          label: LABELS[kind],
          fogBoost: 0.0015,
          sunMul: 0.65,
          ambientMul: 0.85,
          overcast: 0.35,
          grip: 0.98,
          rain: 0,
        };
      case "rain":
        return {
          kind,
          label: LABELS[kind],
          fogBoost: 0.003,
          sunMul: 0.4,
          ambientMul: 0.7,
          overcast: 0.55,
          grip: 0.78,
          rain: 0.85,
        };
      case "storm":
        return {
          kind,
          label: LABELS[kind],
          fogBoost: 0.0045,
          sunMul: 0.25,
          ambientMul: 0.55,
          overcast: 0.75,
          grip: 0.65,
          rain: 1,
        };
      case "fog":
        return {
          kind,
          label: LABELS[kind],
          fogBoost: 0.012,
          sunMul: 0.45,
          ambientMul: 0.75,
          overcast: 0.5,
          grip: 0.88,
          rain: 0.05,
        };
    }
  }

  update(dt: number, camera: THREE.Camera): WeatherModifiers {
    this.timer -= dt;
    if (this.timer <= 0 && this.blend >= 1) {
      this.kind = this.nextKind;
      let next = POOL[Math.floor(Math.random() * POOL.length)];
      if (next === this.kind) {
        next = POOL[Math.floor(Math.random() * POOL.length)];
      }
      this.nextKind = next;
      this.blend = 0;
      this.timer = 28 + Math.random() * 35;
    }

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 8);
      if (this.blend >= 1) this.kind = this.nextKind;
    }

    const mods = this.modifiers;

    // Lightning during storm
    if (mods.kind === "storm" || (this.nextKind === "storm" && this.blend > 0.4)) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.flash = 0.7 + Math.random() * 0.6;
        this.lightningT = 3 + Math.random() * 7;
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.5);
    }
    this.flashLight.intensity = this.flash * 2.2;

    this.updateRain(dt, camera, mods.rain);
    return mods;
  }

  private updateRain(dt: number, camera: THREE.Camera, intensity: number): void {
    const mat = this.rain.material as THREE.PointsMaterial;
    mat.opacity = intensity * 0.55;
    this.rain.visible = intensity > 0.05;
    this.rainGroup.position.copy(camera.position);

    if (intensity < 0.05) return;

    const speed = 28 + intensity * 35;
    const drift = 4 + intensity * 6;
    const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < this.rainCount; i++) {
      let y = pos.getY(i) - speed * dt;
      let x = pos.getX(i) + drift * dt * 0.35;
      let z = pos.getZ(i);
      if (y < -2) {
        y = 25 + Math.random() * 20;
        x = (Math.random() - 0.5) * 80;
        z = (Math.random() - 0.5) * 80;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }
}
