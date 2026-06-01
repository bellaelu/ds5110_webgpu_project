import type { InferenceLatencySample } from "../types/metrics";
import type {
  BenchmarkComparisonRow,
  BenchmarkLatencySummary,
  BenchmarkMemorySummary,
  BenchmarkSamplingSummary,
  BenchmarkSession,
  BenchmarkSummary,
  VideoSourceType,
} from "../types/benchmark";
import { BENCHMARK_SCHEMA_VERSION } from "../types/benchmark";
import type { BrowserInfo } from "../types/benchmark";
import { computeFrameSamplingStats, type SamplingHistory } from "./frameSamplingStats";

const STORAGE_KEY = "fastvlm-benchmark-sessions";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

export function buildLatencySummary(
  samples: InferenceLatencySample[],
  skippedCount: number,
): BenchmarkLatencySummary {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      skippedCount,
      avgTotalMs: 0,
      avgTimeToFirstTokenMs: null,
      minTotalMs: 0,
      maxTotalMs: 0,
      p50TotalMs: 0,
      p95TotalMs: 0,
      avgPreprocessMs: 0,
      avgGenerationMs: 0,
    };
  }

  const totals = samples.map((s) => s.totalMs).sort((a, b) => a - b);
  const ttfts = samples.map((s) => s.timeToFirstTokenMs).filter((t): t is number => t !== null);
  const n = samples.length;

  return {
    sampleCount: n,
    skippedCount,
    avgTotalMs: totals.reduce((a, b) => a + b, 0) / n,
    avgTimeToFirstTokenMs: ttfts.length > 0 ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : null,
    minTotalMs: totals[0]!,
    maxTotalMs: totals[totals.length - 1]!,
    p50TotalMs: percentile(totals, 50),
    p95TotalMs: percentile(totals, 95),
    avgPreprocessMs: samples.reduce((a, s) => a + s.preprocessMs, 0) / n,
    avgGenerationMs: samples.reduce((a, s) => a + s.generationMs, 0) / n,
  };
}

export function buildSamplingSummary(
  samplingHistory: SamplingHistory,
  avgTotalMs: number,
  durationMs: number,
): BenchmarkSamplingSummary {
  const sampling = {
    ...computeFrameSamplingStats(samplingHistory),
    theoreticalMaxInferenceHz: avgTotalMs > 0 ? 1000 / avgTotalMs : null,
  };

  const durationSec = durationMs / 1000;
  const sessionInferenceRateHz =
    durationSec > 0 ? sampling.totalCompleted / durationSec : 0;

  return {
    inferenceRateHz: sampling.inferenceRateHz,
    sessionInferenceRateHz,
    loopRateHz: sampling.loopRateHz,
    skipRateHz: sampling.skipRateHz,
    skipRatio: sampling.skipRatio,
    totalCompleted: sampling.totalCompleted,
    totalSkipped: sampling.totalSkipped,
    avgLoopPeriodMs: sampling.avgLoopPeriodMs,
    theoreticalMaxInferenceHz: sampling.theoreticalMaxInferenceHz,
  };
}

export function buildMemorySummary(
  memoryUsedSamples: number[],
  peakUsedMB: number | null,
  baselineUsedMB: number | null,
  endUsedMB: number | null,
  limitMB: number | null,
  memoryApiSupported: boolean,
): BenchmarkMemorySummary {
  const avgUsedMB =
    memoryUsedSamples.length > 0
      ? memoryUsedSamples.reduce((a, b) => a + b, 0) / memoryUsedSamples.length
      : null;

  const delta =
    endUsedMB !== null && baselineUsedMB !== null ? endUsedMB - baselineUsedMB : null;

  return {
    peakUsedMB,
    avgUsedMB,
    endUsedMB,
    baselineUsedMB,
    deltaFromBaselineMB: delta,
    limitMB,
    memoryApiSupported,
  };
}

export function buildBenchmarkSummary(
  latencySamples: InferenceLatencySample[],
  skippedCount: number,
  samplingHistory: SamplingHistory,
  memoryUsedSamples: number[],
  peakUsedMB: number | null,
  baselineUsedMB: number | null,
  endUsedMB: number | null,
  limitMB: number | null,
  memoryApiSupported: boolean,
  durationMs: number,
): BenchmarkSummary {
  const latency = buildLatencySummary(latencySamples, skippedCount);
  const sampling = buildSamplingSummary(samplingHistory, latency.avgTotalMs, durationMs);
  const memory = buildMemorySummary(
    memoryUsedSamples,
    peakUsedMB,
    baselineUsedMB,
    endUsedMB,
    limitMB,
    memoryApiSupported,
  );

  return { latency, sampling, memory };
}

