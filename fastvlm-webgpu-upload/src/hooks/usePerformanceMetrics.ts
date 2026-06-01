import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { InferenceLatencySample, MemoryStats, PerformanceStats } from "../types/metrics";
import { computeLatencyStats, recordLatencySample } from "../utils/latencyStats";
import {
  computeFrameSamplingStats,
  EMPTY_SAMPLING_HISTORY,
  recordInferenceAttempt,
  recordLoopTick,
  type SamplingHistory,
} from "../utils/frameSamplingStats";
import { readMemorySnapshot } from "../utils/memoryMonitor";

const MEMORY_POLL_MS = 2_000;

function buildMemoryStats(
  current: ReturnType<typeof readMemorySnapshot>,
  peakUsedMB: number | null,
  baselineUsedMB: number | null,
): MemoryStats {
  const delta =
    current.usedMB !== null && baselineUsedMB !== null ? current.usedMB - baselineUsedMB : null;

  return { current, peakUsedMB, baselineUsedMB, deltaFromBaselineMB: delta };
}

export function usePerformanceMetrics(isActive: boolean) {
  const [latencyHistory, setLatencyHistory] = useState<{
    samples: InferenceLatencySample[];
    skippedCount: number;
  }>({ samples: [], skippedCount: 0 });

  const [samplingHistory, setSamplingHistory] = useState<SamplingHistory>(EMPTY_SAMPLING_HISTORY);

  const [memorySnapshot, setMemorySnapshot] = useState(() => readMemorySnapshot());
  const [memoryState, setMemoryState] = useState<{
    peakUsedMB: number | null;
    baselineUsedMB: number | null;
  }>({ peakUsedMB: null, baselineUsedMB: null });

  const baselineCapturedRef = useRef(false);

  const refreshMemory = useCallback((captureBaseline = false) => {
    const snap = readMemorySnapshot();
    setMemorySnapshot(snap);
    setMemoryState((prev) => {
      let baseline = prev.baselineUsedMB;
      if (captureBaseline && !baselineCapturedRef.current && snap.usedMB !== null) {
        baseline = snap.usedMB;
        baselineCapturedRef.current = true;
      }
      const peak =
        snap.usedMB !== null
          ? Math.max(prev.peakUsedMB ?? snap.usedMB, snap.usedMB)
          : prev.peakUsedMB;

      return { peakUsedMB: peak, baselineUsedMB: baseline };
    });
    return snap;
  }, []);

  useEffect(() => {
    if (!isActive) return;

    refreshMemory(true);
    const id = setInterval(() => refreshMemory(false), MEMORY_POLL_MS);
    return () => clearInterval(id);
  }, [isActive, refreshMemory]);

  const onLoopTick = useCallback((loopPeriodMs: number | null) => {
    setSamplingHistory((prev) => recordLoopTick(prev, loopPeriodMs));
  }, []);

  const onInferenceEvent = useCallback((sample: InferenceLatencySample | null, skipped: boolean) => {
    setLatencyHistory((prev) => recordLatencySample(prev, sample, skipped));
    setSamplingHistory((prev) => recordInferenceAttempt(prev, skipped));
    if (!skipped) refreshMemory(false);
  }, [refreshMemory]);

  const stats: PerformanceStats = useMemo(() => {
    const latency = computeLatencyStats(latencyHistory.samples, latencyHistory.skippedCount);
    const sampling = {
      ...computeFrameSamplingStats(samplingHistory),
      theoreticalMaxInferenceHz: latency.avgTotalMs > 0 ? 1000 / latency.avgTotalMs : null,
    };
    const memory = buildMemoryStats(memorySnapshot, memoryState.peakUsedMB, memoryState.baselineUsedMB);

    return { latency, sampling, memory };
  }, [latencyHistory, samplingHistory, memoryState, memorySnapshot]);

  return { stats, onLoopTick, onInferenceEvent };
}

export function formatHz(hz: number, digits = 2): string {
  return `${hz.toFixed(digits)} /s`;
}
