import { Game } from "./game/Game";
import { PeopleLibrary } from "./assets/PeopleModels";
import { KimchiTemplate } from "./assets/KimchiModel";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const subtitle = document.getElementById("overlay-subtitle");

async function boot(): Promise<void> {
  if (subtitle) {
    subtitle.textContent = "Loading models…";
  }

  const [people, kimchiTpl] = await Promise.all([
    PeopleLibrary.load((done, total) => {
      if (subtitle) {
        subtitle.textContent = `Loading characters… ${done}/${total}`;
      }
    }),
    KimchiTemplate.load().then((tpl) => {
      if (subtitle) subtitle.textContent = "Loading kimchi…";
      return tpl;
    }),
  ]);

  const game = new Game(canvas, people, kimchiTpl);

  if (subtitle) {
    subtitle.textContent =
      "Crush pedestrians in your tank. Collect kimchi. Escape the cops.";
  }

  let last = performance.now();

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  if (subtitle) {
    subtitle.textContent = "Failed to load models. Refresh the page.";
  }
});
