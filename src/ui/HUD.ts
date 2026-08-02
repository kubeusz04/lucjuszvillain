import {
  UPGRADE_DEFS,
  PAINT_DEFS,
  STYLE_DEFS,
  type UpgradeId,
  type PaintId,
  type StyleId,
  type ShopKind,
  type UpgradeSystem,
} from "../game/Upgrades";
import type { Progress } from "../game/Progress";
import { loadControlMode, type ControlMode } from "../input/Input";

export type OverlayMode = "menu" | "pause" | "gameover" | "busted";
type MenuPanel = "mode" | "main" | "pause" | "stats" | "controls" | "reset";

export class HUD {
  private scoreEl: HTMLElement;
  private bestEl: HTMLElement;
  private kimchiEl: HTMLElement;
  private timeEl: HTMLElement;
  private cashEl: HTMLElement;
  private livesEl: HTMLElement;
  private clockEl: HTMLElement;
  private weatherEl: HTMLElement;
  private wantedEl: HTMLElement;
  private wantedTierEl: HTMLElement;
  private wantedBarFill: HTMLElement;
  private wantedFlashEl: HTMLElement;
  private districtEl: HTMLElement;
  private hudEl: HTMLElement;
  private overlayEl: HTMLElement;
  private titleEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private highscoreEl: HTMLElement;
  private saveStatusEl: HTMLElement;
  private hintEl: HTMLElement;
  private btnEl: HTMLButtonElement;
  private shopEl: HTMLElement;
  private shopTitleEl: HTMLElement;
  private shopListEl: HTMLElement;
  private shopCashEl: HTMLElement;
  private shopOpenBtn: HTMLButtonElement;
  private shopCloseBtn: HTMLButtonElement;
  private shopPromptEl: HTMLElement;
  private speedoEl: HTMLElement;
  private speedValueEl: HTMLElement;
  private radioHudEl: HTMLElement;
  private radioTrackEl: HTMLElement;
  private crosshairEl: HTMLElement;
  private missionHudEl: HTMLElement;
  private missionTextEl: HTMLElement;
  private missionToastEl: HTMLElement;
  private statsListEl: HTMLElement;
  private panels: Record<MenuPanel, HTMLElement>;
  private toastTimer = 0;
  private shopTab: ShopKind = "performance";
  private lockedTab: ShopKind | null = null;
  private menuReturn: MenuPanel = "main";

  private upgrades: UpgradeSystem | null = null;
  private progress: Progress | null = null;
  private onStatsChanged: (() => void) | null = null;
  private onResume: (() => void) | null = null;
  private onQuitToMenu: (() => void) | null = null;
  private onResetProgress: (() => void) | null = null;
  private onControlMode: ((mode: ControlMode) => void) | null = null;
  private controlMode: ControlMode = loadControlMode() ?? "pc";
  private modeChosen = loadControlMode() !== null;

