import type { Progress } from "./Progress";

export class Highscore {
  private progress: Progress;

  constructor(progress: Progress) {
    this.progress = progress;
  }

  get value(): number {
    return this.progress.data.highscore;
  }

  /** Returns true if this score is a new record */
  submit(score: number): boolean {
    return this.progress.submitScore(score);
  }
}
