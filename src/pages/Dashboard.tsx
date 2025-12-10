import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getCortexWsEndpoint } from "../config";
import { FaHeartPulse, FaRegHeart } from "react-icons/fa6";

/**
 * Types and helpers for the Cortex dashboard websocket.
 *
 * NOTE: These are deliberately tolerant of multiple wire formats:
 * - Older cortex builds that use plain strings for model IDs and
 *   serde-style enums for provisioning commands.
 * - Newer builds that use the shapes described in dashboard.md.
 *
 * We normalise incoming messages into a friendlier shape for rendering.
 */

/* -------------------------- Snapshot-related types ------------------------- */

export type ModelId = { 0: string } | string;

export type ModelProvisioningStatus = {
  model_id: ModelId;
  last_cmd_kind: string;
  last_response: any | null;
  effective_status: string;
};

export type NeuronDescriptor = {
  node_id: string | null;
  label: string | null;
  metadata: any;
};

export type ObserveNeuron = {
  descriptor: NeuronDescriptor;
  last_heartbeat_at: unknown;
  health: "healthy" | "degraded" | "stale" | string;
  offline: boolean;
  models: ModelProvisioningStatus[];
};

export type ObserveSnapshot = {
  /**
   * In older cortex builds this is: NeuronDescriptor[]
   * In newer builds this is: ObserveNeuron[]
   */
  neurons: any[];
};

/* ---------------------------- Event-related types -------------------------- */

export type ProvisioningCommand =
  | { kind: "upsert_model_config"; config: any }
  | { kind: "load_model"; model_id: ModelId }
  | { kind: "unload_model"; model_id: ModelId };

export type ProvisioningResponseWire = any;

export type ObserveEvent =
  | { type: "neuron_registered"; neuron: NeuronDescriptor }
  | { type: "neuron_removed"; neuron_id: string }
  | { type: "neuron_heartbeat"; neuron_id: string; metrics: any }
  | { type: "provisioning_sent"; neuron_id: string; cmd: ProvisioningCommand }
  | {
      type: "provisioning_response";
      neuron_id: string;
      response: ProvisioningResponseWire;
    }
  | {
      type: "model_state_changed";
      neuron_id: string;
      models: ModelProvisioningStatus[];
    }
  | {
      type: "cortex_shutdown_notice";
      reason: string | null;
    };

export type ObserveMessage =
  | { kind: "snapshot"; snapshot: ObserveSnapshot }
  | { kind: "event"; event: ObserveEvent };

/**
 * Normalised shapes used by the UI after we adapt the wire format.
 */

export type NormalizedModelId = string;

export type NormalizedModelProvisioningStatus = {
  model_id: NormalizedModelId;
  last_cmd_kind: string;
  last_response: any | null;
  effective_status: string;
};

export type NormalizedNeuron = {
  descriptor: NeuronDescriptor;
  last_heartbeat_at: unknown;
  health: string;
  offline: boolean;
  models: NormalizedModelProvisioningStatus[];
};

export type NormalizedSnapshot = {
  neurons: NormalizedNeuron[];
};

export type NormalizedProvisioningCommand =
  | { kind: "upsert_model_config"; config: any }
  | { kind: "load_model"; model_id: NormalizedModelId }
  | { kind: "unload_model"; model_id: NormalizedModelId };

export type NormalizedObserveEvent =
  | { type: "neuron_registered"; neuron: NeuronDescriptor }
  | { type: "neuron_removed"; neuron_id: string }
  | { type: "neuron_heartbeat"; neuron_id: string; metrics: any }
  | {
      type: "provisioning_sent";
      neuron_id: string;
      cmd: NormalizedProvisioningCommand;
    }
  | {
      type: "provisioning_response";
      neuron_id: string;
      response: ProvisioningResponseWire;
    }
  | {
      type: "model_state_changed";
      neuron_id: string;
      models: NormalizedModelProvisioningStatus[];
    }
  | {
      type: "cortex_shutdown_notice";
      reason: string | null;
    };

export type NormalizedObserveMessage =
  | { kind: "snapshot"; snapshot: NormalizedSnapshot }
  | { kind: "event"; event: NormalizedObserveEvent };

/* ----------------------------- Local UI shapes ----------------------------- */