  constructor(onStart: () => void) {
    this.scoreEl = document.getElementById("score-value")!;
    this.bestEl = document.getElementById("best-value")!;
    this.kimchiEl = document.getElementById("kimchi-value")!;
    this.timeEl = document.getElementById("time-value")!;
    this.cashEl = document.getElementById("cash-value")!;
    this.livesEl = document.getElementById("lives-value")!;
    this.clockEl = document.getElementById("clock-value")!;
    this.weatherEl = document.getElementById("weather-value")!;
    this.wantedEl = document.getElementById("wanted-stars")!;
    this.wantedTierEl = document.getElementById("wanted-label")!;
    this.wantedBarFill = document.getElementById("wanted-bar-fill")!;
    this.wantedFlashEl = document.getElementById("wanted-flash")!;
    this.districtEl = document.getElementById("district-name")!;
    this.hudEl = document.getElementById("hud")!;
    this.overlayEl = document.getElementById("overlay")!;
    this.titleEl = document.getElementById("overlay-title")!;
    this.subtitleEl = document.getElementById("overlay-subtitle")!;
    this.highscoreEl = document.getElementById("overlay-highscore")!;
    this.saveStatusEl = document.getElementById("overlay-save")!;
    this.hintEl = document.getElementById("overlay-hint")!;
    this.btnEl = document.getElementById("overlay-btn") as HTMLButtonElement;
    this.shopEl = document.getElementById("shop")!;
    this.shopTitleEl = document.getElementById("shop-title")!;
    this.shopListEl = document.getElementById("shop-list")!;
    this.shopCashEl = document.getElementById("shop-cash")!;
    this.shopOpenBtn = document.getElementById(
      "shop-open-btn",
    ) as HTMLButtonElement;
    this.shopCloseBtn = document.getElementById(
      "shop-close-btn",
    ) as HTMLButtonElement;
    this.shopPromptEl = document.getElementById("shop-prompt")!;
    this.speedoEl = document.getElementById("speedo")!;
    this.speedValueEl = document.getElementById("speed-value")!;
    this.radioHudEl = document.getElementById("radio-hud")!;
    this.radioTrackEl = document.getElementById("radio-track")!;
    this.crosshairEl = document.getElementById("crosshair")!;
    this.missionHudEl = document.getElementById("mission-hud")!;
    this.missionTextEl = document.getElementById("mission-text")!;
    this.missionToastEl = document.getElementById("mission-toast")!;
    this.statsListEl = document.getElementById("stats-list")!;

    this.panels = {
      mode: document.getElementById("menu-mode")!,
      main: document.getElementById("menu-main")!,
      pause: document.getElementById("menu-pause")!,
      stats: document.getElementById("menu-stats")!,
      controls: document.getElementById("menu-controls")!,
      reset: document.getElementById("menu-reset")!,
    };

    this.btnEl.addEventListener("click", () => onStart());
    this.shopOpenBtn.addEventListener("click", () =>
      this.openShop(null, "GARAGE"),
    );
    this.shopCloseBtn.addEventListener("click", () => this.closeShop());

    document.getElementById("mode-pc-btn")!.addEventListener("click", () => {
      this.applyControlMode("pc");
      this.showPanel("main");
    });
    document.getElementById("mode-android-btn")!.addEventListener("click", () => {
      this.applyControlMode("android");
      this.showPanel("main");
    });
    document.getElementById("mode-switch-pc")!.addEventListener("click", () => {
      this.applyControlMode("pc");
    });
    document
      .getElementById("mode-switch-android")!
      .addEventListener("click", () => {
        this.applyControlMode("android");
      });

    document.getElementById("menu-stats-btn")!.addEventListener("click", () => {
      this.menuReturn = "main";
      this.showPanel("stats");
      this.renderStats();
    });
    document
      .getElementById("menu-controls-btn")!
      .addEventListener("click", () => {
        this.menuReturn = "main";
        this.showPanel("controls");
        this.syncControlsHelp();
      });
    document.getElementById("menu-reset-btn")!.addEventListener("click", () => {
      this.menuReturn = "main";
      this.showPanel("reset");
    });
    document.getElementById("stats-back-btn")!.addEventListener("click", () => {
      this.showPanel(this.menuReturn);
    });
    document
      .getElementById("controls-back-btn")!
      .addEventListener("click", () => {
        this.showPanel(this.menuReturn);
      });
    document
      .getElementById("reset-cancel-btn")!
      .addEventListener("click", () => {
        this.showPanel(this.menuReturn);
      });
    document
      .getElementById("reset-confirm-btn")!
      .addEventListener("click", () => {
        this.onResetProgress?.();
        this.showPanel("main");
        this.refreshSaveStatus();
      });
    document
      .getElementById("pause-resume-btn")!
      .addEventListener("click", () => {
        this.onResume?.();
      });
    document
      .getElementById("pause-garage-btn")!
      .addEventListener("click", () => {
        this.openShop(null, "GARAGE");
      });
    document.getElementById("pause-menu-btn")!.addEventListener("click", () => {
      this.onQuitToMenu?.();
    });

    this.shopEl.querySelectorAll(".shop-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = (btn as HTMLElement).dataset.tab as ShopKind;
        if (this.lockedTab && tab !== this.lockedTab) return;
        this.shopTab = tab;
        this.syncTabs();
        this.renderShop();
      });
    });

    this.syncModeChips();
    this.syncHint();
  }

  get currentControlMode(): ControlMode {
    return this.controlMode;
  }

  private applyControlMode(mode: ControlMode): void {
    this.controlMode = mode;
    this.modeChosen = true;
    this.syncModeChips();
    this.syncHint();
    this.syncControlsHelp();
    this.onControlMode?.(mode);
  }

  bindProgress(progress: Progress): void {
    this.progress = progress;
    this.refreshSaveStatus();
  }

  bindMenuActions(handlers: {
    onResume: () => void;
    onQuitToMenu: () => void;
    onResetProgress: () => void;
    onControlMode?: (mode: ControlMode) => void;
  }): void {
    this.onResume = handlers.onResume;
    this.onQuitToMenu = handlers.onQuitToMenu;
    this.onResetProgress = handlers.onResetProgress;
    this.onControlMode = handlers.onControlMode ?? null;
    if (this.modeChosen) {
      this.onControlMode?.(this.controlMode);
    }
  }

  private syncModeChips(): void {
    document
      .getElementById("mode-switch-pc")!
      .classList.toggle("active", this.controlMode === "pc");
    document
      .getElementById("mode-switch-android")!
      .classList.toggle("active", this.controlMode === "android");
  }

  private syncHint(): void {
    if (this.controlMode === "android") {
      this.hintEl.textContent =
        "Left screen — drive · right — camera · FIRE — cannon";
    } else {
      this.hintEl.textContent =
        "WASD — drive · mouse — camera · Esc — pause · Enter — start";
    }
  }

  private syncControlsHelp(): void {
    const pc = document.getElementById("controls-list-pc")!;
    const an = document.getElementById("controls-list-android")!;
    pc.classList.toggle("hidden", this.controlMode !== "pc");
    an.classList.toggle("hidden", this.controlMode !== "android");
  }

  bindUpgrades(upgrades: UpgradeSystem, onStatsChanged: () => void): void {
    this.upgrades = upgrades;
    this.onStatsChanged = onStatsChanged;
    this.setCash(upgrades.cash);
  }

  setScore(score: number): void {
    this.scoreEl.textContent = String(score);
  }

  setBest(best: number): void {
    this.bestEl.textContent = String(best);
    this.highscoreEl.textContent = `High score: ${best}`;
  }

  setKimchi(count: number): void {
    this.kimchiEl.textContent = String(count);
  }

  setCash(cash: number): void {
    const text = `$${Math.floor(cash)}`;
    this.cashEl.textContent = text;
    this.shopCashEl.textContent = text;
  }

  setLives(current: number, max: number): void {
    const n = Math.max(0, Math.min(max, current));
    this.livesEl.textContent = "♥".repeat(n) + "♡".repeat(Math.max(0, max - n));
  }

  flashLives(): void {
    this.livesEl.classList.remove("hurt");
    void this.livesEl.offsetWidth;
    this.livesEl.classList.add("hurt");
  }

  setClock(label: string): void {
    this.clockEl.textContent = label;
  }

  setWeather(label: string): void {
    this.weatherEl.textContent = label;
  }

  setTime(seconds: number): void {
    this.timeEl.textContent = String(Math.max(0, Math.ceil(seconds)));
  }

  setSpeed(speed: number): void {
    // Game units → km/h feel
    const kmh = Math.round(Math.abs(speed) * 3.4);
    this.speedValueEl.textContent = String(kmh);
    this.speedoEl.classList.toggle("fast", kmh >= 100);
    this.speedoEl.classList.toggle("reverse", speed < -1.5);
  }

  setWanted(
    stars: number,
    opts: {
      progress?: number;
      flashing?: boolean;
      label?: string;
      gainedStar?: boolean;
    } = {},
  ): void {
    const n = Math.max(0, Math.min(5, stars));
    const spans = this.wantedEl.querySelectorAll("span");
    spans.forEach((span, i) => {
      const on = i < n;
      span.classList.toggle("on", on);
      span.classList.toggle("flash", Boolean(opts.flashing) && i === n - 1);
    });

    const progress = opts.progress ?? 0;
    this.wantedBarFill.style.width = `${Math.round(progress * 100)}%`;
    this.wantedBarFill.style.opacity =
      n >= 5 ? "1" : n > 0 || progress > 0 ? "1" : "0.35";

    if (opts.label) {
      this.wantedTierEl.textContent = opts.label;
      this.wantedTierEl.classList.toggle("hot", n > 0);
    }

    this.wantedFlashEl.classList.toggle("hidden", n === 0);
    if (opts.gainedStar) {
      this.wantedEl.classList.add("bump");
      this.wantedFlashEl.classList.remove("hidden");
      this.wantedFlashEl.classList.remove("pulse");
      void this.wantedFlashEl.offsetWidth;
      this.wantedFlashEl.classList.add("pulse");
      window.setTimeout(() => this.wantedEl.classList.remove("bump"), 180);
      this.showMissionToast(`WANTED ★${n}`);
    }
  }

  setDistrict(name: string): void {
    this.districtEl.textContent = name;
  }

  showHud(visible: boolean): void {
    this.hudEl.classList.toggle("hidden", !visible);
    this.missionHudEl.classList.toggle("hidden", !visible);
    this.radioHudEl.classList.toggle("hidden", !visible);
    this.crosshairEl.classList.toggle("hidden", !visible);
    if (!visible) this.setShopPrompt(null);
  }

  /** Place crosshair at screen % (0–100). Hide if off-screen / behind camera. */
  setCrosshair(screenX: number, screenY: number, visible: boolean): void {
    if (!visible) {
      this.crosshairEl.classList.add("off");
      return;
    }
    this.crosshairEl.classList.remove("off");
    this.crosshairEl.style.left = `${screenX}%`;
    this.crosshairEl.style.top = `${screenY}%`;
  }

  pulseCrosshair(): void {
    this.crosshairEl.classList.remove("pulse");
    // restart CSS animation
    void this.crosshairEl.offsetWidth;
    this.crosshairEl.classList.add("pulse");
  }

  setRadio(on: boolean, track = "Kimchi Conqueror"): void {
    this.radioTrackEl.textContent = on ? track : "OFF";
    this.radioHudEl.classList.toggle("off", !on);
  }

  setMission(text: string): void {
    this.missionTextEl.textContent = text;
  }

  showMissionToast(text: string): void {
    this.missionToastEl.textContent = text;
    this.missionToastEl.classList.remove("hidden");
    this.toastTimer = 2.4;
  }

  updateToast(dt: number): void {
    if (this.toastTimer <= 0) return;
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) {
      this.missionToastEl.classList.add("hidden");
    }
  }

  setShopPrompt(text: string | null): void {
    if (!text) {
      this.shopPromptEl.classList.add("hidden");
      return;
    }
    this.shopPromptEl.textContent = text;
    this.shopPromptEl.classList.remove("hidden");
  }

  showOverlay(
    mode: OverlayMode,
    score = 0,
    highscore = 0,
    isNewRecord = false,
  ): void {
    this.overlayEl.classList.remove("hidden");
    this.setBest(highscore);
    this.refreshSaveStatus();

    if (mode === "pause") {
      this.showPanel("pause");
      return;
    }

    if (mode === "menu" && !this.modeChosen) {
      this.showPanel("mode");
      return;
    }

    this.showPanel("main");
    this.syncModeChips();
    if (mode === "menu") {
      this.titleEl.textContent = "LUCJUSZ VILLAIN DRIVE";
      this.subtitleEl.textContent =
        "Crush pedestrians in your tank. Collect kimchi. Escape the cops.";
      this.highscoreEl.textContent = `High score: ${highscore}`;
      this.syncHint();
      this.btnEl.textContent = "PLAY";
    } else if (mode === "busted") {
      this.titleEl.textContent = "BUSTED";
      this.subtitleEl.textContent = `The cops wrecked your car · Score: ${score}`;
      this.highscoreEl.textContent = isNewRecord
        ? `NEW HIGH SCORE: ${highscore}!`
        : `High score: ${highscore}`;
      this.hintEl.textContent = "Progress saved · Enter — restart";
      this.btnEl.textContent = "RESTART";
    } else {
      this.titleEl.textContent = "TIME'S UP";
      this.subtitleEl.textContent = `Score: ${score}`;
      this.highscoreEl.textContent = isNewRecord
        ? `NEW HIGH SCORE: ${highscore}!`
        : `High score: ${highscore}`;
      this.hintEl.textContent = "Progress saved · Enter — restart";
      this.btnEl.textContent = "RESTART";
    }
  }

  hideOverlay(): void {
    this.overlayEl.classList.add("hidden");
  }

  get overlayVisible(): boolean {
    return !this.overlayEl.classList.contains("hidden");
  }

  /** True when primary play/restart button panel is visible */
  get canConfirmStart(): boolean {
    return (
      this.overlayVisible &&
      !this.panels.main.classList.contains("hidden") &&
      !this.shopOpen
    );
  }

  get shopOpen(): boolean {
    return !this.shopEl.classList.contains("hidden");
  }

  openShop(kind: ShopKind | null = null, title = "GARAGE"): void {
    if (!this.upgrades) return;
    this.lockedTab = kind;
    this.shopTab = kind ?? "performance";
    this.shopTitleEl.textContent = title;
    this.syncTabs();
    this.renderShop();
    this.shopEl.classList.remove("hidden");
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  closeShop(): void {
    this.shopEl.classList.add("hidden");
    this.lockedTab = null;
  }

  toggleShop(): void {
    if (this.shopOpen) this.closeShop();
    else this.openShop(null, "GARAGE");
  }

  private showPanel(panel: MenuPanel): void {
    for (const [key, el] of Object.entries(this.panels)) {
      el.classList.toggle("hidden", key !== panel);
    }
    if (panel === "stats") this.renderStats();
  }

  refreshSaveStatus(): void {
    if (!this.progress || !this.saveStatusEl) return;
    if (!this.progress.hasSave) {
      this.saveStatusEl.textContent = "No saved progress — start a game";
      return;
    }
    const d = new Date(this.progress.data.savedAt);
    const time = d.toLocaleString("en-US", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    this.saveStatusEl.textContent = `Saved · ${time} · $${Math.floor(this.progress.data.cash)}`;
  }

  private renderStats(): void {
    if (!this.progress) return;
    const s = this.progress.data.stats;
    const mins = Math.floor(s.playTimeSec / 60);
    const secs = Math.floor(s.playTimeSec % 60);
    const rows: [string, string][] = [
      ["High score", String(this.progress.data.highscore)],
      ["Cash", `$${Math.floor(this.progress.data.cash)}`],
      ["Runs", String(s.totalRuns)],
      ["Hits", String(s.totalHits)],
      ["Missions completed", String(s.missionsCompleted)],
      ["Highest WANTED", `★${s.bestWanted}`],
      ["Play time", `${mins}m ${secs}s`],
    ];
    this.statsListEl.innerHTML = rows
      .map(
        ([k, v]) =>
          `<li><span>${k}</span><strong>${v}</strong></li>`,
      )
      .join("");
  }

  private syncTabs(): void {
    this.shopEl.querySelectorAll(".shop-tab").forEach((btn) => {
      const el = btn as HTMLElement;
      const tab = el.dataset.tab as ShopKind;
      el.classList.toggle("active", tab === this.shopTab);
      el.style.opacity =
        this.lockedTab && tab !== this.lockedTab ? "0.35" : "1";
    });
  }

  private renderShop(): void {
    if (!this.upgrades) return;
    const u = this.upgrades;
    this.setCash(u.cash);
    this.shopListEl.innerHTML = "";

    if (this.shopTab === "performance") {
      for (const def of UPGRADE_DEFS) {
        const level = u.levels[def.id];
        const maxed = level >= def.maxLevel;
        const cost = u.cost(def.id);
        const row = document.createElement("div");
        row.className = "shop-row";
        const info = document.createElement("div");
        info.className = "shop-row-info";
        info.innerHTML = `<h3>${def.name}</h3><p>${def.desc}</p><div class="shop-level">Level ${level}/${def.maxLevel}</div>`;
        const buy = document.createElement("button");
        buy.type = "button";
        buy.className = "shop-buy";
        buy.textContent = maxed ? "MAX" : `$${cost}`;
        buy.disabled = maxed || !u.canBuy(def.id);
        buy.addEventListener("click", () => {
          if (u.buy(def.id as UpgradeId)) {
            this.setCash(u.cash);
            this.onStatsChanged?.();
            this.renderShop();
            this.refreshSaveStatus();
          }
        });
        row.append(info, buy);
        this.shopListEl.appendChild(row);
      }
    } else if (this.shopTab === "paint") {
      for (const def of PAINT_DEFS) {
        const active = u.paint === def.id;
        const owned = u.ownsPaint(def.id);
        const row = document.createElement("div");
        row.className = "shop-row";
        const info = document.createElement("div");
        info.className = "shop-row-info";
        const hex = `#${def.color.toString(16).padStart(6, "0")}`;
        info.innerHTML = `<h3><span class="paint-swatch" style="background:${hex}"></span>${def.name}</h3><p>${
          active
            ? "Current paint"
            : owned
              ? "Owned — equip free"
              : "Repaint the tank"
        }</p>`;
        const buy = document.createElement("button");
        buy.type = "button";
        buy.className = "shop-buy";
        buy.textContent = active
          ? "ON"
          : owned
            ? "EQUIP"
            : def.cost === 0
              ? "EQUIP"
              : `$${def.cost}`;
        buy.disabled = active || !u.canBuyPaint(def.id);
        buy.addEventListener("click", () => {
          if (u.buyPaint(def.id as PaintId)) {
            this.setCash(u.cash);
            this.onStatsChanged?.();
            this.renderShop();
            this.refreshSaveStatus();
          }
        });
        row.append(info, buy);
        this.shopListEl.appendChild(row);
      }
    } else {
      const clearRow = document.createElement("div");
      clearRow.className = "shop-row";
      const clearInfo = document.createElement("div");
      clearInfo.className = "shop-row-info";
      clearInfo.innerHTML =
        `<h3>Clear cosmetics</h3><p>Unequip styles and reset paint to Crimson</p>`;
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "shop-buy";
      clearBtn.textContent = "CLEAR";
      clearBtn.addEventListener("click", () => {
        if (u.clearCosmetics()) {
          this.setCash(u.cash);
          this.onStatsChanged?.();
          this.renderShop();
          this.refreshSaveStatus();
        }
      });
      clearRow.append(clearInfo, clearBtn);
      this.shopListEl.appendChild(clearRow);

      for (const def of STYLE_DEFS) {
        const owned = u.ownsStyle(def.id);
        const on = u.styles[def.id];
        const row = document.createElement("div");
        row.className = "shop-row";
        const info = document.createElement("div");
        info.className = "shop-row-info";
        info.innerHTML = `<h3>${def.name}</h3><p>${def.desc}${
          owned ? (on ? " · equipped" : " · owned, off") : ""
        }</p>`;
        const buy = document.createElement("button");
        buy.type = "button";
        buy.className = "shop-buy";
        if (!owned) {
          buy.textContent = `$${def.cost}`;
          buy.disabled = !u.canBuyStyle(def.id);
          buy.addEventListener("click", () => {
            if (u.buyStyle(def.id as StyleId)) {
              this.setCash(u.cash);
              this.onStatsChanged?.();
              this.renderShop();
              this.refreshSaveStatus();
            }
          });
        } else {
          buy.textContent = on ? "ON" : "OFF";
          buy.classList.toggle("shop-buy-off", !on);
          buy.addEventListener("click", () => {
            if (u.toggleStyle(def.id as StyleId)) {
              this.onStatsChanged?.();
              this.renderShop();
              this.refreshSaveStatus();
            }
          });
        }
        row.append(info, buy);
        this.shopListEl.appendChild(row);
      }
    }
  }
}
