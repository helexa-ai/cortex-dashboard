# Helexa Cortex Dashboard

This repo contains a small React + TypeScript + Vite application that acts as a
*dashboard* for a running **Helexa Cortex** node.

The dashboard connects to Cortex’s **observe** websocket endpoint and provides:

- A live **neurons snapshot**:
  - node id, label, backend
  - health classification
  - model provisioning state per neuron
- A streaming **event log**:
  - `neuron_registered`
  - `neuron_heartbeat`
  - provisioning events (`provisioning_sent`, `provisioning_response`)
  - `model_state_changed`
  - `cortex_shutdown_notice`
- A theme-aware UI (light/dark) and live indicators:
  - “seconds since last heartbeat”
  - a heartbeat icon per neuron that pulses on heartbeats

The app is designed to be **built once** and then **configured at deploy time**
by operators, without rebuilding the bundle.

---

## 1. Prerequisites

You will need:

- **Node.js** (LTS is fine: 18+)
- **pnpm** (preferred), or yarn/npm if you adapt the commands
- A running **Helexa Cortex** node with the dashboard socket enabled, e.g.:

```bash
helexa cortex \
  --dashboard-socket 0.0.0.0:8090 \
  ...
```

This exposes a websocket endpoint (by default at `ws://<host>:8090/observe`)
that the dashboard will connect to.

---

## 2. Installing dependencies

From this `cortex` directory:

```bash
pnpm install
```

This installs all app dependencies into `node_modules/`.

---

## 3. Running the dashboard in development

To run a hot-reloading dev server:

```bash
pnpm dev
```

By default Vite will start on something like `http://localhost:5173/`.

### Configure the websocket endpoint in dev

The dashboard loads its configuration from `/config.js` at runtime. For dev,
`public/config.js` is copied into `dist/` and served as-is.

Open:

```text
cortex/public/config.js
```

and set:

```js
window.__CORTEX_CONFIG__ = {
  // Example: local Cortex node listening on 8090 with /observe
  cortex_ws_endpoint: "ws://127.0.0.1:8090/observe",
};
```

During `pnpm dev`, you can edit `public/config.js` and refresh the browser to
point the dashboard at a different Cortex node.

---

## 4. Building for production

To produce a static build:

```bash
pnpm build
```

This runs TypeScript and Vite and writes output into `dist/`:

- `dist/index.html`
- `dist/assets/*` (JS, CSS, etc.)
- `dist/config.js` (copied from `public/config.js`)

You can preview the production build locally:

```bash
pnpm preview
```

(See Vite docs for details; this is optional.)

---

## 5. Deploying the built dashboard

The build artefacts in `dist/` are static and can be served from:

- Any static file host / CDN
- Nginx, Caddy, Apache, etc.
- Object storage with static site hosting (S3, GCS, …)

### 5.1. Packaging the build

A common pattern:

```bash
pnpm build
tar czf cortex-dashboard-dist.tar.gz dist
# or
zip -r cortex-dashboard-dist.zip dist
```

Distribute that archive to operators.

### 5.2. Operator configuration of the websocket endpoint

Operators are expected to **edit `config.js` in the deployed `dist/`** directory
to point the dashboard at their own Cortex node.

The file `dist/config.js` looks like:

```js
window.__CORTEX_CONFIG__ = {
  /**
   * WebSocket endpoint for the Helexa Cortex dashboard stream.
   *
   * Examples:
   *   - "ws://127.0.0.1:8090/observe"
   *   - "wss://cortex.example.com/observe"
   *
   * NOTE:
   * - Use "ws://" for plain HTTP deployments.
   * - Use "wss://" when the dashboard is served over HTTPS.
   */
  cortex_ws_endpoint: "ws://127.0.0.1:8090/observe",
};
```

To reconfigure a deployed dashboard, operators only need to:

1. Open `config.js` on their CDN / server.
2. Edit `cortex_ws_endpoint` to match their environment.
3. Save and reload the dashboard in the browser.

No rebuild is required.

---

## 6. Websocket protocol (high-level)

The dashboard talks to Cortex’s **observe** websocket, defined in
`dashboard.md` in the parent Helexa repo.

At a high level:

