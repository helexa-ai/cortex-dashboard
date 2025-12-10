/**
 * Helexa Cortex Dashboard - Runtime Configuration
 *
 * This file is loaded at runtime by the built dashboard (from /config.js).
 *
 * Operators can edit this file *after* building the app (e.g. in a CDN
 * or static nginx deployment) to point the dashboard at their Cortex
 * websocket endpoint, without needing to rebuild the bundle.
 *
 * -----------------------------------------------------------------------------
 * HOW TO USE
 * -----------------------------------------------------------------------------
 *
 * 1. Build the app (e.g. `pnpm build`).
 * 2. Deploy the generated `dist` directory to your hosting environment.
 * 3. Ensure `config.js` is served at the root of the dashboard, alongside
 *    `index.html` (e.g. /config.js).
 * 4. Edit the `cortex_ws_endpoint` field below to your environment:
 *
 *      - Development (local):
 *          ws://localhost:9051
 *
 *      - Production (example):
 *          wss://cortex.example.com/observe
 *
 * The React app expects this file to define a global `window.__CORTEX_CONFIG__`
 * object with a `cortex_ws_endpoint` string property.
 */

window.__CORTEX_CONFIG__ = {
  /**
   * WebSocket endpoint for the Helexa Cortex dashboard stream.
   *
   * This should point at the Cortex process started with `--dashboard-socket`.
   *
   * Examples:
   *   - "ws://localhost:9051/observe"
   *   - "wss://cortex.example.com/observe"
   *
   * NOTE:
   * - Use "ws://" for plain HTTP deployments.
   * - Use "wss://" when the dashboard is served over HTTPS.
   */
  cortex_ws_endpoint: "ws://127.0.0.1:8090/observe",
};
