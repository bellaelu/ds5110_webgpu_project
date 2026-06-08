# 03 — Measurement plan

The project explicitly asks you to measure **latency, frame sampling rate,
memory usage, and browser compatibility**. Bad measurement is worse than none,
so here's how to do each one defensibly.

## Golden rules

1. **Warm up first.** Discard the first 1–3 inferences (shader compilation,
   caching, JIT). Report warm-up as its own number, separately.
2. **Report distributions, not single numbers.** Median + p95 over ≥30 samples,
   not one lucky run. The mean alone hides stutter.
3. **Pin your conditions.** Record browser version (`chrome://version`), GPU and
   driver (`chrome://gpu`), OS, model dtype, prompt, and `max_new_tokens`. A
   latency number is meaningless without them.
4. **Change one variable at a time.** dtype, model size, prompt length,
   sampling interval — vary one, hold the rest.

## Metric 1 — Latency

Define your terms precisely; report all three:

- **Time to first token (TTFT)** — job received → first token. Dominated by the
  vision encoder. This is what "feels responsive" tracks.
- **Total inference latency** — job received → generation complete. What bounds
  your max FPS.
- **Tokens/sec** — `outputTokens / (totalMs - ttftMs)`. Decode throughput.

Measure inside the worker with `performance.now()` so you exclude
postMessage/render jitter from the core number — but *also* measure end-to-end
(capture → rendered) on the main thread, because that's what the user actually
experiences. Report both and explain the gap.

```js
const t0 = performance.now();
// first token callback:
if (firstToken) ttft = performance.now() - t0;
// on done:
const total = performance.now() - t0;
```

Collect ≥30 samples per condition, then compute median and p95.

## Metric 2 — Frame sampling rate (FPS)

Two different things — measure both and don't conflate them:

- **Target sampling rate** — the rate you *attempt* (e.g. interval = 500 ms →
  2 fps target).
- **Effective rate** — frames actually *completed* per second. Count completions
  over a rolling 10-second window.

Because you drop frames while busy (see `docs/02`), effective rate is capped by
`1000 / totalMs`. Report:
- Effective FPS at several target intervals.
- **Drop rate** = dropped / (dropped + completed) at each target.

The interesting finding is usually: pushing target FPS above what the model can
sustain just raises the drop rate without improving effective FPS. Show that
curve.

## Metric 3 — Memory usage

Use the cross-origin-isolated memory API (this is why you set the COOP/COEP
headers):

```js
if (performance.measureUserAgentSpecificMemory) {
  const r = await performance.measureUserAgentSpecificMemory();
  console.log(r.bytes); // total JS+DOM+worker bytes
}
```

Sample it at three moments and report each:
1. **Baseline** — page loaded, before model load.
2. **After model load** — the resident cost of weights + runtime.
3. **Steady-state during inference** — sampled every few seconds while running.

Notes:
- This API may quantize/delay results for privacy; sample a few times and take
  the stable value.
- It does **not** see GPU/VRAM allocations directly. For GPU memory, use
  `chrome://gpu` and Chrome Task Manager (Shift+Esc → enable "GPU Memory"
  column) as a coarse cross-check. State clearly which tool reported which
  number.
- Also report the **download size** of the model (one-time, then cached) — it's
  a deployment cost even if not "runtime memory." You can read per-file sizes
  via the model's file metadata or just the Network tab on first load.

## Metric 4 — Browser compatibility

Build a small matrix. Test the same flow (load → caption 5 frames) on each and
record outcome + numbers:

| Browser / version | WebGPU? | Loaded? | Median TTFT | Notes / fallback |
|---|---|---|---|---|
| Chrome (your ver) | yes | yes | … | reference |
| Edge | | | | |
| Firefox | | | | flag needed? |
| Safari (Mac/iOS) | | | | experimental — expect issues |
| Chrome on Android | | | | mobile GPU limits |

Also test the **WASM fallback** path deliberately: force `device: "wasm"` (or
run in a browser without WebGPU) and record how much slower it is. The
WebGPU-vs-WASM gap (often 10–15x) is one of your headline results.

For each failure, capture the actual console error — "it didn't work" isn't a
finding; "WebGPU init failed, fell back to WASM, ran at X" is.

## A repeatable benchmark harness

Don't measure by hand. Add a "Benchmark" button that:
1. Loads the model (records load time).
2. Runs N warm-up inferences (discarded).
3. Runs M measured inferences on a fixed test frame + fixed prompt.
4. Samples memory before/after.
5. Dumps a JSON/CSV row: `{browser, gpu, dtype, prompt, maxTokens, medianTtft,
   p95Ttft, medianTotal, tokensPerSec, baselineMem, loadedMem, steadyMem}`.

Run the same harness on every device/browser → your compatibility table fills
itself with comparable numbers. The starter app stubs this out in
`app/src/bench.js`.

Next: `docs/04-deliverables-and-writeup.md`.
