import { useEffect } from "react";
import GlassContainer from "./GlassContainer";
import GlassButton from "./GlassButton";
import { GLASS_EFFECTS } from "../constants";
import type { BenchmarkRecorderStatus } from "../hooks/useBenchmarkRecorder";
import type { BrowserInfo } from "../types/benchmark";
import type { BenchmarkSession } from "../types/benchmark";
import { formatMs } from "../utils/latencyStats";
import { formatMB } from "../utils/memoryMonitor";

interface BenchmarkPanelProps {
  status: BenchmarkRecorderStatus;
  elapsedMs: number;
  durationSec: number;
  onDurationSecChange: (sec: number) => void;
  customLabel: string;
  onCustomLabelChange: (label: string) => void;
  browserInfo: BrowserInfo | null;
  videoFileName: string | null;
  completedSession: BenchmarkSession | null;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onExport: () => void;
  onOpenCompare: () => void;
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

export default function BenchmarkPanel({
  status,
  elapsedMs,
  durationSec,
  onDurationSecChange,
  customLabel,
  onCustomLabelChange,
  browserInfo,
  videoFileName,
  completedSession,
  onStart,
  onStop,
  onReset,
  onExport,
  onOpenCompare,
}: BenchmarkPanelProps) {
  useEffect(() => {
    if (browserInfo) {
      console.info("[FastVLM benchmark] Browser:", browserInfo);
    }
  }, [browserInfo]);

  const progress = durationSec > 0 ? Math.min(100, (elapsedMs / (durationSec * 1000)) * 100) : 0;

  return (
    <GlassContainer
      bgColor={GLASS_EFFECTS.COLORS.BUTTON_BG}
      className="w-80 rounded-2xl shadow-2xl"
    >
      <div className="p-4 text-white space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Browser benchmark</h3>
          {status === "recording" && (
            <span className="text-xs text-red-300 animate-pulse font-medium">REC</span>
          )}
        </div>

        <p className="text-[11px] opacity-75 leading-relaxed">
          Upload the same video in each browser, run a timed benchmark, export JSON, then compare results.
        </p>

        {browserInfo && (
          <div className="text-[11px] space-y-0.5 opacity-85 font-mono">
            <p>{browserInfo.label}</p>
            <p className="opacity-60">
              WebGPU: {browserInfo.webgpuSupported ? "yes" : "no"}
              {browserInfo.webgpuAdapter ? ` · ${browserInfo.webgpuAdapter}` : ""}
            </p>
          </div>
        )}

        {videoFileName && (
          <p className="text-[11px] opacity-70 truncate" title={videoFileName}>
            Video: {videoFileName}
          </p>
        )}

        <label className="block text-[11px] opacity-70">
          Run label (optional)
          <input
            type="text"
            value={customLabel}
            onChange={(e) => onCustomLabelChange(e.target.value)}
            placeholder={browserInfo?.label ?? "Chrome on macOS"}
            disabled={status === "recording"}
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white placeholder:opacity-40 disabled:opacity-50"
          />
        </label>

        <label className="block text-[11px] opacity-70">
          Duration (seconds)
          <input
            type="number"
            min={15}
            max={300}
            value={durationSec}
            onChange={(e) => onDurationSecChange(Math.max(15, Math.min(300, Number(e.target.value) || 60)))}
            disabled={status === "recording"}
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white disabled:opacity-50"
          />
        </label>

        {status === "recording" && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>{formatElapsed(elapsedMs)}</span>
              <span className="opacity-60">{durationSec}s target</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-blue-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status === "idle" && (
            <GlassButton onClick={onStart} className="px-3 py-2 rounded-xl text-xs font-semibold">
              Start {durationSec}s benchmark
            </GlassButton>
          )}
          {status === "recording" && (
            <GlassButton onClick={onStop} className="px-3 py-2 rounded-xl text-xs font-semibold">
              Stop early
            </GlassButton>
          )}
          {status === "completed" && (
            <>
              <GlassButton onClick={onExport} className="px-3 py-2 rounded-xl text-xs font-semibold">
                Download JSON
              </GlassButton>
              <GlassButton onClick={onReset} className="px-3 py-2 rounded-xl text-xs">
                New run
              </GlassButton>
            </>
          )}
        </div>

        {completedSession && (
          <div className="border-t border-white/10 pt-2 text-[11px] space-y-1">
            <p className="opacity-60 uppercase tracking-wide">Last run summary</p>
            <p>Avg latency: {formatMs(completedSession.summary.latency.avgTotalMs, 0)}</p>
            <p>
              Inference: {completedSession.summary.sampling.sessionInferenceRateHz.toFixed(2)} /s
              <span className="opacity-50"> (session)</span>
            </p>
            <p>Peak memory: {formatMB(completedSession.summary.memory.peakUsedMB)}</p>
            <p className="opacity-50">{completedSession.summary.latency.sampleCount} samples captured</p>
          </div>
        )}

        <button
          type="button"
          onClick={onOpenCompare}
          className="w-full text-xs text-blue-300 hover:text-blue-200 underline underline-offset-2"
        >
          Compare browser results →
        </button>
      </div>
    </GlassContainer>
  );
}
