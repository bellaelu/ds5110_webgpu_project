import type { InferenceLatencySample, LatencyStats } from "../types/metrics";
import { EMPTY_LATENCY_STATS } from "../types/metrics";

const MAX_SAMPLES = 100;

export function recordLatencySample(
  prev: { samples: InferenceLatencySample[]; skippedCount: number },
  sample: InferenceLatencySample | null,
  skipped: boolean,
): { samples: InferenceLatencySample[]; skippedCount: number } {
  if (skipped) {
    return { ...prev, skippedCount: prev.skippedCount + 1 };
  }
  if (!sample) return prev;

  const samples = [...prev.samples, sample].slice(-MAX_SAMPLES);
  return { samples, skippedCount: prev.skippedCount };
}

export function computeLatencyStats(samples: InferenceLatencySample[], skippedCount: number): LatencyStats {
  if (samples.length === 0) {
    return { ...EMPTY_LATENCY_STATS, skippedCount };
  }

  const totals = samples.map((s) => s.totalMs);
  const ttfts = samples
    .map((s) => s.timeToFirstTokenMs)
    .filter((t): t is number => t !== null);

  const sumTotal = totals.reduce((a, b) => a + b, 0);

  return {
    sampleCount: samples.length,
    skippedCount,
    last: samples[samples.length - 1] ?? null,
    avgTotalMs: sumTotal / samples.length,
    avgTimeToFirstTokenMs: ttfts.length > 0 ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : null,
    minTotalMs: Math.min(...totals),
    maxTotalMs: Math.max(...totals),
  };
}

export function formatMs(ms: number | null | undefined, digits = 0): string {
  if (ms === null || ms === undefined) return "—";
  return `${ms.toFixed(digits)} ms`;
}
