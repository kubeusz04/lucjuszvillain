import { assetUrl } from "../assetUrl";

const SRC = assetUrl("kimchi-conqueror.mp3");
const VOLUME = 0.42;

/** In-tank radio — loops the Kimchi Conqueror theme */
export class Radio {
  private readonly audio: HTMLAudioElement;
  private unlocked = false;
  private wantOn = true;
  private playing = false;
  private volume = 0;
  private targetVol = 0;

  constructor() {
    this.audio = new Audio(SRC);
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.volume = 0;
  }

  get on(): boolean {
    return this.wantOn;
  }

  /** Call after a user gesture */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.audio.volume = 0;
    void this.audio
      .play()
      .then(() => {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.playing = false;
      })
      .catch(() => {
        this.unlocked = false;
      });
  }

  toggle(): boolean {
    this.wantOn = !this.wantOn;
    return this.wantOn;
  }

  /** active = round is playing (not paused/menu) */
  setActive(active: boolean): void {
    this.targetVol = active && this.wantOn ? VOLUME : 0;
  }

  update(dt: number): void {
    const rate = this.targetVol > this.volume ? 1.8 : 1.2;
    if (this.volume < this.targetVol) {
      this.volume = Math.min(this.targetVol, this.volume + rate * dt * VOLUME);
    } else if (this.volume > this.targetVol) {
      this.volume = Math.max(this.targetVol, this.volume - rate * dt * VOLUME);
    }
    this.audio.volume = this.volume;

    if (this.volume > 0.01) {
      if (!this.playing) {
        this.playing = true;
        void this.audio.play().catch(() => {
          this.playing = false;
        });
      }
    } else if (this.playing && this.volume <= 0.005) {
      this.audio.pause();
      this.playing = false;
      this.volume = 0;
      this.audio.volume = 0;
    }
  }

  stop(immediate = false): void {
    this.targetVol = 0;
    if (immediate) {
      this.volume = 0;
      this.audio.volume = 0;
      this.audio.pause();
      this.playing = false;
    }
  }
}
