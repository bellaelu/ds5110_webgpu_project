# 02 — Build the app

This is the main build. The architecture mirrors how production browser-AI apps
are structured: a **Web Worker** runs the model off the main thread (so the UI
never freezes), and the main page handles capture + display.

```
 main thread (UI)                          worker thread
 ─────────────────                         ───────────────
 capture a frame  ──ImageBitmap──────────▶ run FastVLM.generate()
 show metrics     ◀──tokens / done────────  stream tokens back
 sample next frame                          report timings
```

Build it in five stages. The starter app already contains all of this; use this
doc to understand, modify, and explain it.

## Stage 1 — The inference worker

The worker loads the model once, then handles one frame at a time. Loading on a
worker keeps the heavy download and GPU work off the UI thread.

Key responsibilities:
1. Lazy-load the processor + model on first message (with progress reporting).
2. Accept `{ image, prompt, maxTokens }` jobs.
3. Stream tokens back and post timing data (`load → first token → done`).
4. Guard against overlap: never start a new generation while one is running.

See `app/src/worker.js`. The core call is the same `AutoProcessor` /
`AutoModelForImageTextToText` pattern from the smoke test, wrapped in
`onmessage`.

The single most important pattern for real-time use:

```js
let busy = false;
self.onmessage = async (e) => {
  if (e.data.type === "frame") {
    if (busy) { self.postMessage({ type: "dropped" }); return; } // drop, don't queue
    busy = true;
    try {
      // ...run generate, stream tokens...
    } finally {
      busy = false;
    }
  }
};
```

**Dropping** frames while busy (instead of queuing them) is what keeps latency
bounded. A growing queue means your captions fall further and further behind
the live scene. Track the drop rate — it's a real metric.

## Stage 2 — Frame capture from three sources

All three produce a `<video>` element you then sample. The sampling code is
identical regardless of source — only acquisition differs.

**Webcam:**
```js
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
videoEl.srcObject = stream;
```

**Screen share:**
```js
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
videoEl.srcObject = stream;
```

**Uploaded video file:**
```js
videoEl.src = URL.createObjectURL(file); // from an <input type="file">
```

> `getUserMedia` / `getDisplayMedia` need a secure context (you have it on
> localhost) and a **user gesture** (call them from a click handler).

## Stage 3 — Sampling frames into images

Don't run the model on every video frame — you can't, and you shouldn't. Sample
on an interval, and capture the current frame as an `ImageBitmap` (cheap,
transferable to the worker).

```js
async function grabFrame(videoEl) {
  // createImageBitmap reads the current displayed frame
  return await createImageBitmap(videoEl);
}
```

Transfer it to the worker without copying:
```js
worker.postMessage({ type: "frame", image: bitmap, prompt, maxTokens }, [bitmap]);
```

**Pacing strategy** (this is your "frame sampling rate" knob):
- Use a fixed interval (e.g. every 500 ms) *or*
- "As fast as the model allows": capture the next frame only after the previous
  result returns. This auto-adapts to the device's speed and is what you'll
  likely report as effective FPS.

The starter exposes a slider for target interval plus an "adaptive" mode so you
can measure both.

## Stage 4 — Three task modes from one model

A VLM does all three by just changing the **prompt**. Wire up a mode selector:

| Mode | Prompt sent with the frame |
|------|----------------------------|
| Caption | `"<image>Describe what is happening in one sentence."` |
| Q&A | `"<image>" + userQuestion` |
| Event detection | `"<image>Is any of the following happening: a person enters, an object is picked up, someone waves? Answer with the event or 'none'."` |

Event detection is just a constrained-answer caption. Keep `max_new_tokens`
small (16–32) for events and Q&A to keep latency down.

Build the prompt on the main thread, send it with each frame.

## Stage 5 — The metrics panel (wire it as you go)

Instrument from the start; don't bolt it on later. For each completed inference
the worker should report:
- `loadMs` — one-time model load duration (first job only).
- `ttftMs` — time from job received to first streamed token.
- `totalMs` — job received to done.
- `tokens` — number of output tokens (for tokens/sec).

The main thread tracks:
- **Effective FPS** — completed frames per second over a rolling window.
- **Drop rate** — dropped / (dropped + processed).
- **Memory** — via `performance.measureUserAgentSpecificMemory()` (needs the
  COOP/COEP headers) sampled periodically.

Show these live. `docs/03` covers *how to measure each correctly* — read it
before trusting any number.

## Putting it together

Open `app/src/main.js` and `app/src/worker.js`. The flow is:

1. Page loads → user picks a source and clicks Start.
2. Main thread starts a sampling loop → grabs a frame → posts to worker.
3. Worker (model already warm) runs `generate`, streams tokens back.
4. Main thread renders tokens + updates metrics, then schedules the next frame.

### Things that will bite you

- **First inference is slow** (shader compilation / warm-up). Run one throwaway
  inference on load and exclude it from metrics — note it separately as
  "warm-up cost."
- **Don't `await` generation on the main thread.** That's the whole reason for
  the worker.
- **`ImageBitmap` is single-use after transfer.** Grab a fresh one per frame.
- **Stop tracks when done:** `stream.getTracks().forEach(t => t.stop())` or the
  camera light stays on.
- **Big prompts / big `max_new_tokens` = big latency.** Keep outputs short.

Next: `docs/03-measurement-plan.md`.
