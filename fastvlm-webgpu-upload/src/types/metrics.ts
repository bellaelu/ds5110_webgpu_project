/** Per-frame timing breakdown from a single inference pass (milliseconds). */
export type InferenceLatencySample = {
  frameCaptureMs: number;
  preprocessMs: number;
  generationMs: number;
  /** Time until the first streamed token; null if generation produced no tokens. */
  timeToFirstTokenMs: number | null;
  totalMs: number;
  timestamp: number;
};

export type InferenceResult = {
  caption: string;
  skipped: boolean;
  latency?: InferenceLatencySample;
};

/** Rolling aggregates over completed (non-skipped) inferences. */
export type LatencyStats = {
  sampleCount: number;
  skippedCount: number;
  last: InferenceLatencySample | null;
  avgTotalMs: number;
  avgTimeToFirstTokenMs: number | null;
  minTotalMs: number;
  maxTotalMs: number;
};

export const EMPTY_LATENCY_STATS: LatencyStats = {
  sampleCount: 0,
  skippedCount: 0,
  last: null,
  avgTotalMs: 0,
  avgTimeToFirstTokenMs: null,
  minTotalMs: 0,
  maxTotalMs: 0,
};

export type MemorySnapshot = {
  supported: boolean;
  usedMB: number | null;
  totalMB: number | null;
  limitMB: number | null;
  /** `navigator.deviceMemory` when exposed by the browser (rough device RAM tier). */
  deviceMemoryGB: number | undefined;
  timestamp: number;
};

export type MemoryStats = {
  current: MemorySnapshot;
  peakUsedMB: number | null;
  baselineUsedMB: number | null;
  deltaFromBaselineMB: number | null;
};

export type FrameSamplingStats = {
  /** How often the capture loop runs (includes skipped / idle ticks). */
  loopRateHz: number;
  /** Completed inferences per second (rolling window). */
  inferenceRateHz: number;
  /** Skipped frames per second (inference still running). */
  skipRateHz: number;
  avgLoopPeriodMs: number | null;
  configuredCaptureDelayMs: number;
  totalLoopTicks: number;
  totalCompleted: number;
  totalSkipped: number;
  skipRatio: number;
  /** Upper bound from mean latency: 1000 / avgTotalMs. Set when latency samples exist. */
  theoreticalMaxInferenceHz: number | null;
};

export type PerformanceStats = {
  latency: LatencyStats;
  sampling: FrameSamplingStats;
  memory: MemoryStats;
};
