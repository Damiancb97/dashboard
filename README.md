# Dashboard personal — Damiancb

Dashboard de monitorización de servidor con estética cyberpunk/terminal. Muestra en tiempo real el estado del sistema, GPU, contenedores Docker y el tiempo.

## Captura

```
┌─────────────────────────────────────────────────────┐
│  Damiancb 🤖                                        │
├──────────────────┬──────────────────────────────────┤
│  🕐 HH:MM:SS     │  🌤️  18°C · 12 km/h             │
├──────────────────┴──────────────────────────────────┤
│  CPU  12%  35°C  │  Memoria  42%                    │
├─────────────────────────────────────────────────────┤
│  GPU — RTX 3060  │  Carga 0%  │  VRAM 8%  │  30°C  │
├─────────────────────────────────────────────────────┤
│  damiancb.com    │  timedgg.com                     │
├─────────────────────────────────────────────────────┤
│  Contenedores Docker (N)                            │
│  nombre · estado · CPU · RAM                        │
└─────────────────────────────────────────────────────┘
```

## Funcionalidades

| Widget | Descripción | Actualización |
|--------|-------------|---------------|
| **Reloj** | Hora y fecha en tiempo real | Cada segundo |
| **Tiempo** | Temperatura, estado y viento en A Coruña | Cada 10 min |
| **CPU** | Uso total, temperatura de package, cores, user/sys | Cada 3 s |
| **Memoria** | Porcentaje y GB usados/totales | Cada 3 s |
| **GPU** | Carga, VRAM y temperatura de la RTX 3060 | Cada 3 s |
| **Contenedores** | Lista de todos los Docker con estado, CPU y RAM | Cada 10 s |
| **Links** | Acceso rápido a damiancb.com y timedgg.com | — |

## Stack

| Capa | Tecnología | Versión |
|------|-----------|---------|
| UI | React | 19.2.4 |
| Build | Vite + @vitejs/plugin-react (Oxc parser) | 8.0.0 |
| Estilos | CSS Modules | — |
| Linting | ESLint (flat config) | 9.39.4 |
| Servidor | Nginx | alpine |
| Contenedor | Docker + Docker Compose | — |

Sin TypeScript, sin librerías de componentes, sin gestor de estado externo.

## Servicios externos

### Glances (`/home/serverubuntu/docker/glances/`)

Herramienta de monitorización del sistema expuesta via API REST.

| Servicio | Puerto | Uso |
|----------|--------|-----|
| Glances API | `61208` | CPU, memoria, temperatura CPU, red, discos, procesos |
| gpu-stats sidecar | `61211` | Temperatura, carga y VRAM de la GPU NVIDIA |
| docker-stats sidecar | `127.0.0.1:61213` | Lista de contenedores con estado, CPU y RAM |
| monitor-web (Nginx) | `61209` | UI web propia de Glances |

El **sidecar `gpu-stats`** es un microservicio Python (`python:3.11-slim`) que usa `nvidia-ml-py` para leer la RTX 3060 directamente. Existe porque la imagen de Glances es Alpine (musl libc) y es incompatible con `libnvidia-ml.so.1` compilada para glibc — el sidecar corre en Debian y resuelve esta limitación.

El **sidecar `docker-stats`** (`docker_stats_server.py`, solo librería estándar) sustituye al plugin de contenedores de Glances, que está desactivado en `glances.conf`. Ese plugin mantenía abierto un stream `docker stats` por contenedor, y dockerd gastaba ~50 % de un núcleo calculándolos cada segundo aunque nadie mirase. El sidecar lee la CPU y la RAM de los cgroups del host cada 5 s. La lista de contenedores solo se pide a dockerd cuando cambia, porque una sola llamada le cuesta ~0,4 s de CPU. Para saber cuándo, escucha los eventos de Docker, que no gastan nada mientras no pasa nada, y además la vuelve a pedir cada 5 min por si se pierde alguno. Así dockerd pasa de ~50 % a ~1 %. Devuelve los mismos campos que Glances (`name`, `Status`, `cpu_percent`, `memory_usage`) y solo escucha en loopback. sotrixOS lee el mismo endpoint.

### Open-Meteo

API pública de meteorología, sin API key. Coordenadas fijas: A Coruña (`43.37135, -8.396`).

## Puertos

| Puerto | Servicio |
|--------|---------|
| `8086` | Dashboard (producción, Docker) |
| `5173` | Dashboard (desarrollo, Vite dev server) |
| `61208` | Glances API |
| `61209` | Glances UI web |
| `61211` | GPU stats sidecar |
| `61213` | docker-stats sidecar (solo loopback) |

## Arquitectura de proxy

En **desarrollo**, Vite proxea las peticiones del frontend:

```
/glances/*      →  localhost:61208
/gpu-stats/*    →  localhost:61211
/docker-stats/* →  localhost:61213
```

En **producción**, Nginx hace lo mismo desde dentro del contenedor:

```
/glances/*      →  host.docker.internal:61208
/gpu-stats/*    →  host.docker.internal:61211
/docker-stats/* →  127.0.0.1:61213
```

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción en /dist
npm run lint     # ESLint
```

## Producción (Docker)

```bash
# Dashboard
docker compose build
docker compose up -d

# Glances + sidecars de GPU y contenedores (si no están ya corriendo)
cd /home/serverubuntu/docker/glances
docker compose up -d
```

## Estructura

```
src/
├── components/
│   ├── Clock.jsx          # Reloj en tiempo real
│   ├── Weather.jsx        # Tiempo via Open-Meteo
│   ├── ServerStats.jsx    # CPU + Memoria + temp CPU
│   ├── GpuStats.jsx       # GPU via sidecar
│   ├── Containers.jsx     # Docker containers via docker-stats
│   └── SiteCard.jsx       # Links rápidos
└── hooks/
    ├── useGlances.js      # Polling a Glances API, gpu-stats y docker-stats
    └── useWeather.js      # Polling a Open-Meteo
```
