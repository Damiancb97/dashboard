# Project Zomboid — aparcado

Desde el **2026-10-16** todo lo de Zomboid está parado a propósito porque no se usaba:

- Contenedores `zomboid-sidecar` y `zomboid-discord-bot` parados (no borrados).
- El sidecar está bajo el perfil `zomboid` en `docker-compose.yml`, así que un
  `docker compose up -d` normal no lo levanta. El bot ya estaba bajo el perfil `discord`.
- La tarjeta del dashboard está oculta con `ZOMBOID_ENABLED = false` en `src/App.jsx`.

No se ha borrado nada: el mundo, la config, los backups, el código y el `.env` siguen igual.

## Cómo volver a levantarlo

Desde `~/projects/dashboard`:

1. **Contenedores** (sidecar + bot de Discord):

   ```bash
   docker compose --profile zomboid --profile discord up -d --build zomboid-sidecar zomboid-discord-bot
   ```

   Si no quieres el bot de Discord, quita `--profile discord` y `zomboid-discord-bot`.

2. **Tarjeta del dashboard:** en `src/App.jsx` pon `const ZOMBOID_ENABLED = true` y
   redespliega solo el dashboard:

   ```bash
   docker compose up -d --build dashboard
   ```

3. **Comprobar** que el sidecar responde:

   ```bash
   curl -s http://127.0.0.1:61212/status
   docker ps --filter name=zomboid
   ```

   El bot debería pasar a `(healthy)` en menos de un minuto.

4. **Encender el juego:** botón «▶ Encender» en el dashboard, el panel del canal de
   Discord, o a mano:

   ```bash
   curl -X POST http://127.0.0.1:61212/start
   ```

   Tarda unos 50 s en arrancar. Se apaga solo tras 30 min sin jugadores.

5. *(Opcional)* Si vuelve para quedarse, borra la línea `profiles: ["zomboid"]` del
   sidecar en `docker-compose.yml` para que arranque con un `docker compose up -d` normal.

## Cosas a tener en cuenta al volver

- **Actualización del juego:** tras meses parado es probable que el servidor dedicado
  esté desactualizado y los clientes no puedan entrar por versión distinta. Actualiza
  «Project Zomboid Dedicated Server» desde Steam (instalado vía snap) antes de encender.
- **Mods:** si los mods del Workshop se han actualizado, el servidor los descarga al
  arrancar. Si alguno da error, mira `~/Zomboid/server-console.txt`.
- **Nunca reconstruyas/pares el sidecar con el juego encendido:** el juego vive en el
  cgroup del contenedor y `docker stop`/`--build` lo mata sin guardar. Apágalo antes
  con `curl -X POST http://127.0.0.1:61212/stop`.
- **Puertos:** el juego usa UDP `16261` y `16262` (para jugar desde fuera tienen que
  seguir redirigidos en el router). El sidecar escucha solo en loopback, en
  `127.0.0.1:61212`.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Datos del servidor (mundo, config, logs) | `~/Zomboid/` |
| Mundo guardado | `~/Zomboid/Saves/Multiplayer/ZomboidGZ/` |
| Config del servidor | `~/Zomboid/Server/ZomboidGZ.ini` |
| Backups | `~/Zomboid/backups/` |
| Scripts de arranque | `~/Zomboid/start-zomboid.sh`, `first-start-zomboid.sh` |
| Binarios del juego | `~/snap/steam/common/.local/share/Steam/steamapps/common/Project Zomboid Dedicated Server/` |
| Sidecar (API) | `zomboid-sidecar/server.py` |
| Bot de Discord | `zomboid-discord-bot/bot.py` |
| Secretos (token Discord, contraseña de reset) | `.env` (no versionado; plantilla en `zomboid-discord-bot/.env.example`) |
| Proxy del dashboard | `nginx.conf` → `/zomboid/api/*` |
