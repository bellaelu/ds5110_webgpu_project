# 01 — Environment setup

Goal: a project that serves over `localhost` with the right headers, can reach
WebGPU, and has Transformers.js installed. By the end you'll load the model
once and see it work.

## Prerequisites

- **Node.js 18+** and npm (`node -v`).
- **Chrome 113+** or **Edge** for development (most reliable WebGPU).
- A machine with a GPU that the browser can see. Verify: open `chrome://gpu`
  and confirm "WebGPU" is *Hardware accelerated*.
- Decent free RAM/VRAM — the 0.5B model in q4 needs a few hundred MB.

## Step 1 — Confirm WebGPU is alive in your browser

Open the browser console on any `https`/`localhost` page and run:

```js
console.log(!!navigator.gpu);              // should print: true
const a = await navigator.gpu?.requestAdapter();
console.log(a ? "adapter OK" : "no adapter");
```

If `navigator.gpu` is `undefined`: update the browser, or enable WebGPU. In
Chrome/Edge go to `chrome://flags` → search "WebGPU" → Enabled, relaunch. In
Firefox, recent versions support it; older ones need `dom.webgpu.enabled` in
`about:config`.

## Step 2 — Use the provided starter (recommended)

The `app/` folder is a Vite project pre-wired with everything below. To use it:

```bash
cd app
npm install
npm run dev
```

Open the printed `http://localhost:5173`. **Skip to `docs/02`** to understand
and extend the code. The rest of this doc explains what the starter does so you
can reproduce or debug it.

## Step 3 — (Reference) scaffolding from scratch

If you'd rather build the scaffold yourself:

```bash
npm create vite@latest fastvlm-app -- --template vanilla
cd fastvlm-app
npm install @huggingface/transformers
```

> Install **`@huggingface/transformers`**, never `@xenova/transformers`. Only
> the former has WebGPU.

## Step 4 — The two headers (don't skip this)

For reliable behavior you want a **cross-origin isolated** context. This is
required for the WASM fallback's multi-threading and for the precise
`performance.measureUserAgentSpecificMemory()` memory API you'll use later.

Set these response headers on the dev server:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

In Vite, add to `vite.config.js`:

```js
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // model files are large; don't let Vite try to inline/optimize them
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
});
```

Confirm isolation worked: in the console, `crossOriginIsolated` should be
`true`.

> Note: `require-corp` can block third-party resources that lack CORP headers.
> Hugging Face's CDN serves model files fine. If you add other external assets
> and they break, that header is the first suspect.

## Step 5 — First model load (smoke test)

Create a throwaway `smoke.js` and import it from your page. This downloads
weights (hundreds of MB, cached after first run) and captions one still image:

```js
import {
  AutoProcessor,
  AutoModelForImageTextToText,
  load_image,
  TextStreamer,
} from "@huggingface/transformers";

const model_id = "onnx-community/FastVLM-0.5B-ONNX";

const processor = await AutoProcessor.from_pretrained(model_id);
const model = await AutoModelForImageTextToText.from_pretrained(model_id, {
  dtype: {
    embed_tokens: "fp16",
    vision_encoder: "q4",
    decoder_model_merged: "q4",
  },
  progress_callback: (e) => {
    if (e.status === "progress") {
      console.log(`${e.file} ${Math.round((e.progress ?? 0))}%`);
    }
  },
});

const messages = [{ role: "user", content: "<image>Describe this image." }];
const prompt = processor.apply_chat_template(messages, {
  add_generation_prompt: true,
});

const image = await load_image(
  "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/bee.jpg"
);
const inputs = await processor(image, prompt, { add_special_tokens: false });

await model.generate({
  ...inputs,
  max_new_tokens: 64,
  do_sample: false,
  streamer: new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t) => (document.body.textContent += t),
  }),
});
```

If you see a caption stream in, **your whole stack works**: WebGPU → ONNX
Runtime → FastVLM. Everything after this is plumbing and measurement.

### Common setup failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `navigator.gpu` undefined | Old browser / WebGPU off | Update; enable flag |
| "WebGPU initialization failed… fall back to WASM" | Driver/adapter not exposed | Check `chrome://gpu`; update GPU driver; it will still run on CPU, just slowly |
| Huge re-download every run | Cache cleared / different dtype | Keep dtype identical; weights cache per-config |
| `crossOriginIsolated` is false | Headers missing | Re-check Step 4; confirm dev server actually sends them |
| Page frozen during generate | Running on main thread | Move inference to a Web Worker (see `docs/02`) |

Next: `docs/02-build-the-app.md`.
