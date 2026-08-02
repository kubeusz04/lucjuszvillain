import { assetUrl } from "../assetUrl";

const VOLUME = 0.42;

const TRACKS = [
  { src: assetUrl("kimchi-conqueror.mp3"), title: "Kimchi Conqueror" },
  { src: assetUrl("kimchi-love.mp3"), title: "Kimchi Love" },
] as const;

/** In-tank radio — playlist of kimchi bangers */
export class Radio {
  private readonly audio: HTMLAudioElement;
  private unlocked = false;
  private wantOn = true;
  private playing = false;
  private volume = 0;
  private targetVol = 0;
  private trackIndex = 0;

  constructor() {
    this.audio = new Audio(TRACKS[0].src);
    this.audio.loop = false;
    this.audio.preload = "auto";
    this.audio.volume = 0;
    this.audio.addEventListener("ended", () => this.nextTrack());
  }

  get on(): boolean {
    return this.wantOn;
  }

  get trackTitle(): string {
    return TRACKS[this.trackIndex].title;
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

  /** Skip to next song (also wraps) */
  nextTrack(): void {
    this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
    const wasPlaying = this.playing || this.targetVol > 0.01;
    this.audio.src = TRACKS[this.trackIndex].src;
    this.audio.currentTime = 0;
    this.playing = false;
    if (wasPlaying && this.wantOn) {
      void this.audio.play().then(() => {
        this.playing = true;
      }).catch(() => {
        this.playing = false;
      });
    }
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
