import { randomUUID } from "node:crypto";

/**
 * Structured logging + in-process metrics (PRD NFR-01, NFR-02, NFR-07, NFR-09).
 *
 * One JSON object per line on stdout so the host can ship it anywhere. Every
 * entry carries a `request_id` and, where the caller has one, an
 * `execution_id` — NFR-09 requires "every execution traceable by
 * execution_id", which means the id must appear on log lines, not just in the
 * database.
 *
 * Secret-bearing fields are redacted rather than trusted to callers: a logger
 * must never become a credential leak channel.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

const REDACTED = "[redacted]";
const SENSITIVE_KEY = /(token|secret|password|privatekey|private_key|authorization|cookie|signature)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

function emit(level: LogLevel, base: LogContext, message: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(redact({ ...base, ...(context ?? {}) }) as Record<string, unknown>),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(base: LogContext = {}): Logger {
  return {
    debug: (message, context) => emit("debug", base, message, context),
    info: (message, context) => emit("info", base, message, context),
    warn: (message, context) => emit("warn", base, message, context),
    error: (message, context) => emit("error", base, message, context),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

export const logger = createLogger({ service: "kairos-api" });

export function newRequestId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Metrics: bounded, in-process, good enough for NFR probes on one node.
// ---------------------------------------------------------------------------

const MAX_SAMPLES = 2000;
const startedAt = Date.now();

interface LatencySeries {
  count: number;
  totalMs: number;
  maxMs: number;
  samples: number[];
}

function newSeries(): LatencySeries {
  return { count: 0, totalMs: 0, maxMs: 0, samples: [] };
}

function observe(series: LatencySeries, durationMs: number): void {
  series.count += 1;
  series.totalMs += durationMs;
  series.maxMs = Math.max(series.maxMs, durationMs);
  series.samples.push(durationMs);
  if (series.samples.length > MAX_SAMPLES) series.samples.shift();
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
}

function summarise(series: LatencySeries) {
  return {
    count: series.count,
    avgMs: series.count === 0 ? 0 : Number((series.totalMs / series.count).toFixed(2)),
    p50Ms: percentile(series.samples, 50),
    p95Ms: percentile(series.samples, 95),
    maxMs: Number(series.maxMs.toFixed(2)),
  };
}

interface RouteMetric {
  method: string;
  route: string;
  count: number;
  errorCount: number;
  latency: LatencySeries;
}

const routes = new Map<string, RouteMetric>();
const prepareLatency = newSeries();
const legTerminalLatency = newSeries();
const counters = new Map<string, number>();

/** Record one completed HTTP request. `route` should be the matched pattern. */
export function recordRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number
): void {
  const key = `${method.toUpperCase()} ${route}`;
  const metric = routes.get(key) ?? { method: method.toUpperCase(), route, count: 0, errorCount: 0, latency: newSeries() };
  metric.count += 1;
  if (statusCode >= 400) metric.errorCount += 1;
  observe(metric.latency, durationMs);
  routes.set(key, metric);
  increment(statusCode >= 500 ? "http_5xx" : statusCode >= 400 ? "http_4xx" : "http_2xx");
}

/** NFR-01: prepare latency, accepted request → response. */
export function recordPrepareLatency(durationMs: number): void {
  observe(prepareLatency, durationMs);
}

/** NFR-07: time from leg submit to a terminal leg state. */
export function recordLegTerminalLatency(durationMs: number): void {
  observe(legTerminalLatency, durationMs);
}

export function increment(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function snapshotMetrics() {
  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeMs: Date.now() - startedAt,
    counters: Object.fromEntries([...counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
    nfr: {
      prepareLatencyMs: summarise(prepareLatency),
      legTerminalLatencyMs: summarise(legTerminalLatency),
    },
    routes: [...routes.values()]
      .map((metric) => ({
        ...summarise(metric.latency),
        method: metric.method,
        route: metric.route,
        errorCount: metric.errorCount,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Test hook: drop all metric state. */
export function resetMetrics(): void {
  routes.clear();
  counters.clear();
  prepareLatency.count = 0;
  prepareLatency.totalMs = 0;
  prepareLatency.maxMs = 0;
  prepareLatency.samples.length = 0;
  legTerminalLatency.count = 0;
  legTerminalLatency.totalMs = 0;
  legTerminalLatency.maxMs = 0;
  legTerminalLatency.samples.length = 0;
}
