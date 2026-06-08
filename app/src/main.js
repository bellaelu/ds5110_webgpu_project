// main.js — UI, capture, sampling loop, and live metrics.
// Talks to worker.js. See docs/02 (build) and docs/03 (metrics).

const PROMPTS = {
  caption: "<image>Describe what is happening in one sentence.",
  qa: (q) => `<image>${q}`,
  event:
    "<image>Is any of these happening: a person enters, an object is picked up, someone waves? Reply with the event or 'none'.",
};

// --- element refs ---
const $ = (id) => document.getElementById(id);
const videoEl = $("video");
const captionEl = $("caption");
const startBtn = $("start");
const stopBtn = $("stop");
const sourceSel = $("source");
const modeSel = $("mode");
const questionInput = $("question");
const fileInput = $("file");
const intervalInput = $("interval");
const adaptiveChk = $("adaptive");
const statusEl = $("status");
const m = {
  load: $("m-load"),
  ttft: $("m-ttft"),
  total: $("m-total"),
  tps: $("m-tps"),
  fps: $("m-fps"),
  drop: $("m-drop"),
  mem: $("m-mem"),
};

// --- worker ---
const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});

let modelReady = false;
let running = false;
let currentStream = null;
let sampleTimer = null;
let inFlight = false;

// rolling metrics
const completions = []; // timestamps of completed frames (for FPS)
let processed = 0;
let dropped = 0;
let lastMetrics = null;

// --- session log (one row per processed frame) ---
// Captured here, exported to CSV on demand. See docs/03 for why we log
// end-to-end latency on the main thread in addition to the worker's TTFT/total.
let sessionLog = [];
let sessionStart = 0; // performance.now() when Start was clicked
let frameStart = 0; // performance.now() when the current frame was captured
let frameSeq = 0; // counts frames sent this session

worker.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case "load-progress":
      setStatus(`Loading ${msg.file}… ${Math.round(msg.progress)}%`);
      break;
    case "loaded":
      modelReady = true;
      m.load.textContent = msg.loadMs.toFixed(0);
      setStatus("Model ready. Click Start.");
      startBtn.disabled = false;
      break;
    case "token":
      captionEl.textContent += msg.token;
      break;
    case "result":
      onResult(msg);
      break;
    case "dropped":
      dropped += 1;
      updateDerivedMetrics();
      if (adaptiveChk.checked) scheduleNext(); // try again soon in adaptive mode
      break;
    case "error":
      setStatus(`Error (${msg.where}): ${msg.message}`);
      break;
  }
};

function onResult(msg) {
  lastMetrics = msg.metrics;
  processed += 1;
  const now = performance.now();
  completions.push(now);
  inFlight = false;

  m.ttft.textContent = msg.metrics.ttftMs?.toFixed(0) ?? "—";
  m.total.textContent = msg.metrics.totalMs.toFixed(0);
  const decodeMs = msg.metrics.totalMs - (msg.metrics.ttftMs ?? 0);
  const tps = decodeMs > 0 ? (msg.metrics.tokens / decodeMs) * 1000 : 0;
  m.tps.textContent = tps.toFixed(1);

  // record a log row for this frame
  sessionLog.push({
    seq: frameSeq,
    sessionMs: Math.round(now - sessionStart), // when in the session this frame finished
    mode: modeSel.value,
    source: sourceSel.value,
    question: modeSel.value === "qa" ? (questionInput.value || "What is in this image?") : "",
    endToEndMs: Math.round(now - frameStart), // capture → rendered (what the user feels)
    ttftMs: msg.metrics.ttftMs != null ? Math.round(msg.metrics.ttftMs) : "",
    totalMs: Math.round(msg.metrics.totalMs), // worker-side inference time
    tokens: msg.metrics.tokens,
    tokensPerSec: tps.toFixed(1),
    output: msg.text ?? captionEl.textContent.trim(),
  });
  updateLogCount();

  updateDerivedMetrics();
  if (running) scheduleNext();
}

function updateDerivedMetrics() {
  // effective FPS over last 10s
  const now = performance.now();
  while (completions.length && now - completions[0] > 10000) completions.shift();
  const fps = completions.length / 10;
  m.fps.textContent = fps.toFixed(2);

  const total = processed + dropped;
  m.drop.textContent = total ? ((dropped / total) * 100).toFixed(0) + "%" : "0%";
}

// --- capture ---
async function startSource() {
  const source = sourceSel.value;
  if (source === "webcam") {
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoEl.srcObject = currentStream;
    videoEl.src = "";
  } else if (source === "screen") {
    currentStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    videoEl.srcObject = currentStream;
    videoEl.src = "";
  } else if (source === "file") {
    if (!fileInput.files[0]) throw new Error("Choose a video file first.");
    videoEl.srcObject = null;
    videoEl.src = URL.createObjectURL(fileInput.files[0]);
    videoEl.loop = true;
  }
  await videoEl.play();
}