type ConnectionStatus = "connecting" | "open" | "polling" | "closed" | "error";

type EventLogItem = {
  id: number;
  receivedAt: string;
  kind: NormalizedObserveMessage["kind"];
  eventType: NormalizedObserveEvent["type"] | "snapshot";
  payload: NormalizedObserveMessage;
};

type ShutdownState = {
  seenShutdownNotice: boolean;
  lastReason: string | null;
  lastSeenAt: string | null;
};

/* --------------------------------- Helpers -------------------------------- */

const formatTime = (d: Date): string =>
  d.toLocaleTimeString(undefined, { hour12: false });

/**
 * Some timestamp fields (e.g. last_heartbeat_at) may be encoded as:
 *   { secs_since_epoch: number, nanos_since_epoch: number }
 * or as plain ISO strings. This helper turns either into a readable string.
 */
const formatHeartbeatTimestamp = (value: unknown): string => {
  if (value == null) return "no heartbeat yet";

  if (typeof value === "string") {
    if (!value.trim()) return "no heartbeat yet";
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "secs_since_epoch" in (value as any)
  ) {
    const v = value as { secs_since_epoch: number; nanos_since_epoch?: number };
    const secs =
      typeof v.secs_since_epoch === "number" ? v.secs_since_epoch : NaN;
    if (!Number.isFinite(secs)) {
      return "heartbeat time unavailable";
    }
    try {
      const ms = secs * 1000;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) {
        return "heartbeat time unavailable";
      }
      return d.toISOString();
    } catch {
      return "heartbeat time unavailable";
    }
  }

  // Fallback: avoid rendering raw objects as React children.
  try {
    return JSON.stringify(value);
  } catch {
    return "heartbeat time unavailable";
  }
};

const normalizeModelId = (id: ModelId): NormalizedModelId => {
  if (typeof id === "string") return id;
  if (id && typeof id === "object" && "0" in id) {
    const v = (id as any)["0"];
    return typeof v === "string" ? v : JSON.stringify(id);
  }
  return JSON.stringify(id);
};

// Normalised model IDs are represented as plain strings throughout the UI,
// so we no longer need a helper that inspects the underlying wire shape.

/**
 * Normalize provisioning commands coming from cortex:
 * - Old style: { UpsertModelConfig: {...} }
 * - New style: { kind: "upsert_model_config", config: {...} }
 */
const normalizeProvisioningCommand = (
  wire: any,
): NormalizedProvisioningCommand => {
  if (!wire || typeof wire !== "object") {
    return { kind: "upsert_model_config", config: wire };
  }

  if ("kind" in wire) {
    const k = (wire as any).kind;
    if (k === "upsert_model_config") {
      return { kind: "upsert_model_config", config: (wire as any).config };
    }
    if (k === "load_model" || k === "unload_model") {
      const mid = (wire as any).model_id;
      return {
        kind: k,
        model_id: typeof mid === "string" ? mid : normalizeModelId(mid),
      };
    }
  }

  if ("UpsertModelConfig" in wire) {
    return {
      kind: "upsert_model_config",
      config: (wire as any).UpsertModelConfig,
    };
  }
  if ("LoadModel" in wire) {
    const mid = (wire as any).LoadModel;
    return {
      kind: "load_model",
      model_id: typeof mid === "string" ? mid : normalizeModelId(mid),
    };
  }
  if ("UnloadModel" in wire) {
    const mid = (wire as any).UnloadModel;
    return {
      kind: "unload_model",
      model_id: typeof mid === "string" ? mid : normalizeModelId(mid),
    };
  }

  return { kind: "upsert_model_config", config: wire };
};

/**
 * Normalize the snapshot.neurons array so the UI can always work with
 * NormalizedNeuron, regardless of the wire format.
 */
