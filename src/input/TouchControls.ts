import type { Input } from "./Input";

interface ZoneState {
  pointerId: number | null;
  originX: number;
  originY: number;
  el: HTMLElement;
}

/**
 * Invisible half-screen pads for Android:
 * left = drive, right = look. Action buttons sit above the pads.
 */
export class TouchControls {
  private readonly root: HTMLElement;
  private readonly input: Input;
  private readonly left: ZoneState;
  private readonly right: ZoneState;
  private readonly maxRadius: number;
  private visible = false;

  constructor(input: Input) {
    this.input = input;
    this.root = document.getElementById("touch-controls")!;
    this.maxRadius = 88;

    this.left = {
      pointerId: null,
      originX: 0,
      originY: 0,
      el: document.getElementById("touch-zone-drive")!,
    };
    this.right = {
      pointerId: null,
      originX: 0,
      originY: 0,
      el: document.getElementById("touch-zone-look")!,
    };

    this.bindZone(this.left, "drive");
    this.bindZone(this.right, "look");
    this.bindButton("touch-btn-fire", "fire");
    this.bindButton("touch-btn-interact", "interact");
    this.bindButton("touch-btn-radio", "radio");
    this.bindButton("touch-btn-pause", "pause");
    this.bindButton("touch-btn-garage", "shop");
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.classList.toggle("hidden", !on);
    if (!on) this.resetAll();
  }

  private resetAll(): void {
    this.left.pointerId = null;
    this.right.pointerId = null;
    this.input.touchDriveX = 0;
    this.input.touchDriveY = 0;
    this.input.touchLookX = 0;
    this.input.touchLookY = 0;
    this.input.touchFire = false;
    this.input.touchInteract = false;
    this.input.touchPause = false;
    this.input.touchRadio = false;
    this.input.touchShop = false;
  }

  private bindZone(zone: ZoneState, kind: "drive" | "look"): void {
    const el = zone.el;
    el.addEventListener(
      "pointerdown",
      (e) => {
        if (!this.visible) return;
        if (zone.pointerId !== null) return;
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        zone.pointerId = e.pointerId;
        // Origin = finger down point (invisible dynamic stick)
        zone.originX = e.clientX;
        zone.originY = e.clientY;
        this.applyAxis(kind, 0, 0);
      },
      { passive: false },
    );

    el.addEventListener(
      "pointermove",
      (e) => {
        if (zone.pointerId !== e.pointerId) return;
        e.preventDefault();
        let dx = e.clientX - zone.originX;
        let dy = e.clientY - zone.originY;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, this.maxRadius);
        dx = (dx / len) * clamped;
        dy = (dy / len) * clamped;
        this.applyAxis(kind, dx / this.maxRadius, dy / this.maxRadius);
      },
      { passive: false },
    );

    const end = (e: PointerEvent) => {
      if (zone.pointerId !== e.pointerId) return;
      zone.pointerId = null;
      this.applyAxis(kind, 0, 0);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  private applyAxis(kind: "drive" | "look", nx: number, ny: number): void {
    if (kind === "drive") {
      this.input.touchDriveX = nx;
      this.input.touchDriveY = -ny;
    } else {
      this.input.touchLookX = nx;
      this.input.touchLookY = ny;
    }
  }

  private bindButton(
    id: string,
    action: "fire" | "interact" | "radio" | "pause" | "shop",
  ): void {
    const el = document.getElementById(id)!;
    const set = (v: boolean) => {
      switch (action) {
        case "fire":
          this.input.touchFire = v;
          break;
        case "interact":
          this.input.touchInteract = v;
          break;
        case "radio":
          this.input.touchRadio = v;
          break;
        case "pause":
          this.input.touchPause = v;
          break;
        case "shop":
          this.input.touchShop = v;
          break;
      }
      el.classList.toggle("active", v);
    };

    el.addEventListener(
      "pointerdown",
      (e) => {
        if (!this.visible) return;
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        set(true);
      },
      { passive: false },
    );
    const end = (e: PointerEvent) => {
      e.preventDefault();
      set(false);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
}
