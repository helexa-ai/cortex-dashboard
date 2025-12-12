# Contributor Guide & Best Practices

This document collects architectural insights, design patterns, and improvement opportunities identified during the development of the Cortex Dashboard. It is intended to help future AI agents and human contributors maintain high standards of quality and maintainability.

## 1. Core Architectural Patterns

### 1.1 "Build Once, Deploy Anywhere"
**Context**: This application is often deployed in environments where rebuilding the Docker container or static assets is not feasible for configuration changes.
**Pattern**: We do **not** use `process.env` or Vite's `import.meta.env` for the WebSocket endpoint.
**Mechanism**:
- Configuration lives in `public/config.js`, which attaches a global object `window.__CORTEX_CONFIG__`.
- This file is served as a static asset.
- Operators modify this file in the `dist/` folder post-build.
**Rule**: Never add build-time configuration for values that might change between staging and production environments. Always use the runtime config pattern.

### 1.2 Data Normalization Layer
**Context**: The Cortex backend protocol is evolving. Field names change (e.g., `node_id` vs `hostname` availability), and data shapes shift between versions.
**Pattern**: The frontend maintains a strict separation between "Wire Types" and "Internal Types".
**Mechanism**:
- **Wire Types**: loosely defined (often using `any` or partials) to match what comes over the socket.
- **Internal Types**: Strict, fully-typed interfaces used by React components (e.g., `NormalizedNeuron`).
- **Normalizers**: Functions like `normalizeSnapshot` and `normalizeMessage` act as the anti-corruption layer.
**Rule**: Never pass raw WebSocket data directly to UI components. Always pass it through a normalization function first to handle defaults, null checks, and legacy field adaptation.

## 2. Identified Technical Debt & Improvement Opportunities

### 2.1 Type Safety (`no-explicit-any`)
**Observation**: The current codebase relies heavily on `any`, particularly in `Dashboard.tsx` within the normalization logic and protocol handling.
**Impact**: This defeats the purpose of TypeScript and hides potential runtime errors when the backend schema changes.
**Action Plan**:
- Define precise interfaces for `ProvisioningResponseWire` and `ProvisioningCommand`.
- Replace `(n as any).field` casts with User-Defined Type Guards (e.g., `function isLegacyNeuron(n: unknown): n is LegacyNeuron`).
- Enable the strict linter rule and incrementally fix the violations.

### 2.2 Component Decomposition
**Observation**: `Dashboard.tsx` has grown to over 1000 lines. It conflates several responsibilities:
1. WebSocket connection lifecycle management.
2. Protocol parsing and event dispatching.
3. State management (merging snapshots with deltas).
4. UI rendering.
**Action Plan**:
- **Extract Hooks**: Create `useCortexSocket` to handle the connection and `useNeuronState` to handle the data reduction logic.
- **Extract Components**: Move the "Neurons Snapshot" list and "Event Stream" log into their own files (`src/components/NeuronList.tsx`, `src/components/EventStream.tsx`).
- **Benefits**: This will make unit testing the data logic significantly easier without requiring a full DOM environment.

## 3. Development Standards

### 3.1 Internationalization (i18n)
- **Requirement**: All user-facing text must be wrapped in `t()` calls from `react-i18next`.
- **Reasoning**: The dashboard is used globally. Hardcoded strings require code changes to translate.
- **Workflow**: Add new keys to `src/i18n/resources/en/common.json` (or strictly scoped namespaces) immediately when adding UI elements.

### 3.2 Styling
- **Framework**: Bootstrap 5 via `react-bootstrap` classes.
- **Theming**: Do not hardcode hex colors. Use CSS variables defined in `index.css` (e.g., `var(--bg-color)`, `var(--text-color)`) to support Light/Dark modes automatically.

### 3.3 Linting
- The project uses `eslint` with strict TypeScript rules.
- **Do not** add `eslint-disable` comments unless absolutely necessary. If you encounter a linter error, fix the underlying code (usually a type issue or an unused variable).

## 4. Debugging & Observability
- **Log Tags**: When adding console logs, prefix them with `[Cortex]` to differentiate them from other library noise.
- **Socket State**: The dashboard UI displays the connection state. Ensure that any new data fetching logic hooks into the global `ConnectionStatus` state so the user knows if data is stale.