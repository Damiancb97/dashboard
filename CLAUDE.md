# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build → /dist
npm run preview   # Serve built dist locally
npm run lint      # ESLint on all JS/JSX files
```

No test suite is configured.

**Docker:**
```bash
docker compose up -d       # Build and start on port 8086
docker compose build       # Rebuild image after changes
```

## Architecture

React + Vite SPA — a personal server dashboard with a cyberpunk/terminal aesthetic.

**Component tree:**
```
App.jsx
├── Clock.jsx          — Real-time digital clock
├── Weather.jsx        — Weather for A Coruña via Open-Meteo (polls 10 min)
├── ServerStats.jsx    — CPU & memory bars via Glances API (polls 3 sec)
├── SiteCard.jsx       — Quick-access links (rendered from SITES array in App.jsx)
└── Containers.jsx     — Docker container status table via the docker-stats sidecar (polls 10 sec)
```

**Data fetching** is handled by two custom hooks in `src/hooks/`:
- `useGlances.js` — polls `/glances/api/3` (proxied to `http://localhost:61208` in dev, `http://host.docker.internal:61208` in production via Nginx), `/gpu-stats/gpu` and `/docker-stats/containers`. Containers come from the `docker-stats` sidecar in `~/docker/glances/` (port 61213, loopback only), not Glances: Glances' containers plugin is disabled because its per-container `docker stats` streams kept dockerd at ~50% of a core. The sidecar reads CPU/RAM from cgroups and keeps Glances' field names.
- `useWeather.js` — fetches from Open-Meteo API (no auth required)

**Styling:** CSS Modules per component (`ComponentName.module.css`). Global theme lives in `src/index.css` — dark background (`#050510`), cyan monospace text, animated grid + scanline overlays.

**Project Zomboid** (`zomboid-sidecar/`, `zomboid-discord-bot/`, `ZomboidCard.jsx`) is parked since 2026-10-16: containers stopped, sidecar behind the `zomboid` compose profile, card hidden via `ZOMBOID_ENABLED` in `App.jsx`. See `ZOMBOID.md` for how to bring it back.

## Deployment

Multi-stage Docker build (Node 20-Alpine → Nginx-Alpine). `nginx.conf` handles SPA fallback routing and proxies `/glances/*` to the host's Glances instance. The compose file exposes port 8086 and uses `host-gateway` to reach host services.