const normalizeSnapshot = (snapshot: ObserveSnapshot): NormalizedSnapshot => {
  const neuronsWire = Array.isArray(snapshot.neurons) ? snapshot.neurons : [];
  const normalized: NormalizedNeuron[] = neuronsWire.map(
    (n: any, idx: number) => {
      if (n && typeof n === "object" && "descriptor" in n) {
        const descriptor = (n as any).descriptor as NeuronDescriptor;
        return {
          descriptor,
          last_heartbeat_at: (n as any).last_heartbeat_at ?? null,
          health: (n as any).health ?? "unknown",
          offline: Boolean((n as any).offline),
          models: Array.isArray((n as any).models)
            ? (n as any).models.map((m: any) => ({
                model_id: normalizeModelId(m.model_id),
                last_cmd_kind: m.last_cmd_kind ?? "unknown",
                last_response: m.last_response ?? null,
                effective_status: m.effective_status ?? "unknown",
              }))
            : [],
        };
      }

      const descriptor: NeuronDescriptor = {
        node_id: (n && (n as any).node_id) ?? null,
        label:
          (n && (n as any).label) ??
          (n && (n as any).node_id) ??
          `Neuron #${idx + 1}`,
        metadata: (n && (n as any).metadata) ?? {},
      };

      return {
        descriptor,
        last_heartbeat_at: null,
        health: "unknown",
        offline: false,
        models: [],
      };
    },
  );

  return { neurons: normalized };
};

/**
 * Normalize an incoming ObserveMessage from cortex into the shape
 * used by the dashboard UI. This is tolerant to older and newer
 * protocol variants.
 */
const normalizeMessage = (wire: ObserveMessage): NormalizedObserveMessage => {
  if (wire.kind === "snapshot") {
    return {
      kind: "snapshot",
      snapshot: normalizeSnapshot(wire.snapshot),
    };
  }

  const e = wire.event as any;

  if (!e || typeof e !== "object" || typeof e.type !== "string") {
    return wire as unknown as NormalizedObserveMessage;
  }

  switch (e.type) {
    case "neuron_registered":
      return {
        kind: "event",
        event: {
          type: "neuron_registered",
          neuron: e.neuron as NeuronDescriptor,
        },
      };

    case "neuron_removed":
      return {
        kind: "event",
        event: { type: "neuron_removed", neuron_id: String(e.neuron_id) },
      };

    case "neuron_heartbeat":
      return {
        kind: "event",
        event: {
          type: "neuron_heartbeat",
          neuron_id: String(e.neuron_id),
          metrics: e.metrics ?? {},
        },
      };

    case "provisioning_sent":
      return {
        kind: "event",
        event: {
          type: "provisioning_sent",
          neuron_id: String(e.neuron_id),
          cmd: normalizeProvisioningCommand(e.cmd),
        },
      };

    case "provisioning_response":
      return {
        kind: "event",
        event: {
          type: "provisioning_response",
          neuron_id: String(e.neuron_id),
          response: e.response,
        },
      };

    case "model_state_changed": {
      const modelsWire = Array.isArray(e.models) ? e.models : [];
      const models: NormalizedModelProvisioningStatus[] = modelsWire.map(
        (m: any) => ({
          model_id: normalizeModelId(m.model_id),
          last_cmd_kind: m.last_cmd_kind ?? "unknown",
          last_response: m.last_response ?? null,
          effective_status: m.effective_status ?? "unknown",
        }),
      );
      return {
        kind: "event",
        event: {
          type: "model_state_changed",
          neuron_id: String(e.neuron_id),
          models,
        },
      };
    }

    case "cortex_shutdown_notice":
      return {
        kind: "event",
        event: {
          type: "cortex_shutdown_notice",
          reason: e.reason ?? null,
        },
      };

    default:
      return wire as unknown as NormalizedObserveMessage;
  }
};

