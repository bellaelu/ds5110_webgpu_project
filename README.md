# Browser-Native Video Understanding with WebGPU + FastVLM

A complete, build-it-yourself guide for an AI application that captions video,
detects events, and answers questions about a visual scene — running **100%
inside the browser**. No cloud GPU, no backend, no installs for the end user.

## What you're building

A web app that:
1. Captures frames from **webcam**, **screen share**, or an **uploaded video**.
2. Runs **Apple FastVLM** (a lightweight vision-language model) directly in the
   browser using **Transformers.js** + **WebGPU**.
3. Generates captions, answers questions, and flags events about each frame.
4. Reports **latency, frame-sampling rate, memory use, and browser
   compatibility** in a live metrics panel.

Everything stays on the user's device — the privacy story is the whole point.

## How this guide is organized (read in order)

| Doc | What it covers | Read when |
|-----|----------------|-----------|
| `docs/00-concepts.md` | What WebGPU, Transformers.js, FastVLM, and ONNX actually are | First — build mental model |
| `docs/01-environment-setup.md` | Tooling, browser flags, project scaffold, headers | Before writing code |
| `docs/02-build-the-app.md` | Step-by-step build: worker, frame capture, inference loop, UI | Main build phase |
| `docs/03-measurement-plan.md` | How to measure latency, FPS, memory, compatibility correctly | Once it runs |
| `docs/04-deliverables-and-writeup.md` | Report structure, privacy/deployment analysis, rubric | Wrapping up |
| `app/` | A working starter you can run immediately and extend | Anytime |
| `analysis/` | Jupyter notebook that turns your collected CSVs into the report's tables & plots | After collecting data |

## Suggested timeline

- **Day 1** — Concepts + environment. Get the starter app loading the model.
- **Day 2** — Wire up all three capture sources; get the inference loop stable.
- **Day 3** — Build the metrics panel; collect real measurements.
- **Day 4** — Cross-browser/device testing; write up results.

## The one thing that trips everyone up

WebGPU needs a **secure context** (HTTPS or `localhost`) and, for accurate
memory measurement and WASM fallback threading, two HTTP headers
(`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`). The starter
app's dev server sets these for you. See `docs/01` if you deviate from it.

Start with `docs/00-concepts.md`.
