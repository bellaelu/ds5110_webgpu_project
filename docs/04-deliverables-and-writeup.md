# 04 — Deliverables & write-up

What to hand in, how to structure the analysis, and how to make the
privacy/deployment argument with evidence rather than vibes.

## Deliverables checklist

- [ ] **Working app** — loads FastVLM in-browser, all three capture sources,
      three task modes (caption / Q&A / event), live metrics panel.
- [ ] **Benchmark data** — CSV/JSON from the harness across ≥2 browsers and, if
      possible, ≥2 devices, including a WASM-fallback row.
- [ ] **Report** (structure below).
- [ ] **README** — how to run it, browser requirements, known limitations.
- [ ] *(optional)* a short screen-recording/GIF of it captioning a live scene.

## Report structure

1. **Overview** — what the app does, the stack diagram, one screenshot.
2. **Architecture** — main thread vs worker; capture → sample → infer → render
   loop; why frames are dropped not queued.
3. **Method** — exact test conditions (browser/GPU/OS/dtype/prompt/tokens),
   warm-up handling, sample sizes. Make it reproducible.
4. **Results** — for each metric, a table or chart:
   - Latency: median + p95 TTFT, total, tokens/sec.
   - FPS: effective vs target, drop-rate curve.
   - Memory: baseline / loaded / steady-state + model download size.
   - Compatibility: the browser matrix.
   - WebGPU vs WASM: the headline speedup.
5. **Privacy & deployment analysis** (below).
6. **Limitations & future work.**

## Making the privacy & deployment argument with evidence

Don't just assert "it's private." Demonstrate it:

- **Network evidence.** Open DevTools → Network, run a full session, and show
  that after the one-time model download there are **zero requests** carrying
  frame data. Screenshot it. That's the proof: camera/screen frames never leave
  the device.
- **Deployment cost.** You host only static files (HTML/JS/the model can even be
  served from the HF CDN). No GPU server, no per-inference cost, scales by CDN.
  Contrast with a server-side VLM: GPU instance cost, autoscaling, egress.
- **The honest trade-offs** (include these — they show rigor):
  - One-time **download** of hundreds of MB (quantify it; note it's cached).
  - **Hardware dependence** — performance varies wildly across user devices
    (your compatibility table is the evidence).
  - **Browser support gaps** — Safari/older browsers may fall back to slow WASM
    or fail; cite your matrix.
  - **Model capability ceiling** — 0.5B is fast but limited; document failure
    cases (poor lighting, fine detail, counting).

A strong write-up states the privacy/cost win **and** quantifies what it costs
in download, hardware, and capability. That balance is the point of the project.

## Stretch goals (pick if you have time)

- Compare **FastVLM-0.5B vs 1.5B**, or **q4 vs fp16**, on the latency/quality
  trade-off.
- Compare FastVLM against another in-browser VLM (e.g. SmolVLM) on the same
  frames.
- Add **temporal logic**: only emit an event when N consecutive frames agree, to
  reduce flicker — and measure how it affects perceived accuracy.
- Add a **"download size & cache" inspector** using the model file metadata API.

## Self-grading rubric

| Area | Solid | Excellent |
|---|---|---|
| App works | Captions one source | All 3 sources + 3 modes, stable loop, drop handling |
| Measurement | Reports the 4 metrics | Median+p95, warm-up handled, conditions pinned, harness automated |
| Compatibility | 1–2 browsers | Matrix incl. WASM fallback + a mobile device |
| Privacy/deploy | Asserts the benefits | Network-tab proof + quantified trade-offs |
| Write-up | Clear results | Reproducible method, charts, honest limitations |

That's the whole project. Build order if you're time-boxed: smoke test
(`docs/01` Step 5) → worker + webcam caption (`docs/02`) → metrics
(`docs/03`) → other sources/modes → write-up.
