// bench.js — automated benchmark harness. See docs/03 "A repeatable harness".
//
// This version captures its test frame from a source you control, so it never
// depends on a cross-origin fetch (which can hang under the COEP header).
//
// HOW TO RUN (in the app's browser console):
//   1. Start a source in the app first (Webcam, Screen, or a Video file) and
//      let it play so there's a frame on screen. You can click Stop the live
//      loop if you like — the benchmark grabs the current frame directly.
//   2. const { runBenchmark } = await import('/src/bench.js');
//      window.row = await runBenchmark();
//      console.log('DONE:', window.row);
//
// If no <video> frame is available it falls back to a generated test image so
// the harness still runs, but using a real frame is preferable.

export async function runBenchmark({
  warmup = 3,
  measured = 30,
  prompt = "<image>Describe this image in one sentence.",
  maxTokens = 32,
} = {}) {
  console.log("[bench] starting — loading model (cached after first run)…");

  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });

  const wait = (pred) =>
    new Promise((res) => {
      const h = (e) => {
        if (pred(e.data)) {
          worker.removeEventListener("message", h);
          res(e.data);
        }
      };
      worker.addEventListener("message", h);
    });

  // 1. load
  const memBaseline = await mem();
  worker.postMessage({ type: "load" });
  const loaded = await wait((d) => d.type === "loaded");
  const memLoaded = await mem();
  console.log(`[bench] model loaded in ${Math.round(loaded.loadMs)} ms`);

  // shared test frame — captured locally, no network fetch
  const baseBitmap = await getTestBitmap();
  // we need a fresh bitmap each shot (transfer consumes it), so re-draw from a canvas
  const canvas = document.createElement("canvas");
  canvas.width = baseBitmap.width;
  canvas.height = baseBitmap.height;
  canvas.getContext("2d").drawImage(baseBitmap, 0, 0);
  const makeBitmap = () => createImageBitmap(canvas);

  const oneShot = async () => {
    const bmp = await makeBitmap();
    worker.postMessage({ type: "frame", image: bmp, prompt, maxTokens }, [bmp]);
    return await wait((d) => d.type === "result" || d.type === "error");
  };

  // 2. warm up (discard)
  for (let i = 0; i < warmup; i++) {
    await oneShot();
    console.log(`[bench] warm-up ${i + 1}/${warmup} done`);
  }

  // 3. measured
  const ttft = [];
  const total = [];
  const tps = [];
  for (let i = 0; i < measured; i++) {
    const r = await oneShot();
    if (r.type !== "result") {
      console.warn("[bench] a run errored:", r.message);
      continue;
    }
    ttft.push(r.metrics.ttftMs);
    total.push(r.metrics.totalMs);
    const decode = r.metrics.totalMs - (r.metrics.ttftMs ?? 0);
    tps.push(decode > 0 ? (r.metrics.tokens / decode) * 1000 : 0);
    if ((i + 1) % 5 === 0) console.log(`[bench] measured ${i + 1}/${measured}`);
  }
  const memSteady = await mem();
  worker.terminate();

  const row = {
    userAgent: navigator.userAgent,
    webgpu: !!navigator.gpu,
    crossOriginIsolated,
    prompt,
    maxTokens,
    loadMs: Math.round(loaded.loadMs),
    medianTtft: median(ttft),
    p95Ttft: pct(ttft, 95),
    medianTotal: median(total),
    p95Total: pct(total, 95),
    medianTokensPerSec: median(tps),
    memBaselineMB: memBaseline,
    memLoadedMB: memLoaded,
    memSteadyMB: memSteady,
  };
  console.table(row);
  console.log("CSV:", Object.values(row).join(","));
  console.log("[bench] complete.");
  return row;
}

// Grab the current frame from the app's <video>. Fall back to a synthetic
// gradient image if nothing is playing, so the harness still runs.
async function getTestBitmap() {
  const video = document.getElementById("video");
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    try {
      console.log("[bench] using current video frame as test image");
      return await createImageBitmap(video);
    } catch (e) {
      console.warn("[bench] couldn't grab video frame, using fallback:", e);
    }
  }
  console.log(
    "[bench] no video frame available — using a generated fallback image. " +
      "For meaningful results, start a source in the app first."
  );
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 480;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 640, 480);
  g.addColorStop(0, "#3a6ea5");
  g.addColorStop(1, "#c0d6df");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = "#222";
  ctx.font = "48px sans-serif";
  ctx.fillText("benchmark frame", 90, 240);
  ctx.fillStyle = "#e8533f";
  ctx.fillRect(420, 300, 120, 120);
  return await createImageBitmap(c);
}

async function mem() {
  if (crossOriginIsolated && performance.measureUserAgentSpecificMemory) {
    try {
      const r = await performance.measureUserAgentSpecificMemory();
      return Math.round(r.bytes / 1e6);
    } catch {
      return null;
    }
  }
  return null;
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}
function pct(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}