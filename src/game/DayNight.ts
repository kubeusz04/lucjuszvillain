import * as THREE from "three";

export interface StreetLamp {
  light: THREE.PointLight;
  bulb: THREE.Mesh;
  baseIntensity: number;
}

function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return a.clone().lerp(b, t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Full day length in real seconds */
const CYCLE_SECONDS = 180;

export class DayNightCycle {
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset */
  time = 0.22;
  private readonly ambient: THREE.AmbientLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly scene: THREE.Scene;
  private readonly skyRig: THREE.Group;
  private readonly sunMesh: THREE.Mesh;
  private readonly moonMesh: THREE.Mesh;
  private readonly moonHalo: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly fog: THREE.FogExp2;
  private lamps: StreetLamp[] = [];
  /** Optional weather overlay applied after base lighting */
  weatherOvercast = 0;
  weatherFogBoost = 0;
  weatherSunMul = 1;
  weatherAmbientMul = 1;

  constructor(
    scene: THREE.Scene,
    skyRig: THREE.Group,
    ambient: THREE.AmbientLight,
    hemi: THREE.HemisphereLight,
    sun: THREE.DirectionalLight,
    sunMesh: THREE.Mesh,
    moonMesh: THREE.Mesh,
    moonHalo: THREE.Mesh,
    stars: THREE.Points,
  ) {
    this.scene = scene;
    this.skyRig = skyRig;
    this.ambient = ambient;
    this.hemi = hemi;
    this.sun = sun;
    this.sunMesh = sunMesh;
    this.moonMesh = moonMesh;
    this.moonHalo = moonHalo;
    this.stars = stars;
    this.fog =
      scene.fog instanceof THREE.FogExp2
        ? scene.fog
        : new THREE.FogExp2(0x070910, 0.0065);
    scene.fog = this.fog;
  }

  setLamps(lamps: StreetLamp[]): void {
    this.lamps = lamps;
  }

  update(dt: number): void {
    this.time = (this.time + dt / CYCLE_SECONDS) % 1;
    this.apply();
  }

  /** 0 = full day, 1 = full night */
  get nightFactor(): number {
    const t = this.time;
    // Night from ~0.78 to ~0.22 wrapping
    if (t > 0.78 || t < 0.22) {
      if (t >= 0.78) return smoothstep(0.78, 0.9, t);
      return 1 - smoothstep(0.1, 0.22, t);
    }
    if (t < 0.35) return 1 - smoothstep(0.22, 0.35, t);
    if (t > 0.65) return smoothstep(0.65, 0.78, t);
    return 0;
  }

  get label(): string {
    const h = Math.floor(this.time * 24);
    const m = Math.floor((this.time * 24 - h) * 60);
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const n = this.nightFactor;
    const phase =
      n > 0.75 ? "Night" : n > 0.35 ? "Dusk" : n > 0.1 ? "Dawn" : "Day";
    return `${phase} ${hh}:${mm}`;
  }

  apply(): void {
    const n = this.nightFactor;
    const day = 1 - n;

    const nightSky = new THREE.Color(0x070910);
    const dawnSky = new THREE.Color(0x6a4a58);
    const daySky = new THREE.Color(0x6a9cc8);
    const duskSky = new THREE.Color(0xc47848);

    let sky: THREE.Color;
    const t = this.time;
    if (t < 0.22) sky = nightSky;
    else if (t < 0.32) sky = lerpColor(nightSky, dawnSky, smoothstep(0.22, 0.32, t));
    else if (t < 0.42) sky = lerpColor(dawnSky, daySky, smoothstep(0.32, 0.42, t));
    else if (t < 0.62) sky = daySky;
    else if (t < 0.72) sky = lerpColor(daySky, duskSky, smoothstep(0.62, 0.72, t));
    else if (t < 0.82) sky = lerpColor(duskSky, nightSky, smoothstep(0.72, 0.82, t));
    else sky = nightSky;

    this.scene.background = sky;
    this.fog.color.copy(sky);
    if (this.weatherOvercast > 0.01) {
      const gray = new THREE.Color(0x5a6068);
      (this.scene.background as THREE.Color).lerp(gray, this.weatherOvercast);
      this.fog.color.copy(this.scene.background as THREE.Color);
    }
    this.fog.density = 0.004 + n * 0.0035 + this.weatherFogBoost;

    this.ambient.color.setRGB(
      0.55 * day + 0.12 * n,
      0.58 * day + 0.16 * n,
      0.72 * day + 0.28 * n,
    );
    this.ambient.intensity = (0.35 + day * 0.55) * this.weatherAmbientMul;

    this.hemi.color.set(daySky).lerp(new THREE.Color(0x1c2840), n);
    this.hemi.groundColor.set(0x4a4030).lerp(new THREE.Color(0x121018), n);
    this.hemi.intensity = (0.25 + day * 0.55) * this.weatherAmbientMul;

    // Sun / moon arc
    const angle = this.time * Math.PI * 2 - Math.PI / 2;
    const radius = 220;
    const sx = Math.cos(angle) * radius;
    const sy = Math.sin(angle) * radius;
    const sz = 40;

    this.sun.position.set(sx, Math.max(8, sy), sz);
    this.sun.color.set(0xfff0d0).lerp(new THREE.Color(0xb8c8e0), n);
    this.sun.intensity =
      Math.max(0.05, day * 1.35 + n * 0.25) * this.weatherSunMul;

    this.sunMesh.position.set(sx * 0.9, Math.max(-40, sy * 0.9), sz);
    this.moonMesh.position.set(-sx * 0.85, Math.max(-40, -sy * 0.85), -sz);
    this.moonHalo.position.copy(this.moonMesh.position);

    const sunUp = sy > 10 ? 1 : Math.max(0, sy / 10);
    const moonUp = -sy > 10 ? 1 : Math.max(0, -sy / 10);
    this.sunMesh.visible = sunUp > 0.05 && this.weatherOvercast < 0.85;
    (this.sunMesh.material as THREE.MeshBasicMaterial).opacity =
      sunUp * (1 - this.weatherOvercast * 0.7);
    this.moonMesh.visible = moonUp > 0.05 && n > 0.15;
    this.moonHalo.visible = this.moonMesh.visible;
    (this.moonHalo.material as THREE.MeshBasicMaterial).opacity =
      0.12 * moonUp * n;

    const starsMat = this.stars.material as THREE.PointsMaterial;
    starsMat.opacity = n * n * (1 - this.weatherOvercast);
    this.stars.visible = n > 0.05 && this.weatherOvercast < 0.7;

    void this.skyRig;
  }

  /** Cull distant street lamps — call each frame with camera position */
  updateLampCull(camX: number, camZ: number): void {
    const n = this.nightFactor;
    const lampMul = smoothstep(0.15, 0.55, n);
    const maxDistSq = 85 * 85;
    for (const lamp of this.lamps) {
      const dx = lamp.light.position.x - camX;
      const dz = lamp.light.position.z - camZ;
      const near = dx * dx + dz * dz < maxDistSq;
      if (near && lampMul > 0.08) {
        lamp.light.intensity = lamp.baseIntensity * lampMul;
        lamp.light.visible = true;
        lamp.bulb.visible = true;
        const mat = lamp.bulb.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.35 + lampMul * 0.65;
        mat.transparent = true;
      } else {
        lamp.light.intensity = 0;
        lamp.light.visible = false;
        lamp.bulb.visible = false;
      }
    }
  }
}
