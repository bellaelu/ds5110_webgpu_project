import type { MemorySnapshot } from "../types/metrics";

/** Chrome / Chromium: `performance.memory` (not available in Firefox/Safari). */
export function readMemorySnapshot(): MemorySnapshot {
  const perf = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  const memory = perf.memory;
  if (!memory) {
    return {
      supported: false,
      usedMB: null,
      totalMB: null,
      limitMB: null,
      deviceMemoryGB: navigator.deviceMemory,
      timestamp: Date.now(),
    };
  }

  const toMB = (bytes: number) => bytes / (1024 * 1024);

  return {
    supported: true,
    usedMB: toMB(memory.usedJSHeapSize),
    totalMB: toMB(memory.totalJSHeapSize),
    limitMB: toMB(memory.jsHeapSizeLimit),
    deviceMemoryGB: navigator.deviceMemory,
    timestamp: Date.now(),
  };
}

export function formatMB(mb: number | null | undefined, digits = 1): string {
  if (mb === null || mb === undefined) return "—";
  return `${mb.toFixed(digits)} MB`;
}
