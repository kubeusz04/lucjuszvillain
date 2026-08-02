import * as THREE from "three";
import { Input, loadControlMode, type ControlMode } from "../input/Input";
import { TouchControls } from "../input/TouchControls";
import { HUD } from "../ui/HUD";
import { Minimap } from "../ui/Minimap";
import { City } from "../world/City";
import { addCityWrapTiles, updateCityWrapTiles, type WrapTile } from "../world/InfiniteWrap";
import { ShopNetwork } from "../world/Shops";
import { Car } from "../entities/Car";
import { PedestrianManager } from "../entities/Pedestrian";
import { PoliceManager } from "../entities/Police";
import { KimchiManager } from "../entities/Kimchi";
import { checkCarPedestrianHits, HitFx } from "../systems/Collision";
import { ProjectileSystem } from "../systems/Projectiles";
import { UpgradeSystem } from "./Upgrades";
import { Highscore } from "./Highscore";
import { MissionSystem } from "./Missions";
import { DayNightCycle } from "./DayNight";
import { WeatherSystem } from "./Weather";
import { Progress } from "./Progress";
import { EngineSound } from "../audio/EngineSound";
import { Radio } from "../audio/Radio";
import { playFireSfx } from "../audio/Sfx";
import type { PeopleLibrary } from "../assets/PeopleModels";
import type { KimchiTemplate } from "../assets/KimchiModel";

export type GameState = "menu" | "playing" | "paused" | "gameover";

const ROUND_TIME = 90;

export class Game {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly input: Input;
  private readonly touchControls: TouchControls;
  private readonly hud: HUD;
  private minimap!: Minimap;
  private readonly progress = new Progress();
  private readonly upgrades = new UpgradeSystem(this.progress);
  private readonly highscore = new Highscore(this.progress);
  private readonly missions = new MissionSystem();
  private readonly engine = new EngineSound();
  private readonly radio = new Radio();
  private readonly people: PeopleLibrary;
  private readonly kimchiTpl: KimchiTemplate;
  private readonly skyRig = new THREE.Group();
  private dayNight!: DayNightCycle;
  private weather!: WeatherSystem;
  private missionNextTimer = 0;
  private lastDistrictId: string | null = null;
  private playTimeFlush = 0;

  private city!: City;
  private wrapTiles: WrapTile[] = [];
  private shops!: ShopNetwork;
  private car!: Car;
  private peds!: PedestrianManager;
  private police!: PoliceManager;
  private kimchi!: KimchiManager;
  private hitFx!: HitFx;
  private projectiles!: ProjectileSystem;
  private sunLight!: THREE.DirectionalLight;

