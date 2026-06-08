# Starter app

Working scaffold for the in-browser FastVLM video-understanding project.

## Run

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` in **Chrome 113+** or **Edge**.
The model (~hundreds of MB) downloads once on first load, then is cached by the
browser.

## What's wired up

- `index.html` — UI: source picker, task mode, sampling controls, live metrics.
- `src/main.js` — capture (webcam / screen / file), sampling loop, metrics.
- `src/worker.js` — loads FastVLM-0.5B and runs inference off the main thread.
- `src/bench.js` — automated benchmark harness (median/p95, memory). Import
  `runBenchmark()` or call it from the console.
- `vite.config.js` — sets the COOP/COEP headers required for memory measurement.

## Quick start flow

1. Wait for status to read "Model ready."
2. Pick a source (Webcam is easiest) and a task mode.
3. Click **Start**. Grant the camera/screen permission.
4. Watch captions stream and metrics update.

## Extend it (project tasks)

- Compare dtypes: change `dtype` in `src/worker.js` (`q4` ↔ `fp16`).
- Compare model sizes: swap `MODEL_ID` to the 1.5B FastVLM ONNX build.
- Fill the compatibility matrix: run `runBenchmark()` in each browser/device.
- Add temporal smoothing for event mode (require N agreeing frames).

See the `../docs/` folder for the full guide, and `../docs/03` before trusting
any metric.

## Note on the model ID

This uses `onnx-community/FastVLM-0.5B-ONNX`. Model repos evolve — if loading
fails, check the model card on Hugging Face for the current ID and the exact
`dtype` keys it expects (`embed_tokens`, `vision_encoder`,
`decoder_model_merged`), and confirm you're on `@huggingface/transformers` v3+.