const describeEvent = (msg: NormalizedObserveMessage): string => {
  if (msg.kind === "snapshot") {
    const count = msg.snapshot.neurons.length;
    return `snapshot: ${count} neuron${count === 1 ? "" : "s"}`;
  }

  const e = msg.event;
  switch (e.type) {
    case "neuron_registered": {
      const neuron = e.neuron;
      return `neuron_registered: ${
        neuron.label ?? neuron.node_id ?? "unknown neuron"
      }`;
    }
    case "neuron_removed":
      return `neuron_removed: ${e.neuron_id}`;
    case "neuron_heartbeat":
      return `neuron_heartbeat: ${e.neuron_id}`;
    case "provisioning_sent": {
      const cmd = e.cmd;
      const base = `provisioning_sent: ${cmd.kind}`;
      if (cmd.kind === "upsert_model_config") {
        return `${base} (${(cmd.config && cmd.config.id) || "model"})`;
      }
      if (cmd.kind === "load_model" || cmd.kind === "unload_model") {
        return `${base} (${cmd.model_id || "model"})`;
      }
      return base;
    }
    case "provisioning_response": {
      const raw = e.response;
      const tag =
        raw && typeof raw === "object"
          ? Object.keys(raw as Record<string, unknown>)[0]
          : "response";
      return `provisioning_response: ${tag} for ${e.neuron_id}`;
    }
    case "model_state_changed": {
      const models = e.models ?? [];
      const ids = models
        .map((m) => m.model_id)
        .filter((s) => typeof s === "string" && s.length > 0) as string[];
      const summary =
        ids.length === 0
          ? "models updated"
          : `models updated: ${ids.join(", ")}`;
      return `model_state_changed for ${e.neuron_id}: ${summary}`;
    }
    case "cortex_shutdown_notice":
      return `cortex_shutdown_notice: ${
        e.reason?.trim() || "cortex is shutting down"
      }`;
    default:
      return "event";
  }
};

const statusBadgeVariant = (status: ConnectionStatus): string => {
  switch (status) {
    case "connecting":
      return "warning";
    case "open":
      return "success";
    case "polling":
      return "info";
    case "closed":
      return "secondary";
    case "error":
      return "danger";
    default:
      return "secondary";
  }
};

/* ------------------------------- Dashboard --------------------------------- */

/**
 * Dashboard page
 *
 * - Connects to Cortex dashboard websocket using the runtime config endpoint.
 * - Handles the updated message shapes (ObserveSnapshot, ObserveEvent union).
 * - Visualises snapshot (neurons + models) and the streaming event log.
 * - Handles planned shutdowns and endpoint outages:
 *   - On `cortex_shutdown_notice` or unreachable WS:
 *     - Enter a "polling" mode that tries to re-establish the WS connection
 *       every 60 seconds until it comes back online.
 */