  private state: GameState = "menu";
  private score = 0;
  private lives = 3;
  private maxLives = 3;
  private hitInvuln = 0;
  private timeLeft = ROUND_TIME;
  private confirmWasDown = false;
  private shopWasDown = false;
  private interactWasDown = false;
  private pauseWasDown = false;
  private radioWasDown = false;
  private readonly aimPoint = new THREE.Vector3();
  private readonly muzzlePoint = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    people: PeopleLibrary,
    kimchiTpl: KimchiTemplate,
  ) {
    this.people = people;
    this.kimchiTpl = kimchiTpl;
    this.input = new Input(canvas);
    const savedMode = loadControlMode();
    if (savedMode) this.input.setControlMode(savedMode);
    this.touchControls = new TouchControls(this.input);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070910);
    this.scene.fog = new THREE.FogExp2(0x070910, 0.0065);

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.hud = new HUD(() => this.startRound());
    this.hud.bindProgress(this.progress);
    this.hud.bindUpgrades(this.upgrades, () => this.applyUpgrades());
    this.hud.bindMenuActions({
      onResume: () => this.resumeGame(),
      onQuitToMenu: () => this.quitToMenu(),
      onResetProgress: () => this.resetProgress(),
      onControlMode: (mode: ControlMode) => {
        this.input.setControlMode(mode);
        this.syncTouchControls();
      },
    });

    this.buildWorld();
    this.minimap = new Minimap(this.city.size, this.city.cfg);
    this.applyUpgrades();
    this.setupLights();

    window.addEventListener("resize", () => this.onResize());

    this.hud.showOverlay("menu", 0, this.highscore.value);
    this.hud.setBest(this.highscore.value);
    this.hud.showHud(false);
    this.minimap.setVisible(false);
    this.syncTouchControls();

    const start = this.city.getStartPosition();
    this.camera.position.set(start.x - 18, 22, start.z + 28);
    this.camera.lookAt(start.x, 0, start.z);
  }

  private buildWorld(): void {
    this.city = new City();
    this.scene.add(this.city.group);
    this.wrapTiles = addCityWrapTiles(this.scene, this.city.group, this.city.size);
    this.city.buildDestructionIndex(this.wrapTiles);

    this.shops = new ShopNetwork(this.city.cfg);
    this.scene.add(this.shops.group);

    this.car = new Car(this.city.getStartPosition());
    this.scene.add(this.car.mesh);

    this.peds = new PedestrianManager(
      this.scene,
      this.city.spawnPoints,
      this.city.size,
      100,
      this.city.crosswalks,
      this.people,
    );

    this.police = new PoliceManager(this.scene, this.city.size);
    this.kimchi = new KimchiManager(
      this.scene,
      this.city.spawnPoints,
      this.city.size,
      40,
      this.kimchiTpl,
    );
    this.hitFx = new HitFx(this.scene);
    this.projectiles = new ProjectileSystem(this.scene);
  }

  private applyUpgrades(): void {
    this.car.applyStats(this.upgrades.getStats());
    this.car.applyVisuals(this.upgrades.getVisuals());
    this.hud.setCash(this.upgrades.cash);
  }

  private resetProgress(): void {
    this.progress.reset();
    this.upgrades.loadFromProgress();
    this.applyUpgrades();
    this.hud.setBest(this.highscore.value);
    this.hud.setCash(this.upgrades.cash);
    this.hud.refreshSaveStatus();
    this.hud.showMissionToast("PROGRESS CLEARED");
  }

  private pauseGame(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.radio.setActive(false);
    this.hud.closeShop();
    this.hud.setShopPrompt(null);
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.showOverlay("pause", this.score, this.highscore.value);
    this.syncTouchControls();
  }

  private resumeGame(): void {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.engine.unlock();
    this.radio.unlock();
    this.hud.closeShop();
    this.hud.hideOverlay();
    this.hud.showHud(true);
    this.minimap.setVisible(true);
    this.radio.setActive(true);
    this.hud.setRadio(this.radio.on);
    this.syncTouchControls();
  }

  private quitToMenu(): void {
    this.progress.flushPlayTime();
    this.state = "menu";
    this.engine.stop(true);
    this.radio.stop(true);
    this.hud.closeShop();
    this.hud.showHud(false);
    this.minimap.setVisible(false);
    this.hud.showOverlay("menu", 0, this.highscore.value);
    this.car.reset(this.city.getStartPosition());
    this.police.reset();
    this.hitFx.clear();
    this.projectiles.clear();
    this.syncTouchControls();
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0x2a3548, 0.4);
    this.scene.add(ambient);

    const fill = new THREE.HemisphereLight(0x1c2840, 0x121018, 0.45);
    this.scene.add(fill);

    this.scene.add(this.skyRig);

    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(22, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        fog: false,
        depthWrite: false,
        transparent: true,
        opacity: 1,
      }),
    );
    sunMesh.renderOrder = -2;
    this.skyRig.add(sunMesh);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(16, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0xfff5e0,
        fog: false,
        depthWrite: false,
      }),
    );
    moon.renderOrder = -2;
    this.skyRig.add(moon);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(28, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xc8d8f0,
        transparent: true,
        opacity: 0.14,
        fog: false,
        depthWrite: false,
      }),
    );
    halo.renderOrder = -3;
    this.skyRig.add(halo);

    const count = 3200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const radius = 500;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.randFloat(0.05, 1));
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const bright = 0.75 + Math.random() * 0.25;
      colors[i * 3] = bright;
      colors[i * 3 + 1] = bright;
      colors[i * 3 + 2] = bright;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 3,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        fog: false,
      }),
    );
    stars.frustumCulled = false;
    stars.renderOrder = -4;
    this.skyRig.add(stars);

    const sunLight = new THREE.DirectionalLight(0xfff0d0, 1.15);
    sunLight.position.set(80, 160, 40);
    sunLight.target.position.set(this.city.size / 2, 0, this.city.size / 2);
    this.scene.add(sunLight.target);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.bias = -0.0003;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 280;
    sunLight.shadow.camera.left = -70;
    sunLight.shadow.camera.right = 70;
    sunLight.shadow.camera.top = 70;
    sunLight.shadow.camera.bottom = -70;
    this.scene.add(sunLight);
    this.sunLight = sunLight;

    this.dayNight = new DayNightCycle(
      this.scene,
      this.skyRig,
      ambient,
      fill,
      sunLight,
      sunMesh,
      moon,
      halo,
      stars,
    );
    this.dayNight.setLamps(this.city.streetLamps);
    this.dayNight.apply();
    this.weather = new WeatherSystem(this.scene);
  }

  private syncSky(): void {
    this.skyRig.position.copy(this.camera.position);
  }

  /** Keep the sun shadow frustum around the car (not the whole city). */
  private syncSunShadow(): void {
    const px = this.car.mesh.position.x;
    const pz = this.car.mesh.position.z;
    const cx = this.city.size / 2;
    const cz = this.city.size / 2;
    // DayNight sets absolute sun position; re-aim at the car with the same offset
    const ox = this.sunLight.position.x - cx;
    const oy = this.sunLight.position.y;
    const oz = this.sunLight.position.z - cz;
    this.sunLight.target.position.set(px, 0, pz);
    this.sunLight.position.set(px + ox, oy, pz + oz);
    this.sunLight.target.updateMatrixWorld();
  }

  private startRound(): void {
    this.hud.closeShop();
    this.score = 0;
    this.timeLeft = ROUND_TIME;
    this.state = "playing";
    this.progress.recordRun();
    this.engine.unlock();
    this.radio.unlock();
    this.applyUpgrades();
    this.maxLives = this.car.stats.maxLives;
    this.lives = this.maxLives;
    this.hitInvuln = 0;
    this.car.reset(this.city.getStartPosition());
    this.peds.reset();
    this.police.reset();
    this.kimchi.reset();
    this.hitFx.clear();
    this.projectiles.clear();
    this.missions.startRound();
    this.missionNextTimer = 0;
    this.lastDistrictId = null;
    this.hud.setScore(0);
    this.hud.setBest(this.highscore.value);
    this.hud.setTime(ROUND_TIME);
    this.hud.setWanted(0);
    this.hud.setKimchi(0);
    this.hud.setLives(this.lives, this.maxLives);
    this.hud.setCash(this.upgrades.cash);
    this.hud.setSpeed(0);
    this.hud.setMission(this.missions.label);
    this.hud.setRadio(this.radio.on);
    this.hud.setDistrict(
      this.city.getDistrictAt(this.car.mesh.position.x, this.car.mesh.position.z)
        .name,
    );
    this.hud.hideOverlay();
    this.hud.showHud(true);
    this.minimap.setVisible(true);
    this.radio.setActive(true);
    this.hud.refreshSaveStatus();
    this.syncTouchControls();
  }

  private applyMissionReward(reward: { score: number; cash: number } | null): void {
    if (!reward) {
      this.hud.setMission(this.missions.label);
      return;
    }
    this.score += reward.score;
    this.upgrades.addCash(reward.cash);
    this.progress.recordMission();
    this.hud.setScore(this.score);
    this.hud.setCash(this.upgrades.cash);
    this.hud.setMission(this.missions.label);
    this.hud.showMissionToast(
      `MISSION COMPLETE  +${reward.score}  $${reward.cash}`,
    );
    this.missionNextTimer = 1.6;
  }

  private endRound(reason: "time" | "busted" = "time"): void {
    this.state = "gameover";
    this.radio.setActive(false);
    this.progress.flushPlayTime();
    const isNew = this.highscore.submit(this.score);
    this.hud.showHud(false);
    this.minimap.setVisible(false);
    this.hud.setBest(this.highscore.value);
    this.hud.showOverlay(
      reason === "busted" ? "busted" : "gameover",
      this.score,
      this.highscore.value,
      isNew,
    );
    this.syncTouchControls();
  }

  private crushPropsNearTank(): void {
    if (Math.abs(this.car.speed) < 14) return;
    const x = this.car.mesh.position.x;
    const z = this.car.mesh.position.z;
    const r = this.car.getHitRadius() * 0.85;
    let crushed = 0;
    while (crushed < 2) {
      const id = this.city.findPropNear(x, z, r);
      if (id === null) break;
      if (!this.city.destroy(id)) break;
      crushed += 1;
      this.score += 1;
      this.upgrades.addCash(4);
      this.hitFx.spawnRubble(
        new THREE.Vector3(x, 0.6, z),
      );
      this.police.onCrime(0.28);
    }
    if (crushed > 0) {
      this.hud.setScore(this.score);
      this.hud.setCash(this.upgrades.cash);
      this.car.speed *= 0.92;
      this.applyMissionReward(this.missions.onScore(this.score));
    }
  }

  private syncTouchControls(): void {
    const show =
      this.input.controlMode === "android" &&
      this.state === "playing" &&
      !this.hud.shopOpen;
    this.touchControls.setVisible(show);
    document.body.classList.toggle(
      "touch-mode",
      this.input.controlMode === "android",
    );
  }

  update(dt: number): void {
    this.dayNight.update(dt);
    const wx = this.weather.update(dt, this.camera);
    this.dayNight.weatherFogBoost = wx.fogBoost;
    this.dayNight.weatherSunMul = wx.sunMul;
    this.dayNight.weatherAmbientMul = wx.ambientMul;
    this.dayNight.weatherOvercast = wx.overcast;
    this.dayNight.apply();
    this.car.weatherGrip = wx.grip;
    this.hud.setClock(this.dayNight.label);
    this.hud.setWeather(wx.label);

    // Engine: drive with speed, slow fade when stopped / not playing
    const engineActive =
      this.state === "playing" && !this.hud.shopOpen;
    this.engine.update(dt, engineActive ? this.car.speed : 0, engineActive);
    this.radio.setActive(this.state === "playing" && !this.hud.shopOpen);
    this.radio.update(dt);

    const radioKey = this.input.radio;
    if (radioKey && !this.radioWasDown && this.state === "playing") {
      const on = this.radio.toggle();
      this.hud.setRadio(on);
      this.hud.showMissionToast(on ? "RADIO ON" : "RADIO OFF");
      this.radio.setActive(on && !this.hud.shopOpen);
    }
    this.radioWasDown = radioKey;

    const pause = this.input.pause;
    if (pause && !this.pauseWasDown) {
      if (this.state === "playing" && !this.hud.shopOpen) {
        this.pauseGame();
      } else if (this.state === "paused") {
        if (this.hud.shopOpen) this.hud.closeShop();
        else this.resumeGame();
      }
    }
    this.pauseWasDown = pause;

    const shop = this.input.shop;
    if (shop && !this.shopWasDown) {
      if (this.state === "playing" || this.state === "paused" || this.state === "menu" || this.state === "gameover") {
        this.hud.toggleShop();
        this.syncTouchControls();
      }
    }
    this.shopWasDown = shop;

    const interact = this.input.interact;
    if (interact && !this.interactWasDown && this.state === "playing") {
      if (this.hud.shopOpen) {
        this.hud.closeShop();
        this.syncTouchControls();
      } else {
        const near = this.shops.nearest(
          this.car.mesh.position.x,
          this.car.mesh.position.z,
        );
        if (near && Math.abs(this.car.speed) < 6) {
          this.hud.openShop(near.kind, near.name);
          this.syncTouchControls();
        }
      }
    }
    this.interactWasDown = interact;

    if (this.hud.shopOpen) {
      this.peds.syncWrapGhosts(this.camera.position);
      this.hud.updateToast(dt);
      return;
    }

    const confirm = this.input.confirm;
    if (confirm && !this.confirmWasDown) {
      if (
        (this.state === "menu" || this.state === "gameover") &&
        this.hud.canConfirmStart
      ) {
        this.startRound();
      } else if (this.state === "paused") {
        this.resumeGame();
      }
    }
    this.confirmWasDown = confirm;

    if (this.state === "paused") {
      this.hud.updateToast(dt);
      return;
    }

    if (this.state !== "playing") {
      if (this.state === "menu") {
        const t = performance.now() * 0.00015;
        const start = this.city.getStartPosition();
        this.camera.position.set(
          start.x + Math.sin(t) * 30,
          20 + Math.sin(t * 0.7) * 3,
          start.z + Math.cos(t) * 30,
        );
        this.camera.lookAt(this.city.size / 2, 2, this.city.size / 2);
      }
      this.peds.update(dt * 0.5);
      this.hitFx.update(dt);
      return;
    }

    this.progress.recordPlayTime(dt);
    this.playTimeFlush += dt;
    if (this.playTimeFlush >= 15) {
      this.playTimeFlush = 0;
      this.progress.flushPlayTime();
    }

    this.timeLeft -= dt;
    this.hud.setTime(this.timeLeft);
    if (this.timeLeft <= 0) {
      this.endRound();
      return;
    }

    this.car.update(dt, this.input, this.city.buildings, this.city.size);
    this.crushPropsNearTank();
    this.hud.setSpeed(this.car.speed);
    const look = this.input.consumeLook();
    this.car.updateCamera(this.camera, dt, look.x, look.y);
    this.updateCrosshair();
    this.shops.updateMarkers(performance.now() * 0.001);

    if (this.input.fire) {
      if (this.projectiles.tryFire(this.car)) {
        playFireSfx();
        this.hud.pulseCrosshair();
        this.police.onCrime(0.25);
      }
    }

    const shellHits = this.projectiles.update(
      dt,
      this.city.buildings,
      this.city.buildingIds,
      this.city.size,
      this.peds.pedestrians,
      this.police.cops,
    );
    for (const hit of shellHits) {
      if (hit.kind === "structure") {
        const kind = this.city.getKind(hit.id);
        if (!this.city.destroy(hit.id)) continue;
        const pts = kind === "building" ? hit.points + 2 : hit.points;
        this.score += pts;
        this.upgrades.addCash(pts * 3);
        this.hud.setScore(this.score);
        this.hud.setCash(this.upgrades.cash);
        this.hitFx.spawnRubble(hit.position);
        this.police.onCrime(kind === "building" ? 0.55 : 0.35);
        this.applyMissionReward(this.missions.onScore(this.score));
      } else if (hit.kind === "police") {
        const wrecked = this.police.damageCop(hit.cop);
        this.score += hit.points;
        this.upgrades.addCash(hit.points * 5);
        this.progress.recordHit();
        this.hud.setScore(this.score);
        this.hud.setCash(this.upgrades.cash);
        this.hitFx.spawn(hit.position);
        this.police.onCrime(wrecked ? 1.1 : 0.7);
        this.hud.showMissionToast(wrecked ? "COP WRECKED" : "COP HIT");
        this.applyMissionReward(this.missions.onHit(28));
        this.applyMissionReward(this.missions.onScore(this.score));
      } else {
        hit.pedestrian.hit(this.car.getFireHeading(), 28);
        this.score += hit.points;
        this.upgrades.addCash(hit.points * 4);
        this.progress.recordHit();
        this.hud.setScore(this.score);
        this.hud.setCash(this.upgrades.cash);
        this.hitFx.spawn(hit.position);
        this.police.onCrime(0.55);
        this.applyMissionReward(this.missions.onHit(28));
        this.applyMissionReward(this.missions.onScore(this.score));
      }
    }

    const nearShop = this.shops.nearest(
      this.car.mesh.position.x,
      this.car.mesh.position.z,
    );
    if (nearShop && Math.abs(this.car.speed) < 6) {
      this.hud.setShopPrompt(`E — ${nearShop.name}`);
    } else if (nearShop) {
      this.hud.setShopPrompt("Slow down to open the shop");
    } else {
      this.hud.setShopPrompt(null);
    }

    const district = this.city.getDistrictAt(
      this.car.mesh.position.x,
      this.car.mesh.position.z,
    );
    this.hud.setDistrict(district.name);
    if (this.lastDistrictId !== district.id) {
      this.lastDistrictId = district.id;
      this.applyMissionReward(this.missions.onDistrict(district.id));
    }

    this.peds.update(dt);
    this.kimchi.update(dt);
    this.hud.updateToast(dt);

    const kimchiGot = this.kimchi.collectNear(this.car);
    if (kimchiGot > 0) {
      this.score += kimchiGot * 2;
      this.upgrades.addCash(kimchiGot * 8);
      this.hud.setScore(this.score);
      this.hud.setCash(this.upgrades.cash);
      this.hud.setKimchi(this.kimchi.collected);
      this.hud.showMissionToast(
        kimchiGot > 1 ? `KIMCHI ×${kimchiGot}` : "KIMCHI!",
      );
      this.applyMissionReward(this.missions.onKimchi(kimchiGot));
      this.applyMissionReward(this.missions.onScore(this.score));
    }

    if (this.missionNextTimer > 0) {
      this.missionNextTimer -= dt;
      if (this.missionNextTimer <= 0) {
        this.missions.nextMission();
        this.hud.setMission(this.missions.label);
        this.hud.showMissionToast("NEW MISSION");
      }
    }

    const hits = checkCarPedestrianHits(this.car, this.peds.pedestrians);
    for (const hit of hits) {
      hit.pedestrian.hit(this.car.heading, this.car.speed);
      this.score += hit.points;
      this.upgrades.addCash(hit.points * 3);
      this.progress.recordHit();
      this.hud.setScore(this.score);
      this.hud.setCash(this.upgrades.cash);
      this.hitFx.spawn(hit.position);
      this.police.onCrime(0.4 + Math.min(0.35, Math.abs(this.car.speed) / 40));
      this.applyMissionReward(this.missions.onHit(this.car.speed));
      this.applyMissionReward(this.missions.onScore(this.score));
    }

    if (this.hitInvuln > 0) this.hitInvuln -= dt;

    const { ramHits, wanted } = this.police.update(
      dt,
      this.car,
      this.city.buildings,
    );
    this.hud.setWanted(wanted.stars, {
      progress: wanted.progress,
      flashing: wanted.flashing,
      label: wanted.label,
      gainedStar: wanted.gainedStar,
    });
    this.progress.recordWanted(wanted.stars);
    this.applyMissionReward(this.missions.onWanted(wanted.stars));

    if (wanted.lostStar) {
      this.hud.showMissionToast(
        wanted.stars === 0 ? "LOST THE COPS" : `WANTED ★${wanted.stars}`,
      );
    }

    if (ramHits > 0 && this.hitInvuln <= 0) {
      this.lives = Math.max(0, this.lives - 1);
      this.hitInvuln = this.car.stats.hitInvuln;
      this.hud.setLives(this.lives, this.maxLives);
      this.hud.flashLives();
      this.hud.showMissionToast(
        this.lives > 0 ? `HIT · ♥${this.lives}` : "WRECKED",
      );
      this.hitFx.spawn(this.car.mesh.position.clone());
    } else if (ramHits > 0) {
      this.hitFx.spawn(this.car.mesh.position.clone());
    }

    if (this.lives <= 0) {
      this.endRound("busted");
      return;
    }

    this.hitFx.update(dt);
  }

  private drawMinimap(): void {
    this.minimap.draw({
      player: {
        x: this.car.mesh.position.x,
        z: this.car.mesh.position.z,
        heading: this.car.heading,
      },
      cops: this.police.cops.map((c) => ({
        x: c.mesh.position.x,
        z: c.mesh.position.z,
      })),
      kimchi: this.kimchi.jars
        .filter((j) => j.active)
        .map((j) => ({
          x: j.mesh.position.x,
          z: j.mesh.position.z,
        })),
      shops: this.shops.shops.map((s) => ({ x: s.x, z: s.z })),
    });
  }

  private updateCrosshair(): void {
    if (this.hud.shopOpen) {
      this.hud.setCrosshair(50, 50, false);
      return;
    }
    const h = this.car.getFireHeading();
    this.car.getMuzzleWorldPosition(this.muzzlePoint);
    const aimDist = 32;
    this.aimPoint.set(
      this.muzzlePoint.x + Math.sin(h) * aimDist,
      1.2,
      this.muzzlePoint.z + Math.cos(h) * aimDist,
    );
    this.aimPoint.project(this.camera);
    if (
      this.aimPoint.z > 1 ||
      this.aimPoint.x < -1.15 ||
      this.aimPoint.x > 1.15 ||
      this.aimPoint.y < -1.15 ||
      this.aimPoint.y > 1.15
    ) {
      this.hud.setCrosshair(50, 50, false);
      return;
    }
    const sx = (this.aimPoint.x * 0.5 + 0.5) * 100;
    const sy = (-this.aimPoint.y * 0.5 + 0.5) * 100;
    this.hud.setCrosshair(sx, sy, true);
  }

  render(): void {
    this.syncSky();
    this.syncSunShadow();
    this.dayNight.updateLampCull(
      this.camera.position.x,
      this.camera.position.z,
    );
    updateCityWrapTiles(this.wrapTiles, this.camera.position, this.city.size);
    this.peds.syncWrapGhosts(this.camera.position);
    if (this.state === "playing" || this.state === "paused") {
      this.drawMinimap();
    }
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
