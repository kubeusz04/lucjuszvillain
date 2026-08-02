import { assetUrl } from "../assetUrl";

const SRC = assetUrl("engine.mp3");

/** Looping engine loop — volume follows speed, slow fade when stopping */
export class EngineSound {
  private readonly audio: HTMLAudioElement;
  private volume = 0;
  private started = false;
  private unlocked = false;

  constructor() {
    this.audio = new Audio(SRC);
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.volume = 0;
  }

  /** Call after a user gesture so browsers allow playback */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.audio.volume = 0;
    void this.audio
      .play()
      .then(() => {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.started = false;
      })
      .catch(() => {
        this.unlocked = false;
      });
  }

  update(dt: number, speed: number, active: boolean): void {
    const abs = Math.abs(speed);
    const moving = active && abs > 1.2;

    let target = 0;
    if (moving) {
      target = Math.min(0.55, 0.12 + (abs / 36) * 0.45);
      this.audio.playbackRate = Math.min(1.35, Math.max(0.85, 0.9 + abs / 55));
    }

    // Slow fade-out when stopping; quicker fade-in when accelerating
    const rate = target < this.volume ? 0.45 : 2.8;
    if (this.volume < target) {
      this.volume = Math.min(target, this.volume + rate * dt);
    } else if (this.volume > target) {
      this.volume = Math.max(target, this.volume - rate * dt);
    }

    this.audio.volume = this.volume;

    if (this.volume > 0.01) {
      if (!this.started) {
        this.started = true;
        void this.audio.play().catch(() => {
          this.started = false;
        });
      }
    } else if (this.started && this.volume <= 0.005) {
      this.audio.pause();
      this.started = false;
      this.volume = 0;
      this.audio.volume = 0;
    }
  }

  /** Begin slow fade (or cut instantly) */
  stop(immediate = false): void {
    if (immediate) {
      this.volume = 0;
      this.audio.volume = 0;
      this.audio.pause();
      this.started = false;
    }
  }
}