function stopSource() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  videoEl.pause();
}

// --- sampling loop ---
function currentPrompt() {
  if (modeSel.value === "qa") return PROMPTS.qa(questionInput.value || "What is in this image?");
  if (modeSel.value === "event") return PROMPTS.event;
  return PROMPTS.caption;
}

async function sendFrame() {
  if (!running || inFlight) return;
  if (videoEl.readyState < 2) return; // not enough data yet
  let bitmap;
  try {
    bitmap = await createImageBitmap(videoEl);
  } catch {
    return;
  }
  inFlight = true;
  frameStart = performance.now();
  frameSeq += 1;
  captionEl.textContent = ""; // clear for streaming
  const maxTokens = modeSel.value === "caption" ? 40 : 24;
  worker.postMessage(
    { type: "frame", image: bitmap, prompt: currentPrompt(), maxTokens },
    [bitmap]
  );
}

function scheduleNext() {
  clearTimeout(sampleTimer);
  if (!running) return;
  if (adaptiveChk.checked) {
    // fire as soon as the previous result returned (this is "adaptive" mode)
    sampleTimer = setTimeout(sendFrame, 0);
  } else {
    const interval = Math.max(100, parseInt(intervalInput.value, 10) || 500);
    sampleTimer = setTimeout(sendFrame, interval);
  }
}

// --- memory sampling (needs cross-origin isolation) ---
async function sampleMemory() {
  if (!crossOriginIsolated || !performance.measureUserAgentSpecificMemory) {
    m.mem.textContent = "n/a";
    return;
  }
  try {
    const r = await performance.measureUserAgentSpecificMemory();
    m.mem.textContent = (r.bytes / 1e6).toFixed(0);
  } catch {
    m.mem.textContent = "n/a";
  }
}
setInterval(sampleMemory, 4000);

// --- controls ---
startBtn.addEventListener("click", async () => {
  try {
    if (!modelReady) {
      setStatus("Model still loading…");
      return;
    }
    await startSource();
    running = true;
    processed = 0;
    dropped = 0;
    completions.length = 0;
    sessionLog = [];
    frameSeq = 0;
    sessionStart = performance.now();
    updateLogCount();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus("Running.");
    sendFrame();
  } catch (err) {
    setStatus(String(err));
  }
});

stopBtn.addEventListener("click", () => {
  running = false;
  clearTimeout(sampleTimer);
  stopSource();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus("Stopped.");
});

function setStatus(s) {
  statusEl.textContent = s;
}

// --- CSV logging / export ---
const downloadBtn = $("download");
const clearBtn = $("clear");
const logCountEl = $("log-count");

function updateLogCount() {
  if (logCountEl) logCountEl.textContent = String(sessionLog.length);
  if (downloadBtn) downloadBtn.disabled = sessionLog.length === 0;
}

function toCSV(rows) {
  if (!rows.length) return "";
  const cols = [
    "seq",
    "sessionMs",
    "mode",
    "source",
    "question",
    "endToEndMs",
    "ttftMs",
    "totalMs",
    "tokens",
    "tokensPerSec",
    "output",
  ];
  const esc = (v) => {
    const s = String(v ?? "");
    // quote if it contains comma, quote, or newline; double internal quotes
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");

  // A few summary lines as comments at the top — handy context, ignored by
  // most parsers (or filter lines starting with '#').
  const totalFrames = processed + dropped;
  const dropRate = totalFrames ? ((dropped / totalFrames) * 100).toFixed(1) : "0";
  const meta = [
    `# fastvlm session log`,
    `# generated,${new Date().toISOString()}`,
    `# userAgent,${esc(navigator.userAgent)}`,
    `# webgpu,${!!navigator.gpu}`,
    `# crossOriginIsolated,${crossOriginIsolated}`,
    `# modelLoadMs,${m.load.textContent}`,
    `# framesProcessed,${processed}`,
    `# framesDropped,${dropped}`,
    `# dropRatePct,${dropRate}`,
  ].join("\n");

  return `${meta}\n${header}\n${body}\n`;
}

function downloadCSV() {
  const csv = toCSV(sessionLog);
  if (!csv) return;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = modeSel.value;
  a.href = url;
  a.download = `fastvlm-${mode}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

if (downloadBtn) downloadBtn.addEventListener("click", downloadCSV);
if (clearBtn)
  clearBtn.addEventListener("click", () => {
    sessionLog = [];
    updateLogCount();
    setStatus("Log cleared.");
  });
updateLogCount();

// kick off model load immediately
setStatus("Loading model (first time downloads ~hundreds of MB, then cached)…");
startBtn.disabled = true;
worker.postMessage({ type: "load" });

if (!navigator.gpu) {
  setStatus("WebGPU not available in this browser — see docs/01. Will be slow or fail.");
}