export function createBenchmarkSession(params: {
  label: string;
  durationMs: number;
  videoFileName: string | null;
  videoSourceType: VideoSourceType;
  prompt: string;
  browser: BrowserInfo;
  snapshots: BenchmarkSession["snapshots"];
  latencySamples: InferenceLatencySample[];
  skippedCount: number;
  samplingHistory: SamplingHistory;
  memoryUsedSamples: number[];
  peakUsedMB: number | null;
  baselineUsedMB: number | null;
  endUsedMB: number | null;
  limitMB: number | null;
}): BenchmarkSession {
  const summary = buildBenchmarkSummary(
    params.latencySamples,
    params.skippedCount,
    params.samplingHistory,
    params.memoryUsedSamples,
    params.peakUsedMB,
    params.baselineUsedMB,
    params.endUsedMB,
    params.limitMB,
    params.browser.memoryApiSupported,
    params.durationMs,
  );

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    label: params.label,
    recordedAt: new Date().toISOString(),
    durationMs: params.durationMs,
    videoFileName: params.videoFileName,
    videoSourceType: params.videoSourceType,
    prompt: params.prompt,
    browser: params.browser,
    snapshots: params.snapshots,
    latencySamples: params.latencySamples,
    summary,
  };
}

export function downloadBenchmarkSession(session: BenchmarkSession): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const safeName = session.label.replace(/[^\w.-]+/g, "_").slice(0, 40);
  const date = session.recordedAt.slice(0, 10);
  const filename = `fastvlm-benchmark_${safeName}_${date}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBenchmarkSessionFile(json: unknown): BenchmarkSession {
  if (!json || typeof json !== "object") {
    throw new Error("Invalid file: expected a JSON object");
  }
  const s = json as BenchmarkSession;
  if (s.schemaVersion !== BENCHMARK_SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${String((s as BenchmarkSession).schemaVersion)}`);
  }
  if (!s.summary?.latency || !s.browser?.name) {
    throw new Error("Invalid benchmark file: missing required fields");
  }
  return s;
}

export function loadStoredSessions(): BenchmarkSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        try {
          return parseBenchmarkSessionFile(item);
        } catch {
          return null;
        }
      })
      .filter((s): s is BenchmarkSession => s !== null);
  } catch {
    return [];
  }
}

export function saveSessionToStorage(session: BenchmarkSession): void {
  const existing = loadStoredSessions();
  const next = [...existing.filter((s) => s.id !== session.id), session].slice(-20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function removeStoredSession(id: string): void {
  const next = loadStoredSessions().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function toComparisonRows(sessions: BenchmarkSession[]): BenchmarkComparisonRow[] {
  return sessions.map((session) => ({
    session,
    metrics: {
      avgLatencyMs: session.summary.latency.avgTotalMs,
      p95LatencyMs: session.summary.latency.p95TotalMs,
      inferenceRateHz: session.summary.sampling.sessionInferenceRateHz,
      skipRatioPercent: session.summary.sampling.skipRatio * 100,
      peakMemoryMB: session.summary.memory.peakUsedMB,
      sampleCount: session.summary.latency.sampleCount,
    },
  }));
}

export function downloadComparisonCsv(sessions: BenchmarkSession[]): void {
  const headers = [
    "Label",
    "Browser",
    "OS",
    "WebGPU",
    "Video",
    "Duration (s)",
    "Samples",
    "Avg latency (ms)",
    "P95 latency (ms)",
    "Avg TTFT (ms)",
    "Session inference rate (/s)",
    "Rolling inference rate (/s)",
    "Skip %",
    "Peak memory (MB)",
    "Avg memory (MB)",
  ];

  const rows = sessions.map((s) => [
    s.label,
    `${s.browser.name} ${s.browser.version}`,
    s.browser.os,
    s.browser.webgpuSupported ? "yes" : "no",
    s.videoFileName ?? "",
    (s.durationMs / 1000).toFixed(1),
    String(s.summary.latency.sampleCount),
    s.summary.latency.avgTotalMs.toFixed(0),
    s.summary.latency.p95TotalMs.toFixed(0),
    s.summary.latency.avgTimeToFirstTokenMs?.toFixed(0) ?? "",
    s.summary.sampling.sessionInferenceRateHz.toFixed(3),
    s.summary.sampling.inferenceRateHz.toFixed(3),
    (s.summary.sampling.skipRatio * 100).toFixed(1),
    s.summary.memory.peakUsedMB?.toFixed(1) ?? "",
    s.summary.memory.avgUsedMB?.toFixed(1) ?? "",
  ]);

  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fastvlm-browser-comparison_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pick the best value per metric for highlighting (lower latency / skip, higher inference). */
export function bestIndices(rows: BenchmarkComparisonRow[]): {
  avgLatency: number | null;
  p95Latency: number | null;
  inferenceRate: number | null;
  peakMemory: number | null;
} {
  if (rows.length === 0) {
    return { avgLatency: null, p95Latency: null, inferenceRate: null, peakMemory: null };
  }

  const minIdx = (vals: (number | null)[], lowerIsBetter: boolean) => {
    let best: number | null = null;
    let bestI: number | null = null;
    vals.forEach((v, i) => {
      if (v === null) return;
      if (best === null || (lowerIsBetter ? v < best : v > best)) {
        best = v;
        bestI = i;
      }
    });
    return bestI;
  };

  return {
    avgLatency: minIdx(
      rows.map((r) => r.metrics.avgLatencyMs),
      true,
    ),
    p95Latency: minIdx(
      rows.map((r) => r.metrics.p95LatencyMs),
      true,
    ),
    inferenceRate: minIdx(
      rows.map((r) => r.metrics.inferenceRateHz),
      false,
    ),
    peakMemory: minIdx(
      rows.map((r) => r.metrics.peakMemoryMB),
      true,
    ),
  };
}
