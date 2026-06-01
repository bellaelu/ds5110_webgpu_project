import type { InferenceLatencySample, PerformanceStats } from "./metrics";

export const BENCHMARK_SCHEMA_VERSION = 1 as const;

export type VideoSourceType = "file" | "camera" | "display";

export type BrowserInfo = {
  label: string;
  name: string;
  version: string;
  os: string;
  userAgent: string;
  webgpuSupported: boolean;
  webgpuAdapter: string | null;
  memoryApiSupported: boolean;
};

export type BenchmarkLatencySummary = {
  sampleCount: number;
  skippedCount: number;
  avgTotalMs: number;
  avgTimeToFirstTokenMs: number | null;
  minTotalMs: number;
  maxTotalMs: number;
  p50TotalMs: number;
  p95TotalMs: number;
  avgPreprocessMs: number;
  avgGenerationMs: number;
};

export type BenchmarkSamplingSummary = {
  /** Rolling-window rate at end of session. */
  inferenceRateHz: number;
  /** Completed inferences / session duration (fair cross-browser comparison). */
  sessionInferenceRateHz: number;
  loopRateHz: number;
  skipRateHz: number;
  skipRatio: number;
  totalCompleted: number;
  totalSkipped: number;
  avgLoopPeriodMs: number | null;
  theoreticalMaxInferenceHz: number | null;
};

export type BenchmarkMemorySummary = {
  peakUsedMB: number | null;
  avgUsedMB: number | null;
  endUsedMB: number | null;
  baselineUsedMB: number | null;
  deltaFromBaselineMB: number | null;
  limitMB: number | null;
  memoryApiSupported: boolean;
};

export type BenchmarkSummary = {
  latency: BenchmarkLatencySummary;
  sampling: BenchmarkSamplingSummary;
  memory: BenchmarkMemorySummary;
};

export type BenchmarkSnapshot = {
  elapsedMs: number;
  stats: PerformanceStats;
};

/** Exported after a benchmark run — import several to compare browsers. */
export type BenchmarkSession = {
  schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  id: string;
  label: string;
  recordedAt: string;
  durationMs: number;
  videoFileName: string | null;
  videoSourceType: VideoSourceType;
  prompt: string;
  browser: BrowserInfo;
  snapshots: BenchmarkSnapshot[];
  /** Full per-inference latency rows (for reproducibility / custom analysis). */
  latencySamples: InferenceLatencySample[];
  summary: BenchmarkSummary;
};

export type BenchmarkComparisonRow = {
  session: BenchmarkSession;
  metrics: {
    avgLatencyMs: number;
    p95LatencyMs: number;
    inferenceRateHz: number;
    skipRatioPercent: number;
    peakMemoryMB: number | null;
    sampleCount: number;
  };
};
