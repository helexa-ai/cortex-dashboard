/**
 * Runtime configuration for the Helexa Cortex dashboard.
 *
 * This module defines:
 *  - The TypeScript shape of the config object.
 *  - A function to read the config from the global `window.__CORTEX_CONFIG__`
 *    that is populated by `public/config.js` at runtime.
 *
 * The key requirement is that operators can adjust the WebSocket endpoint
 * *after* the app has been built, by editing `config.js` in the deployed
 * static assets (e.g. on a CDN or nginx).
 *
 * -----------------------------------------------------------------------------
 * Expected runtime contract
 * -----------------------------------------------------------------------------
 *
 * The built app expects a global object on `window`:
 *
 *   window.__CORTEX_CONFIG__ = {
 *     cortex_ws_endpoint: "ws://localhost:9051"
 *   };
 *
 * This is provided by `public/config.js` (shipped with the build artefacts).
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type CortexRuntimeConfig = {
  /**
   * WebSocket endpoint for the Helexa Cortex dashboard observer.
   *
   * This should match the address of the cortex process started with
   * `--dashboard-socket`, for example:
   *
   *   helexa cortex --dashboard-socket 0.0.0.0:9051 ...
   *
   * which corresponds to the client connecting to:
   *
   *   ws://<cortex-host>:9051
   *
   * In production deployments, this might instead be a reverse-proxied
   * or TLS-terminated endpoint such as:
   *
   *   wss://cortex.example.com/observe
   */
  cortex_ws_endpoint: string;
};

/**
 * Shape of the global config object on window.
 * Kept generic so it can evolve without breaking existing bundles.
 */
export type CortexRuntimeConfigGlobal = Partial<CortexRuntimeConfig>;

/* -------------------------------------------------------------------------- */
/*  Global access helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Internal helper to access the global runtime config safely.
 */
function getGlobalRuntimeConfig(): CortexRuntimeConfigGlobal {
  if (typeof window === "undefined") {
    return {};
  }

  // We deliberately use `any` here to avoid polluting the global `Window`
  // interface for the entire project. This is a narrow, well-defined escape
  // hatch for runtime configuration.
  const w = window as any;

  if (!w.__CORTEX_CONFIG__ || typeof w.__CORTEX_CONFIG__ !== "object") {
    return {};
  }

  return w.__CORTEX_CONFIG__ as CortexRuntimeConfigGlobal;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Default configuration used when no runtime override is provided.
 *
 * This should be a sensible local-development default; production operators
 * are expected to override this via `public/config.js`.
 */
const DEFAULT_CONFIG: CortexRuntimeConfig = {
  cortex_ws_endpoint: "ws://10.6.0.46:9304/observe",
};

/**
 * Load the effective runtime configuration for the dashboard.
 *
 * Precedence:
 *   1. Values from `window.__CORTEX_CONFIG__` (runtime, operator-edited).
 *   2. Library defaults defined in this module.
 *
 * This function is intentionally cheap and side-effect free; it can be called
 * multiple times without issue.
 */
export function loadCortexRuntimeConfig(): CortexRuntimeConfig {
  const globalCfg = getGlobalRuntimeConfig();

  return {
    cortex_ws_endpoint:
      typeof globalCfg.cortex_ws_endpoint === "string" &&
      globalCfg.cortex_ws_endpoint.trim().length > 0
        ? globalCfg.cortex_ws_endpoint
        : DEFAULT_CONFIG.cortex_ws_endpoint,
  };
}

/**
 * Convenience accessor for the Cortex dashboard WebSocket endpoint.
 *
 * Typical usage in React code:
 *
 *   import { getCortexWsEndpoint } from "./config";
 *
 *   const ws = new WebSocket(getCortexWsEndpoint());
 */
export function getCortexWsEndpoint(): string {
  return loadCortexRuntimeConfig().cortex_ws_endpoint;
}