const Dashboard: React.FC = () => {
  const endpoint = useMemo(() => getCortexWsEndpoint(), []);

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ObserveSnapshot | null>(null);
  const [events, setEvents] = useState<EventLogItem[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [shutdownState, setShutdownState] = useState<ShutdownState>({
    seenShutdownNotice: false,
    lastReason: null,
    lastSeenAt: null,
  });
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  const [heartbeatAnimIds, setHeartbeatAnimIds] = useState<
    Record<string, number>
  >({});

  const wsRef = useRef<WebSocket | null>(null);
  const nextEventIdRef = useRef(1);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const pollingTimerRef = useRef<number | null>(null);

  /* ------------------------------ Auto-scroll ------------------------------ */

  useEffect(() => {
    if (!autoScroll) return;
    if (!logEndRef.current) return;
    logEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events, autoScroll]);

  /* -------------------------- Polling (reconnect) -------------------------- */

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const scheduleReconnectPoll = useCallback(() => {
    clearPollingTimer();
    setConnectionStatus("polling");

    // Try again in 60 seconds.
    pollingTimerRef.current = window.setTimeout(() => {
      pollingTimerRef.current = null;
      // Only attempt reconnection if we are still in polling mode; if the user
      // has navigated away or something else changed the state, we leave it.
      setConnectionStatus((prev) =>
        prev === "polling" || prev === "error" || prev === "closed"
          ? "connecting"
          : prev,
      );
    }, 60_000);
  }, [clearPollingTimer]);

  /* --------------------------- WebSocket lifecycle ------------------------- */

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors.
      }
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }

      const existing = wsRef.current;
      if (existing && existing.readyState !== WebSocket.CLOSED) {
        return;
      }

      if (connectionStatus === "polling") {
        setLastError(null);
      }

      setConnectionStatus("connecting");

      try {
        const ws = new WebSocket(endpoint);
        wsRef.current = ws;

        ws.onopen = () => {
          // Ignore events from stale sockets that are no longer current.
          if (wsRef.current !== ws) {
            return;
          }
          clearPollingTimer();
          setConnectionStatus("open");
          setLastError(null);
          setIsInitialLoading(true);
          // On a fresh connection, consider previous snapshot/events stale.
          setSnapshot(null);
          setEvents([]);
          setShutdownState({
            seenShutdownNotice: false,
            lastReason: null,
            lastSeenAt: null,
          });
        };

        ws.onmessage = (ev) => {
          // Ignore events from stale sockets that are no longer current.
          if (wsRef.current !== ws) {
            return;
          }

          try {
            const wire = JSON.parse(ev.data as string) as ObserveMessage;
            const data = normalizeMessage(wire);

            const receivedAt = formatTime(new Date());
            const id = nextEventIdRef.current++;
            const item: EventLogItem = {
              id,
              receivedAt,
              kind: data.kind,
              eventType:
                data.kind === "snapshot" ? "snapshot" : data.event.type,
              payload: data,
            };

            // Keep the last 300 messages to prevent unbounded growth.
            setEvents((prev) => [...prev, item].slice(-300));

            if (data.kind === "snapshot") {
              setSnapshot(data.snapshot);
              setIsInitialLoading(false);
              return;
            }

            const e = data.event;

            if (e.type === "neuron_heartbeat") {
              // Update last_heartbeat_at in the normalized snapshot for this neuron.
              setSnapshot((prev) => {
                if (!prev) return prev;
                const neuronId = e.neuron_id;
                const nowIso = new Date().toISOString();

                const updatedNeurons = prev.neurons.map((n) => {
                  if (
                    n.descriptor &&
                    (n.descriptor.node_id === neuronId ||
                      n.descriptor.label === neuronId)
                  ) {
                    return {
                      ...n,
                      last_heartbeat_at: nowIso,
                    };
                  }
                  return n;
                });

                return { ...prev, neurons: updatedNeurons };
              });

              // Trigger a heartbeat animation for this neuron by bumping its pulse id.
              const neuronKey = e.neuron_id;
              setHeartbeatAnimIds((prev) => {
                const nextId = (prev[neuronKey] ?? 0) + 1;
                const updated = { ...prev, [neuronKey]: nextId };

                // Let the CSS transition handle a smooth fade in/out while the
                // beating flag is set. Clear it after a few seconds unless a
                // newer heartbeat has arrived.
                const totalMs = 4000;
                window.setTimeout(() => {
                  setHeartbeatAnimIds((current) => {
                    if (current[neuronKey] !== nextId) return current;
                    const { [neuronKey]: _, ...rest } = current;
                    return rest;
                  });
                }, totalMs);

                return updated;
              });
            } else if (e.type === "cortex_shutdown_notice") {
              const now = new Date();
              setShutdownState({
                seenShutdownNotice: true,
                lastReason: e.reason ?? null,
                lastSeenAt: now.toISOString(),
              });
              scheduleReconnectPoll();
            }
          } catch (err) {
            setLastError(
              err instanceof Error
                ? `Failed to parse message: ${err.message}`
                : "Failed to parse message from Cortex",
            );
          }
        };

        ws.onerror = () => {
          // Ignore errors from stale sockets that are no longer current.
          if (wsRef.current !== ws) {
            return;
          }

          setConnectionStatus("error");
          setIsInitialLoading(false);
          setLastError("WebSocket error (see browser console for details)");
        };

        ws.onclose = () => {
          // Ignore closes from stale sockets that are no longer current.
          if (wsRef.current !== ws) {
            return;
          }
          // If we already transitioned to polling because of a shutdown
          // notice, don't override that state; otherwise mark as closed and
          // start polling.
          setConnectionStatus((prev) => {
            if (prev === "polling") {
              return prev;
            }
            return "closed";
          });

          // Whether this was a clean shutdown or an outage, we now treat the
          // endpoint as unreachable until a new connection succeeds.
          setIsInitialLoading(false);
          scheduleReconnectPoll();
        };
      } catch (err) {
        if (cancelled) {
          // eslint-disable-next-line no-console
          console.debug(
            "[Dashboard] connect() caught error after cancel; ignoring",
            err,
          );
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[Dashboard] Failed to open WebSocket", err);
        setConnectionStatus("error");
        setLastError(
          err instanceof Error ? err.message : "Failed to open WebSocket",
        );
        scheduleReconnectPoll();
      }
    };

    // If we are in "connecting" or "open" when this effect first runs, kick
    // off a connection attempt immediately. When a polling timer fires, it
    // will change the status back to "connecting", which re-runs this effect
    // and triggers another attempt.
    if (connectionStatus === "connecting" && !wsRef.current) {
      setIsInitialLoading(true);
      connect();
    }

    return () => {
      cancelled = true;
      clearPollingTimer();
      // Intentionally do not call closeSocket() here to avoid closing a
      // healthy connection during React StrictMode double-invocation.
    };
    // We intentionally *do not* depend on `scheduleReconnectPoll` here to
    // avoid reconnect loops when polling flips the status back to "connecting".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, connectionStatus, clearPollingTimer, closeSocket]);

  /* --------------------------------- Render -------------------------------- */

  const statusVariant = statusBadgeVariant(connectionStatus);

  const neurons = snapshot?.neurons ?? [];

  const isNeuronBeating = (
    descriptor: NeuronDescriptor | undefined | null,
  ): boolean => {
    if (!descriptor) return false;
    const neuronId = descriptor.node_id ?? descriptor.label;
    if (!neuronId) return false;
    return Boolean(heartbeatAnimIds[neuronId]);
  };

  return (
    <main className="app-main container py-4">
      <div className="mb-4">
        <h1 className="h4 mb-2">Helexa Cortex Dashboard</h1>
        <p className="text-muted small mb-0">
          Live view of neurons and control-plane activity from your Cortex node.
        </p>
      </div>

      {/* Connection status */}
      <section className="mb-4">
        <div className="card shadow-sm border-0">
          <div className="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
              <div className="fw-semibold mb-1">Connection</div>
              <div className="small text-muted">
                WebSocket endpoint: <code>{endpoint}</code>
              </div>
              {shutdownState.seenShutdownNotice && (
                <div className="small text-warning mt-1">
                  Planned shutdown observed:{" "}
                  {shutdownState.lastReason || "cortex is shutting down"}
                </div>
              )}
              {connectionStatus === "polling" && (
                <div className="small text-muted mt-1">
                  Cortex appears offline. The dashboard will retry connecting
                  every 60 seconds until it comes back online.
                </div>
              )}
              {!isInitialLoading && lastError && (
                <div className="small text-danger mt-1">{lastError}</div>
              )}
            </div>

            <div className="d-flex align-items-center gap-3">
              <span
                className={`badge text-bg-${statusVariant} text-uppercase small`}
              >
                {connectionStatus}
              </span>
              <label className="form-check form-switch small mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
                <span className="form-check-label">Auto-scroll events</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Layout: snapshot + event log */}
      <div className="row g-4">
        {/* Snapshot / Neuron list */}
        <div className="col-12 col-lg-5">
          <section className="h-100">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-transparent border-0 pb-0">
                <h2 className="h6 mb-1">Neurons snapshot</h2>
                <p className="small text-muted mb-2">
                  Initial state sent by Cortex after the websocket connects.
                </p>
              </div>
              <div className="card-body pt-2">
                {!snapshot && !lastError && (
                  <div className="text-muted small d-flex align-items-center gap-2">
                    <div
                      className="spinner-border spinner-border-sm text-secondary"
                      role="status"
                      aria-hidden="true"
                    />
                    <span>Connecting to Cortex and waiting for snapshot…</span>
                  </div>
                )}
                {!snapshot && lastError && (
                  <div className="text-muted small">Waiting for snapshot…</div>
                )}

                {snapshot && neurons.length === 0 && (
                  <div className="text-muted small">
                    Snapshot received: no neurons registered.
                  </div>
                )}

                {snapshot && neurons.length > 0 && (
                  <div className="list-group small">
                    {neurons.map((n: NormalizedNeuron, idx: number) => {
                      const descriptor = n.descriptor;
                      const label =
                        descriptor.label ??
                        descriptor.node_id ??
                        `Neuron #${idx + 1}`;
                      const backend =
                        (descriptor.metadata &&
                          (descriptor.metadata.backend ||
                            descriptor.metadata.backend_kind)) ||
                        "neuron";

                      return (
                        <div
                          key={`${descriptor.node_id ?? "neuron"}-${idx}`}
                          className="list-group-item list-group-item-action py-2"
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div className="fw-semibold">
                              {label}
                              {n.offline && (
                                <span className="ms-2 badge text-bg-light text-danger">
                                  offline
                                </span>
                              )}
                            </div>
                            <span className="badge text-bg-light text-muted">
                              {backend}
                            </span>
                          </div>

                          <div className="mt-1 text-muted">
                            <div className="text-truncate">
                              <span className="fw-light">node_id: </span>
                              <code className="small">
                                {descriptor.node_id ?? "null"}
                              </code>
                            </div>
                            <div className="text-truncate">
                              <span className="fw-light">health: </span>
                              <span>{n.health}</span>
                            </div>
                            <div className="d-flex align-items-center text-truncate gap-1">
                              <span className="fw-light">last heartbeat: </span>
                              <span>
                                {formatHeartbeatTimestamp(n.last_heartbeat_at)}
                              </span>
                              <span
                                className={
                                  "ms-1 d-inline-flex align-items-center neuron-heartbeat-icon" +
                                  (isNeuronBeating(descriptor)
                                    ? " is-beating"
                                    : "")
                                }
                                aria-hidden={!isNeuronBeating(descriptor)}
                                aria-label={
                                  isNeuronBeating(descriptor)
                                    ? "recent heartbeat"
                                    : undefined
                                }
                                title={
                                  isNeuronBeating(descriptor)
                                    ? "Recent heartbeat"
                                    : undefined
                                }
                              >
                                <FaRegHeart
                                  size={12}
                                  className="neuron-heart-icon outline text-danger"
                                />
                                <FaHeartPulse
                                  size={12}
                                  className="neuron-heart-icon pulse text-danger"
                                />
                              </span>
                            </div>
                          </div>

                          {n.models && n.models.length > 0 && (
                            <details className="mt-2">
                              <summary className="fw-semibold">
                                Models ({n.models.length})
                              </summary>
                              <ul className="mt-1 ps-3 mb-0 small">
                                {n.models.map((m, mi) => (
                                  <li key={`${m.model_id}-${mi}`}>
                                    <code className="me-1">
                                      {m.model_id || "model"}
                                    </code>
                                    <span className="badge text-bg-light text-muted me-1">
                                      {m.effective_status}
                                    </span>
                                    <span className="text-muted">
                                      last cmd: {m.last_cmd_kind}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Event log */}
        <div className="col-12 col-lg-7">
          <section className="h-100 d-flex flex-column">
            <div className="card shadow-sm border-0 flex-fill">
              <div className="card-header bg-transparent border-0 pb-0">
                <h2 className="h6 mb-1">Event stream</h2>
                <p className="small text-muted mb-2">
                  Live events emitted by Cortex after the snapshot: neuron
                  lifecycle, heartbeats, and provisioning flows.
                </p>
              </div>
              <div className="card-body pt-2">
                <div
                  className="border rounded bg-body-tertiary"
                  style={{ maxHeight: "460px", overflowY: "auto" }}
                >
                  {isInitialLoading && (
                    <div className="p-3 text-muted small d-flex align-items-center gap-2">
                      <div
                        className="spinner-border spinner-border-sm text-secondary"
                        role="status"
                        aria-hidden="true"
                      />
                      <span>Waiting for initial messages from Cortex…</span>
                    </div>
                  )}
                  {!isInitialLoading && events.length === 0 && (
                    <div className="p-3 text-muted small">
                      No messages received yet. Check that your Cortex node is
                      running with <code>--dashboard-socket</code> and that the{" "}
                      <code>cortex_ws_endpoint</code> in <code>config.js</code>{" "}
                      is correct.
                    </div>
                  )}

                  {events.map((item) => (
                    <div
                      key={item.id}
                      className="border-bottom px-3 py-2 small"
                    >
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="text-muted">{item.receivedAt}</span>
                          <span className="badge text-bg-light text-muted text-uppercase">
                            {item.kind}
                          </span>
                          <span className="badge text-bg-secondary text-uppercase">
                            {item.eventType}
                          </span>
                        </div>
                      </div>
                      <div className="text-truncate mb-1">
                        {describeEvent(item.payload)}
                      </div>
                      <pre className="mb-0 small text-body bg-transparent rounded-1">
                        {JSON.stringify(item.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default Dashboard;
