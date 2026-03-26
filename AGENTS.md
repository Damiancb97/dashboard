# Repository Guidelines

## Project Structure & Module Organization
This repository is a React + Vite single-page dashboard. Main code lives in `src/`:
- `src/components/`: UI widgets (`Clock.jsx`, `Weather.jsx`, `ServerStats.jsx`, `GpuStats.jsx`, `Containers.jsx`, etc.) with matching `*.module.css` files.
- `src/hooks/`: polling/data hooks (`useGlances.js`, `useRpiGlances.js`, `useWeather.js`).
- `src/assets/`: static images used by the app.
- `src/index.css`: global theme and base styles.

Build output is generated into `dist/` (do not edit manually). Static public files are in `public/`.

## Build, Test, and Development Commands
- `npm run dev`: start Vite dev server on `http://localhost:5173` with API proxies.
- `npm run build`: produce production bundle in `dist/`.
- `npm run preview`: serve the built app locally for final checks.
- `npm run lint`: run ESLint on all JS/JSX files.
- `docker compose up -d`: run production container on port `8086` (Nginx serving `dist/`).

## Coding Style & Naming Conventions
- Use modern ES modules and functional React components.
- Keep component filenames in PascalCase (for example, `GpuStats.jsx`), hooks in camelCase with `use` prefix.
- Co-locate styles with components using CSS Modules: `ComponentName.module.css`.
- Follow ESLint flat config in `eslint.config.js`; fix lint issues before opening a PR.
- Prefer 2-space indentation and concise, focused components.

## Testing Guidelines
There is currently no automated test suite configured. For every change:
- run `npm run lint`;
- run `npm run build` to catch bundling/runtime issues;
- perform manual smoke checks in `npm run dev` (widgets render, API-backed panels update, no console errors).

If you add tests, keep them near the feature (`src/**`) and document the command in `package.json`.

## Commit & Pull Request Guidelines
Git history is not available in this workspace snapshot, so use this project convention:
- commit format: `type(scope): short summary` (for example, `feat(weather): show wind direction`);
- keep commits small and single-purpose;
- reference issue IDs when applicable.

PRs should include:
- a clear summary of behavior changes;
- validation steps run (`lint`, `build`, manual checks);
- screenshots/GIFs for UI changes;
- notes for proxy, port, or Docker config changes.