- URL: `ws://<cortex-host>:<dashboard-port>/observe`
- Messages are JSON `Text` frames.
- The first message is always a **snapshot**:

  ```json
  { "kind": "snapshot", "snapshot": { "neurons": [...] } }
  ```

- After that, Cortex sends a stream of **event** messages:

  ```json
  { "kind": "event", "event": { "type": "<event-type>", ... } }
  ```

Key event types:

- `neuron_registered`
- `neuron_removed`
- `neuron_heartbeat`
- `provisioning_sent`
- `provisioning_response`
- `model_state_changed`
- `cortex_shutdown_notice`

The dashboard:

- Uses the **snapshot** as the initial neurons view.
- Updates a local heartbeat timestamp per neuron on `neuron_heartbeat`.
- Shows “N seconds ago” for the last heartbeat (updated every ~1.5 seconds).
- Logs all events in a scrollable event stream with JSON payloads.

---

## 7. Theme and layout

The app supports **light** and **dark** themes via a custom `ThemeProvider`:

- Sets `data-theme="light" | "dark"` on `<html>`.
- Wraps the app with `.app-root.theme-[mode]`.
- CSS variables in `src/index.css` drive background, text, border, and accent
  colours.
- The header includes a theme toggle button (sun/moon icon).

The dashboard layout:

- **Header**: Logo + navigation.
- **Main**:

  - Connection card (WebSocket status, Auto-scroll toggle).
  - Two main columns:
    - Left: **Neurons snapshot** (list of neurons, metadata, models).
    - Right: **Event stream** (live event log with JSON details).

- **Footer**: Simple copyright line with localisation support.

---

## 8. i18n / localisation

The app uses `i18next` + `react-i18next` with resources under `src/i18n/`.

- Translations are organised by:
  - Language code (`en`, `ru`, …)
  - Namespace (`common`, `home`, `chat`)

The dashboard mainly uses the `common` namespace for:

- App name
- Navigation
- Theme toggle text
- Language names
- Footer

Adding a new language requires:

1. Adding it to `src/i18n/languages.ts`.
2. Adding translation JSON files to `src/i18n/resources/<lang>/`.
3. Wiring it into `src/i18n/index.ts`.

---

## 9. Development notes

- This project was bootstrapped from the standard
  **Vite + React + TypeScript** template.
- Build/lint scripts are in `package.json`:

  - `pnpm dev` – dev server with HMR.
  - `pnpm build` – typecheck + production build.
  - `pnpm preview` – preview production build.

- The main app entry is `src/main.tsx`, which:
  - Imports `./i18n` to initialise translations.
  - Renders `<App />` inside `<ThemeProvider>`.

---

## 10. Troubleshooting

### 10.1. Dashboard connects but shows only the snapshot

- Verify **DevTools → Network → WS** that the same websocket URL as
  `cortex_ws_endpoint` is being used.
- Ensure the Cortex node is actually sending events (e.g. you see them with
  `websocat ws://.../observe`).
- Confirm that `config.js` is served from the same origin as `index.html` and
  is not cached with an old endpoint.

### 10.2. Dashboard fails to connect

- The connection card will show an error and the browser console may have:

  - `Firefox can’t establish a connection to the server at ws://...`
  - Or similar for Chrome.

- Check:
  - Cortex is started with `--dashboard-socket`.
  - Port and path in `config.js` match the actual socket (e.g. `:8090/observe`).
  - Any reverse proxy in front of Cortex is forwarding websockets correctly.

### 10.3. Seeing raw translation keys (e.g. `app.name`)

- This usually means i18n wasn’t initialised.
- Ensure `src/main.tsx` imports `./i18n` before rendering `<App />`.

---

If you’re extending this dashboard (e.g. adding more panels, controls, or
operator actions), keep the runtime configuration approach (`config.js`) intact
so operators can continue to re-point the dashboard to different Cortex nodes
without rebuilding the app.

---

## 11. License

This project is provided under the **Helexa.ai – Source Available License with
Scheduled Open Source Transition** described in `license.md`:

- Until **January 1st, 2028**, the code is licensed under the
  **Polyform Shield License 1.0**.
- On **January 1st, 2028**, this repository and all contributions made prior to
  that date will automatically and irrevocably transition to the
  **Apache License, Version 2.0**.

See `license.md` for the full license text and details.