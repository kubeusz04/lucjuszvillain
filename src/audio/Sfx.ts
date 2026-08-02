import { assetUrl } from "../assetUrl";

const HIT_SOUNDS = [
  assetUrl("sfx/bowling-sound.mp3"),
  assetUrl("sfx/bongo-hit_oi2JYDE.mp3"),
  assetUrl("sfx/1507147114621309109.ogg"),
  assetUrl("sfx/1505266578407555173.ogg"),
  assetUrl("sfx/toms-screams.mp3"),
  assetUrl("sfx/01-the-screaming-sheep.mp3"),
  assetUrl("sfx/hit1.mp3"),
  assetUrl("wilhelm.mp3"),
] as const;

const FIRE_SOUND = assetUrl("sfx/tank-fire.mp3");

let lastIndex = -1;

/** Play a random hit sound (different from the previous one when possible). */
export function playHitSfx(): void {
  let index = Math.floor(Math.random() * HIT_SOUNDS.length);
  if (HIT_SOUNDS.length > 1 && index === lastIndex) {
    index = (index + 1 + Math.floor(Math.random() * (HIT_SOUNDS.length - 1))) %
      HIT_SOUNDS.length;
  }
  lastIndex = index;

  const audio = new Audio(HIT_SOUNDS[index]);
  audio.volume = 0.8;
  void audio.play().catch(() => {
    // Autoplay may block until user gesture — start round unlocks it
  });
}

/** Cannon fire */
export function playFireSfx(): void {
  const audio = new Audio(FIRE_SOUND);
  audio.volume = 0.9;
  void audio.play().catch(() => {});
}

/** @deprecated use playHitSfx */
export function playWilhelmScream(): void {
  playHitSfx();
}
