import GlassContainer from "./GlassContainer";
import { GLASS_EFFECTS } from "../constants";
import type { PerformanceStats } from "../types/metrics";
import { formatHz } from "../hooks/usePerformanceMetrics";
import { formatMs } from "../utils/latencyStats";
import { formatMB } from "../utils/memoryMonitor";

interface PerformancePanelProps {
  stats: PerformanceStats;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="opacity-70">{label}</span>
      <span className="font-mono tabular-nums opacity-95">{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <p className="text-[10px] uppercase tracking-wide opacity-50 mb-1.5">{children}</p>;
}

export default function PerformancePanel({ stats }: PerformancePanelProps) {
  const { latency, sampling, memory } = stats;
  const last = latency.last;
  const hasData = latency.sampleCount > 0 || sampling.totalLoopTicks > 0;

  return (
    <GlassContainer
      bgColor={GLASS_EFFECTS.COLORS.DEFAULT_BG}
      className="w-80 rounded-2xl shadow-2xl hover:scale-105 transition-transform duration-200 max-h-[85vh] overflow-y-auto"
    >
      <div className="p-4 text-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold opacity-90">Performance</h3>
          <span className="text-xs opacity-60">local · WebGPU</span>
        </div>

        {!hasData ? (
          <p className="text-xs opacity-70 italic">Run captioning to collect metrics…</p>
        ) : (
          <div className="space-y-3">
            {/* Latency */}
            <div>
              <SectionTitle>Latency</SectionTitle>
              {latency.sampleCount === 0 ? (
                <p className="text-xs opacity-60 italic">No completed inferences yet</p>
              ) : (
                <div className="space-y-1">
                  <MetricRow label="End-to-end (last)" value={formatMs(last?.totalMs, 0)} />
                  <MetricRow label="Time to 1st token" value={formatMs(last?.timeToFirstTokenMs, 0)} />
                  <MetricRow label="Avg end-to-end" value={formatMs(latency.avgTotalMs, 0)} />
                  <MetricRow label="Min / max" value={`${formatMs(latency.minTotalMs, 0)} / ${formatMs(latency.maxTotalMs, 0)}`} />
                </div>
              )}
            </div>

            {/* Frame sampling */}
            <div className="border-t border-white/10 pt-2">
              <SectionTitle>Frame sampling</SectionTitle>
              <div className="space-y-1">
                <MetricRow label="Inference rate" value={formatHz(sampling.inferenceRateHz)} />
                <MetricRow label="Loop rate" value={formatHz(sampling.loopRateHz)} />
                <MetricRow label="Skip rate" value={formatHz(sampling.skipRateHz)} />
                <MetricRow
                  label="Avg loop period"
                  value={sampling.avgLoopPeriodMs !== null ? formatMs(sampling.avgLoopPeriodMs, 0) : "—"}
                />
                <MetricRow label="Capture delay (cfg)" value={formatMs(sampling.configuredCaptureDelayMs, 0)} />
                {sampling.theoreticalMaxInferenceHz !== null && (
                  <MetricRow
                    label="Theoretical max"
                    value={formatHz(sampling.theoreticalMaxInferenceHz)}
                  />
                )}
                <MetricRow
                  label="Completed / skipped"
                  value={`${sampling.totalCompleted} / ${sampling.totalSkipped}`}
                />
                {sampling.skipRatio > 0 && (
                  <p className="text-[10px] opacity-50">
                    {(sampling.skipRatio * 100).toFixed(0)}% of attempts skipped (model busy)
                  </p>
                )}
              </div>
            </div>

            {/* Memory */}
            <div className="border-t border-white/10 pt-2">
              <SectionTitle>Memory</SectionTitle>
              {memory.current.supported ? (
                <div className="space-y-1">
                  <MetricRow label="JS heap used" value={formatMB(memory.current.usedMB)} />
                  <MetricRow label="JS heap total" value={formatMB(memory.current.totalMB)} />
                  <MetricRow label="JS heap limit" value={formatMB(memory.current.limitMB)} />
                  <MetricRow label="Peak used" value={formatMB(memory.peakUsedMB)} />
                  {memory.deltaFromBaselineMB !== null && (
                    <MetricRow
                      label="Δ since session start"
                      value={`${memory.deltaFromBaselineMB >= 0 ? "+" : ""}${memory.deltaFromBaselineMB.toFixed(1)} MB`}
                    />
                  )}
                  {memory.current.deviceMemoryGB !== undefined && (
                    <MetricRow label="Device RAM (hint)" value={`~${memory.current.deviceMemoryGB} GB`} />
                  )}
                </div>
              ) : (
                <p className="text-xs opacity-60 leading-relaxed">
                  Heap metrics need Chromium (Chrome/Edge). Device RAM hint may still appear where supported.
                  {memory.current.deviceMemoryGB !== undefined && (
                    <span className="block mt-1">Device RAM hint: ~{memory.current.deviceMemoryGB} GB</span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </GlassContainer>
  );
}
