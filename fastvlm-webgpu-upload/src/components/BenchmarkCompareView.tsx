import { useState, useCallback, useMemo, useRef } from "react";
import GlassContainer from "./GlassContainer";
import GlassButton from "./GlassButton";
import { GLASS_EFFECTS } from "../constants";
import type { BenchmarkSession } from "../types/benchmark";
import {
  bestIndices,
  downloadComparisonCsv,
  loadStoredSessions,
  parseBenchmarkSessionFile,
  removeStoredSession,
  saveSessionToStorage,
  toComparisonRows,
} from "../utils/benchmarkSession";
import { formatMB } from "../utils/memoryMonitor";

interface BenchmarkCompareViewProps {
  onClose: () => void;
}

function cellClass(isBest: boolean): string {
  return isBest ? "text-green-300 font-semibold" : "";
}

export default function BenchmarkCompareView({ onClose }: BenchmarkCompareViewProps) {
  const [sessions, setSessions] = useState<BenchmarkSession[]>(() => loadStoredSessions());
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => toComparisonRows(sessions), [sessions]);
  const best = useMemo(() => bestIndices(rows), [rows]);

  const handleImportFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setImportError(null);

    const imported: BenchmarkSession[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const json = JSON.parse(text) as unknown;
        imported.push(parseBenchmarkSessionFile(json));
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (imported.length > 0) {
      imported.forEach(saveSessionToStorage);
      setSessions((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        imported.forEach((s) => byId.set(s.id, s));
        return Array.from(byId.values()).sort(
          (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
        );
      });
    }

    if (errors.length > 0) {
      setImportError(errors.join("; "));
    }
  }, []);

  const handleRemove = useCallback((id: string) => {
    removeStoredSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    sessions.forEach((s) => removeStoredSession(s.id));
    setSessions([]);
  }, [sessions]);

  return (
    <div className="absolute inset-0 z-[100] bg-gray-950/95 text-white overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Browser comparison</h1>
            <p className="text-sm text-gray-400 mt-1">
              Import benchmark JSON files from each browser (same uploaded video recommended).
            </p>
          </div>
          <GlassButton onClick={onClose} className="px-4 py-2 rounded-xl">
            Close
          </GlassButton>
        </div>

        <GlassContainer className="rounded-2xl" bgColor={GLASS_EFFECTS.COLORS.DEFAULT_BG}>
          <div className="p-4 flex flex-wrap gap-3 items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              className="hidden"
              onChange={(e) => {
                handleImportFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <GlassButton
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl text-sm"
            >
              Import JSON file(s)
            </GlassButton>
            <GlassButton
              onClick={() => setSessions(loadStoredSessions())}
              className="px-4 py-2 rounded-xl text-sm"
            >
              Reload saved on this device
            </GlassButton>
            {sessions.length > 0 && (
              <>
                <GlassButton
                  onClick={() => downloadComparisonCsv(sessions)}
                  className="px-4 py-2 rounded-xl text-sm"
                >
                  Export comparison CSV
                </GlassButton>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Clear all
                </button>
              </>
            )}
          </div>
          {importError && <p className="px-4 pb-4 text-xs text-red-300">{importError}</p>}
        </GlassContainer>

        {sessions.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No benchmark sessions yet. Run a benchmark in captioning mode and download JSON, or import files from
            other browsers.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="p-3">Label</th>
                  <th className="p-3">Browser</th>
                  <th className="p-3">WebGPU</th>
                  <th className="p-3">Video</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Samples</th>
                  <th className="p-3">Avg latency</th>
                  <th className="p-3">P95 latency</th>
                  <th className="p-3">Inference /s</th>
                  <th className="p-3">Skip %</th>
                  <th className="p-3">Peak mem</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const s = row.session;
                  return (
                    <tr key={s.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-3 font-medium">{s.label}</td>
                      <td className="p-3">
                        {s.browser.name} {s.browser.version}
                        <span className="block text-xs opacity-50">{s.browser.os}</span>
                      </td>
                      <td className="p-3 text-xs">
                        {s.browser.webgpuSupported ? "✓" : "✗"}
                        {s.browser.webgpuAdapter && (
                          <span className="block opacity-50 truncate max-w-[120px]" title={s.browser.webgpuAdapter}>
                            {s.browser.webgpuAdapter}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs truncate max-w-[100px]" title={s.videoFileName ?? ""}>
                        {s.videoFileName ?? "—"}
                      </td>
                      <td className="p-3">{(s.durationMs / 1000).toFixed(0)}s</td>
                      <td className="p-3">{row.metrics.sampleCount}</td>
                      <td className={`p-3 ${cellClass(best.avgLatency === i)}`}>
                        {row.metrics.avgLatencyMs.toFixed(0)} ms
                      </td>
                      <td className={`p-3 ${cellClass(best.p95Latency === i)}`}>
                        {row.metrics.p95LatencyMs.toFixed(0)} ms
                      </td>
                      <td className={`p-3 ${cellClass(best.inferenceRate === i)}`}>
                        {s.summary.sampling.sessionInferenceRateHz.toFixed(2)}
                      </td>
                      <td className="p-3">{row.metrics.skipRatioPercent.toFixed(0)}%</td>
                      <td className={`p-3 ${cellClass(best.peakMemory === i)}`}>
                        {formatMB(row.metrics.peakMemoryMB)}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => handleRemove(s.id)}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-500 text-center">
          Green values are best in each column (lowest latency / memory, highest inference rate). Sessions are also
          auto-saved in this browser&apos;s local storage when a benchmark completes.
        </p>
      </div>
    </div>
  );
}
