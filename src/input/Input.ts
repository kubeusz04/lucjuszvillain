export type ControlMode = "pc" | "android";

const MODE_KEY = "villain-drive-control-mode";

export function loadControlMode(): ControlMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "pc" || v === "android") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveControlMode(mode: ControlMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export class Input {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private rightDown = false;
  private leftDown = false;

  /** -1..1 from left stick (or digital keys) */
  touchDriveX = 0;
  touchDriveY = 0;
  /** -1..1 right stick — applied each frame into look */
  touchLookX = 0;
  touchLookY = 0;
  touchFire = false;
  touchInteract = false;
  touchPause = false;
  touchRadio = false;
  touchShop = false;

  controlMode: ControlMode = "pc";

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (
        e.code === "ArrowUp" ||
        e.code === "ArrowDown" ||
        e.code === "ArrowLeft" ||
        e.code === "ArrowRight" ||
        e.code === "Space" ||
        e.code === "Escape"
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.rightDown = false;
      this.leftDown = false;
    });

    canvas.addEventListener("mousedown", (e) => {
      if (this.controlMode === "android") return;
      if (e.button === 2) this.rightDown = true;
      if (e.button === 0) {
        this.leftDown = true;
        if (!document.pointerLockElement) {
          canvas.requestPointerLock();
        }
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this.rightDown = false;
      if (e.button === 0) this.leftDown = false;
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousemove", (e) => {
      if (this.controlMode === "android") return;
      if (document.pointerLockElement || this.rightDown) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
  }

  setControlMode(mode: ControlMode): void {
    this.controlMode = mode;
    saveControlMode(mode);
    if (mode === "android" && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /** Read and clear look deltas for this frame */
  consumeLook(): { x: number; y: number } {
    const lookGain = 14;
    const x = this.mouseDX + this.touchLookX * lookGain;
    const y = this.mouseDY + this.touchLookY * lookGain;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { x, y };
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Analog throttle: -1 reverse .. +1 forward */
  get driveAxis(): number {
    if (this.controlMode === "android" && Math.abs(this.touchDriveY) > 0.08) {
      return this.touchDriveY;
    }
    if (this.forward) return 1;
    if (this.backward) return -1;
    return 0;
  }

  /** Analog steer: -1 left .. +1 right */
  get steerAxis(): number {
    if (this.controlMode === "android" && Math.abs(this.touchDriveX) > 0.08) {
      return this.touchDriveX;
    }
    if (this.left) return -1;
    if (this.right) return 1;
    return 0;
  }

  get forward(): boolean {
    return this.isDown("KeyW") || this.isDown("ArrowUp") || this.touchDriveY > 0.25;
  }

  get backward(): boolean {
    return this.isDown("KeyS") || this.isDown("ArrowDown") || this.touchDriveY < -0.25;
  }

  get left(): boolean {
    return this.isDown("KeyA") || this.isDown("ArrowLeft") || this.touchDriveX < -0.25;
  }

  get right(): boolean {
    return this.isDown("KeyD") || this.isDown("ArrowRight") || this.touchDriveX > 0.25;
  }

  get confirm(): boolean {
    return this.isDown("Enter");
  }

  get fire(): boolean {
    if (this.controlMode === "android") return this.touchFire;
    return this.leftDown || this.isDown("Space") || this.isDown("KeyF");
  }

  get shop(): boolean {
    return this.isDown("KeyU") || this.touchShop;
  }

  get interact(): boolean {
    return this.isDown("KeyE") || this.touchInteract;
  }

  get pause(): boolean {
    return this.isDown("Escape") || this.touchPause;
  }

  get radio(): boolean {
    return this.isDown("KeyR") || this.touchRadio;
  }
}
