import type { FrameSamplingStats } from "../types/metrics";
import { TIMING } from "../constants";

const MAX_EVENTS = 500;
const RATE_WINDOW_MS = 10_000;

export type SamplingHistory = {
  loopTickTimestamps: number[];
  completedTimestamps: number[];
  skippedTimestamps: number[];
  loopPeriodMsSamples: number[];
};

export const EMPTY_SAMPLING_HISTORY: SamplingHistory = {
  loopTickTimestamps: [],
  completedTimestamps: [],
  skippedTimestamps: [],
  loopPeriodMsSamples: [],
};

function trimTimestamps(timestamps: number[]): number[] {
  const cutoff = performance.now() - RATE_WINDOW_MS * 2;
  const trimmed = timestamps.filter((t) => t >= cutoff);
  return trimmed.slice(-MAX_EVENTS);
}

/** Events per second within the rolling window. */
function eventRatePerSecond(timestamps: number[]): number {
  const now = performance.now();
  const cutoff = now - RATE_WINDOW_MS;
  const recent = timestamps.filter((t) => t >= cutoff);
  if (recent.length === 0) return 0;
  return (recent.length / RATE_WINDOW_MS) * 1000;
}

export function recordLoopTick(
  prev: SamplingHistory,
  loopPeriodMs: number | null,
): SamplingHistory {
  const now = performance.now();
  const loopPeriodMsSamples =
    loopPeriodMs !== null ? [...prev.loopPeriodMsSamples, loopPeriodMs].slice(-MAX_EVENTS) : prev.loopPeriodMsSamples;

  return {
    ...prev,
    loopTickTimestamps: trimTimestamps([...prev.loopTickTimestamps, now]),
    loopPeriodMsSamples,
  };
}

export function recordInferenceAttempt(
  prev: SamplingHistory,
  skipped: boolean,
): SamplingHistory {
  const now = performance.now();
  if (skipped) {
    return {
      ...prev,
      skippedTimestamps: trimTimestamps([...prev.skippedTimestamps, now]),
    };
  }
  return {
    ...prev,
    completedTimestamps: trimTimestamps([...prev.completedTimestamps, now]),
  };
}

export function computeFrameSamplingStats(history: SamplingHistory): FrameSamplingStats {
  const loopRate = eventRatePerSecond(history.loopTickTimestamps);
  const inferenceRate = eventRatePerSecond(history.completedTimestamps);
  const skipRate = eventRatePerSecond(history.skippedTimestamps);

  const periods = history.loopPeriodMsSamples;
  const avgLoopPeriodMs =
    periods.length > 0 ? periods.reduce((a, b) => a + b, 0) / periods.length : null;

  const totalCompleted = history.completedTimestamps.length;
  const totalSkipped = history.skippedTimestamps.length;
  const totalAttempts = totalCompleted + totalSkipped;

  return {
    loopRateHz: loopRate,
    inferenceRateHz: inferenceRate,
    skipRateHz: skipRate,
    avgLoopPeriodMs,
    configuredCaptureDelayMs: TIMING.FRAME_CAPTURE_DELAY,
    totalLoopTicks: history.loopTickTimestamps.length,
    totalCompleted,
    totalSkipped,
    skipRatio: totalAttempts > 0 ? totalSkipped / totalAttempts : 0,
    theoreticalMaxInferenceHz: null,
  };
}
