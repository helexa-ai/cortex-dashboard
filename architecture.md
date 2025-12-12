# Cortex Dashboard Architecture

This document describes the architecture of the **Helexa Cortex Dashboard**, a web application designed to visualize and monitor the state of a running Cortex node.

## 1. High-Level Overview

The dashboard is a **Single Page Application (SPA)** built with **React** and **TypeScript**, bundled using **Vite**. It is designed to be:
- **Stateless**: It does not persist data; it reflects the live state of the connected Cortex node.
- **Real-time**: It relies on a persistent WebSocket connection for live updates.
- **Configurable at Runtime**: The build artifact is generic; environment-specific settings are injected via a static JavaScript file at runtime.

## 2. Technical Stack

- **Core**: React 19, TypeScript
- **Build System**: Vite
- **UI Framework**: Bootstrap 5 (via `react-bootstrap`)
- **Styling**: SCSS/CSS variables for theming (Light/Dark mode)
- **Internationalization**: `i18next` / `react-i18next`
- **Icons**: `react-icons` (FaHeart, FaServer, etc.)

## 3. Runtime Configuration Pattern

To support the "Build Once, Deploy Anywhere" philosophy, the app does not bake environment variables (like the WebSocket URL) into the build bundle.

1.  **`public/config.js`**: A script loaded by `index.html` before the React app boots.
2.  **Global Object**: It sets `window.__CORTEX_CONFIG__`.
3.  **Consumption**: The app reads this configuration on startup to determine which Cortex node to connect to.

This allows operators to deploy the same `dist/` folder to different environments (staging, production) simply by modifying `config.js`.

## 4. Data Flow & Communication

The application centers around a single **WebSocket** connection to the Cortex `observe` endpoint.

### 4.1 Connection Lifecycle
The `Dashboard` component manages the WebSocket lifecycle:
- **Connect**: Initiates connection on mount using the URL from config.
- **Reconnect**: Implements exponential backoff if the connection drops.
- **Teardown**: Closes the socket on component unmount.

### 4.2 The Protocol
The communication follows a specific sequence:

1.  **Snapshot Phase**:
    - The first message from the server is always `kind: "snapshot"`.
    - Contains the full list of currently registered neurons and their states.
    - The app replaces its local "Neuron List" state with this data.

2.  **Event Stream Phase**:
    - Subsequent messages are `kind: "event"`.
    - Events include `neuron_registered`, `neuron_heartbeat`, `model_state_changed`, etc.
    - The app does two things with events:
        1.  **Append to Log**: Adds the raw event to the "Event Stream" UI panel.
        2.  **Patch State**: Updates the "Neuron List" state (e.g., updating `last_heartbeat_at`, adding a new neuron, or changing model status).

### 4.3 Data Normalization
Since the backend protocol may evolve, the frontend implements a **Normalization Layer** (`normalizeSnapshot`, `normalizeMessage`). This layer:
- Adapts older wire formats to the current internal TypeScript interfaces.
- Ensures consistent property names (handling snake_case vs camelCase if necessary).
- Sanitizes missing or null fields.

## 5. Key Components

### 5.1 `Dashboard.tsx`
This is the main controller view. It handles:
- **WebSocket logic**: `useRef` for the socket, `useEffect` for connection management.
- **State**:
    - `snapshot`: The current map of neurons.
    - `events`: An array of recent events.
    - `connectionStatus`: Connected, Reconnecting, Error.
- **Rendering**:
    - **Left Panel**: Renders the list of neurons. It computes derived state like "Seconds since last heartbeat" using a specialized timer hook.
    - **Right Panel**: Renders the event stream. Supports auto-scrolling.

### 5.2 `App.tsx` & `main.tsx`
- Sets up the global `ThemeProvider`.
- Initializes `i18n`.
- Renders the main layout shell.

## 6. Directory Structure

```text
cortex/
├── public/
│   └── config.js       # Runtime configuration
├── src/
│   ├── components/     # Reusable UI parts (Header, Footer)
│   ├── i18n/           # Translation definitions
│   ├── pages/
│   │   └── Dashboard.tsx # Main application logic
│   ├── App.tsx         # Root component & Theme provider
│   ├── main.tsx        # Entry point
│   └── config.ts       # TypeScript interface for window config
```
