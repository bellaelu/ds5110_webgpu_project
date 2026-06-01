import { useState, useRef, useCallback, useEffect } from "react";
import type { BenchmarkSession, BrowserInfo, VideoSourceType } from "../types/benchmark";
import type { InferenceLatencySample, PerformanceStats } from "../types/metrics";
import { BENCHMARK } from "../constants";
import { collectBrowserInfo } from "../utils/browserInfo";
import {
  createBenchmarkSession,
  downloadBenchmarkSession,
  saveSessionToStorage,
} from "../utils/benchmarkSession";
import {
  EMPTY_SAMPLING_HISTORY,
  recordInferenceAttempt,
  recordLoopTick as appendLoopTick,
  type SamplingHistory,
} from "../utils/frameSamplingStats";
import { readMemorySnapshot } from "../utils/memoryMonitor";

type RecorderAccum = {
  label: string;
  latencySamples: InferenceLatencySample[];
  skippedCount: number;
  samplingHistory: SamplingHistory;
  snapshots: BenchmarkSession["snapshots"];
  memoryUsedSamples: number[];
  peakUsedMB: number | null;
  baselineUsedMB: number | null;
};

export type BenchmarkRecorderStatus = "idle" | "recording" | "completed";

export function useBenchmarkRecorder(options: {
  videoFileName: string | null;
  videoSourceType: VideoSourceType;
  prompt: string;
  getStats: () => PerformanceStats;
  onRecordingStart?: () => void;
}) {
  const [status, setStatus] = useState<BenchmarkRecorderStatus>("idle");
  const [completedSession, setCompletedSession] = useState<BenchmarkSession | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [browserInfo, setBrowserInfo] = useState<BrowserInfo | null>(null);
  const [durationSec, setDurationSec] = useState<number>(BENCHMARK.DEFAULT_DURATION_SEC);
  const [customLabel, setCustomLabel] = useState("");

  const statusRef = useRef(status);
  statusRef.current = status;

  const accumRef = useRef<RecorderAccum | null>(null);
  const browserRef = useRef<BrowserInfo | null>(null);
  const startTimeRef = useRef(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const getStatsRef = useRef(options.getStats);
  getStatsRef.current = options.getStats;

  useEffect(() => {
    collectBrowserInfo().then(setBrowserInfo);
  }, []);

  const finalizeSession = useCallback(() => {
    const accum = accumRef.current;
    const browser = browserRef.current;
    if (!accum || !browser) return null;

    const durationMs = Math.max(0, performance.now() - startTimeRef.current);
    const endMem = readMemorySnapshot();

    const session = createBenchmarkSession({
      label: accum.label,
      durationMs,
      videoFileName: options.videoFileName,
      videoSourceType: options.videoSourceType,
      prompt: options.prompt,
      browser,
      snapshots: accum.snapshots,
      latencySamples: accum.latencySamples,
      skippedCount: accum.skippedCount,
      samplingHistory: accum.samplingHistory,
      memoryUsedSamples: accum.memoryUsedSamples,
      peakUsedMB: accum.peakUsedMB,
      baselineUsedMB: accum.baselineUsedMB,
      endUsedMB: endMem.usedMB,
      limitMB: endMem.limitMB,
    });

    return session;
  }, [options.videoFileName, options.videoSourceType, options.prompt]);

  const stopRecording = useCallback(() => {
    if (statusRef.current !== "recording") return;

    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }

    const session = finalizeSession();
    if (session) {
      saveSessionToStorage(session);
      setCompletedSession(session);
      console.info("[FastVLM benchmark] Session saved:", session);
    }

    accumRef.current = null;
    setStatus("completed");
    setElapsedMs(performance.now() - startTimeRef.current);
  }, [finalizeSession]);

  const startRecording = useCallback(async () => {
    const browser = await collectBrowserInfo();
    browserRef.current = browser;
    setBrowserInfo(browser);

    const label = customLabel.trim() || browser.label;
    accumRef.current = {
      label,
      latencySamples: [],
      skippedCount: 0,
      samplingHistory: { ...EMPTY_SAMPLING_HISTORY },
      snapshots: [],
      memoryUsedSamples: [],
      peakUsedMB: null,
      baselineUsedMB: null,
    };

    const baseline = readMemorySnapshot();
    if (baseline.usedMB !== null) {
      accumRef.current.baselineUsedMB = baseline.usedMB;
      accumRef.current.memoryUsedSamples.push(baseline.usedMB);
    }

    startTimeRef.current = performance.now();
    setCompletedSession(null);
    setElapsedMs(0);
    setStatus("recording");
    options.onRecordingStart?.();

    tickIntervalRef.current = setInterval(() => {
      if (statusRef.current !== "recording" || !accumRef.current) return;

      const elapsed = performance.now() - startTimeRef.current;
      setElapsedMs(elapsed);

      const mem = readMemorySnapshot();
      if (mem.usedMB !== null) {
        accumRef.current.memoryUsedSamples.push(mem.usedMB);
        accumRef.current.peakUsedMB = Math.max(accumRef.current.peakUsedMB ?? mem.usedMB, mem.usedMB);
      }

      accumRef.current.snapshots.push({
        elapsedMs: elapsed,
        stats: structuredClone(getStatsRef.current()),
      });

      if (elapsed >= durationSec * 1000) {
        stopRecording();
      }
    }, BENCHMARK.SNAPSHOT_INTERVAL_MS);
  }, [customLabel, durationSec, options, stopRecording]);

  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, []);

  const resetRecorder = useCallback(() => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    accumRef.current = null;
    setStatus("idle");
    setCompletedSession(null);
    setElapsedMs(0);
  }, []);

  const recordLoopTick = useCallback((loopPeriodMs: number | null) => {
    if (statusRef.current !== "recording" || !accumRef.current) return;
    accumRef.current.samplingHistory = appendLoopTick(accumRef.current.samplingHistory, loopPeriodMs);
  }, []);

  const recordInference = useCallback((sample: InferenceLatencySample | null, skipped: boolean) => {
    if (statusRef.current !== "recording" || !accumRef.current) return;

    if (skipped) {
      accumRef.current.skippedCount += 1;
      accumRef.current.samplingHistory = recordInferenceAttempt(accumRef.current.samplingHistory, true);
      return;
    }

    if (sample) {
      accumRef.current.latencySamples.push(sample);
    }
    accumRef.current.samplingHistory = recordInferenceAttempt(accumRef.current.samplingHistory, false);

    const mem = readMemorySnapshot();
    if (mem.usedMB !== null) {
      accumRef.current.memoryUsedSamples.push(mem.usedMB);
      accumRef.current.peakUsedMB = Math.max(accumRef.current.peakUsedMB ?? mem.usedMB, mem.usedMB);
    }
  }, []);

  const exportSession = useCallback(() => {
    if (completedSession) downloadBenchmarkSession(completedSession);
  }, [completedSession]);

  return {
    status,
    elapsedMs,
    durationSec,
    setDurationSec,
    browserInfo,
    customLabel,
    setCustomLabel,
    completedSession,
    startRecording,
    stopRecording,
    resetRecorder,
    exportSession,
    recordLoopTick,
    recordInference,
    isRecording: status === "recording",
  };
}
