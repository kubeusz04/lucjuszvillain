# Lucjusz Villain Drive

Browser tank chaos game (Vite + Three.js). Crush pedestrians, collect kimchi, escape the cops.

## Play locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages

Repo is configured for project pages at:

`https://<your-user>.github.io/lucjuszvillain/`

### First-time setup

1. Create a GitHub repo named **`lucjuszvillain`** (name must match `base` in `vite.config.ts`).
2. Push this folder:

```bash
git add .
git commit -m "Initial Lucjusz Villain Drive"
git branch -M main
git remote add origin https://github.com/<your-user>/lucjuszvillain.git
git push -u origin main
```

3. GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Wait for the **Deploy GitHub Pages** workflow (push to `main` / `master`).

If your repo has a different name, change `base` in [`vite.config.ts`](vite.config.ts):

```ts
base: "/your-repo-name/",
```

## Controls

- **PC** — WASD, mouse look, LMB/Space/F fire
- **Android** — left half drive, right half camera, on-screen buttons
