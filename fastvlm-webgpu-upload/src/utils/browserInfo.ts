import type { BrowserInfo } from "../types/benchmark";
import { readMemorySnapshot } from "./memoryMonitor";

function parseBrowser(ua: string): { name: string; version: string } {
  const edge = ua.match(/Edg\/(\d+[\d.]*)/);
  if (edge) return { name: "Edge", version: edge[1] };

  const chrome = ua.match(/Chrome\/(\d+[\d.]*)/);
  if (chrome && !ua.includes("Edg/")) return { name: "Chrome", version: chrome[1] };

  const firefox = ua.match(/Firefox\/(\d+[\d.]*)/);
  if (firefox) return { name: "Firefox", version: firefox[1] };

  const safari = ua.match(/Version\/(\d+[\d.]*).*Safari/);
  if (safari && ua.includes("Safari") && !chrome) return { name: "Safari", version: safari[1] };

  return { name: "Unknown", version: "?" };
}

function parseOS(ua: string): string {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown";
}

async function getWebGpuAdapterLabel(): Promise<string | null> {
  if (!navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;

    const adapterWithInfo = adapter as GPUAdapter & {
      requestAdapterInfo?: () => Promise<{ device?: string; description?: string; architecture?: string }>;
    };

    if (adapterWithInfo.requestAdapterInfo) {
      const info = await adapterWithInfo.requestAdapterInfo();
      return info.device || info.description || info.architecture || "WebGPU adapter";
    }

    return "WebGPU adapter (info unavailable)";
  } catch {
    return null;
  }
}

export async function collectBrowserInfo(): Promise<BrowserInfo> {
  const ua = navigator.userAgent;
  const { name, version } = parseBrowser(ua);
  const os = parseOS(ua);
  const webgpuSupported = Boolean(navigator.gpu);
  const webgpuAdapter = webgpuSupported ? await getWebGpuAdapterLabel() : null;
  const memoryApiSupported = readMemorySnapshot().supported;

  const label = `${name} ${version} · ${os}`;

  return {
    label,
    name,
    version,
    os,
    userAgent: ua,
    webgpuSupported,
    webgpuAdapter,
    memoryApiSupported,
  };
}
