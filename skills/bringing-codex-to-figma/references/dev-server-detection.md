# Dev Server Detection Guide

Use this when the target app server is not already reachable. Detect the correct
start command, launch it in the background, and handle common failure scenarios.

## Detection Priority Order

Scan the project directory in this order and stop at the first strong match:

### 1. `web-platform.config.js`

Look for `devServer.port` or `serve.port`.
Preferred start command: `npx web-platform dev`, unless `package.json` overrides it.

### 2. Vite config

Check `vite.config.ts`, `vite.config.js`, or `vite.config.mts`.
Default port: `5173`.
Preferred start command: `npm run dev`.

### 3. Next.js config

Check `next.config.ts`, `next.config.js`, or `next.config.mjs`.
Default port: `3000`.
Preferred start command: `npm run dev` unless the script sets another port.

### 4. `package.json` `scripts.dev`

Parse `scripts.dev` for framework clues and explicit port flags.

### 5. Angular / React Scripts / custom servers

| Signal | Default port | Start command |
|---|---|---|
| `angular.json` | 4200 | `npm start` |
| `react-scripts` in `package.json` | 3000 | `npm start` |
| `express` or `fastify` server | read from source | `npm start` |

## Launching the Server

Start in the background and redirect logs:

```bash
cd <projectDir> && <startCommand> > /tmp/dev-server.log 2>&1 &
```

Poll every 3 seconds until reachable, up to 60 seconds:

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 3 <appUrl>
```

Treat `200` and `307` as reachable. Do not kill the process you started.

## Wrong Project Already Running

If a port responds, verify it belongs to the expected project:

```bash
PORT=3000
PID=$(lsof -ti :$PORT | head -1)
CWD=$(lsof -p $PID 2>/dev/null | awk '/cwd/{print $NF}')
```

- If `CWD` matches the project, treat the server as already running.
- If not, stop the wrong process, then start the correct app.

## Failure Scenarios

### `sudo` required

If the app needs a privileged port and fails with `EACCES`, stop and ask the user to
start it manually.

### Custom SSL domain

If the app uses a custom local domain or HTTPS setup requiring local certificates,
ask the user to start the server manually so the right TLS environment is loaded.

### Port already in use

If a different process owns the desired port, either confirm it is the right app or
report that the port is occupied by another process.

### `direnv` / `.envrc`

If the project relies on `direnv`, ask the user to run `direnv allow` and start the
server manually.

### Missing required env vars

If logs show missing environment variables, stop and ask the user to fix `.env` or
start the server manually.

## Determining `appUrl`

Construct `appUrl` from the detected host and port. Strip any trailing slash.
