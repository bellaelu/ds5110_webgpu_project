# 00 — Concepts: the four things that make this work

You don't need to be an expert in any of these, but you should understand what
each piece does and where it sits in the stack. Spend ~20 minutes here.

```
   Webcam / Screen / Video file        ← your input
            │  (a frame = an image)
            ▼
   Transformers.js (JavaScript)        ← the "glue" library
            │  device: "webgpu"
            ▼
   ONNX Runtime Web                    ← the inference engine
            │
            ▼
   WebGPU  ──→  your physical GPU      ← the hardware acceleration
            │
            ▼
   FastVLM (the model weights)         ← the actual AI
            │
            ▼
   Text: "A person holding a coffee cup."
```

## 1. WebGPU — the GPU, exposed to the browser

WebGPU is a browser API that gives JavaScript access to the GPU for general
computation, not just graphics. Before WebGPU, running a neural network in the
browser meant the CPU (slow) or WebGL hacks (awkward). WebGPU is the modern,
purpose-built path.

Why it matters for you: it's the difference between ~30ms and ~400ms per
inference step. Benchmarks commonly show a 10–15x speedup over the CPU/WASM
backend depending on model and hardware.

Practical facts:
- Supported in **Chrome 113+** and **Edge** (stable). **Firefox** has support
  (recent versions, was behind a flag for a while). **Safari** support is newer
  and still maturing — test it, don't assume it.
- Requires a **secure context**: `https://` or `http://localhost`.
- Check support at runtime with `if (!navigator.gpu) { ... }`.
- Inspect your GPU/driver at `chrome://gpu`.

## 2. Transformers.js — Hugging Face models in JavaScript

Transformers.js lets you load and run Hugging Face models in JS with an API
that mirrors the Python `transformers` library. You give it a model ID, it
downloads the weights (and caches them in the browser), and you call
`.generate()`.

**Critical version note:** you want the package **`@huggingface/transformers`**
(v3+), NOT the older `@xenova/transformers` (v2) — only the former supports
WebGPU. Newer v3.x / v4.x releases have a rewritten WebGPU runtime.

Enabling the GPU is one option: `device: "webgpu"`. (For FastVLM we'll instead
specify per-module dtypes, which implies the device — see below.)

## 3. ONNX & quantization — why the model is small enough to ship

Transformers.js runs models in **ONNX** format via **ONNX Runtime Web**. Models
on the Hub under `onnx-community/...` are already converted for you.

**Quantization** shrinks the weights so they download fast and fit in GPU
memory. You'll see dtype labels like:
- `fp16` — 16-bit floats (good quality, larger)
- `q4` — 4-bit quantized (much smaller, slightly lower quality)
- `q4f16` — mixed

FastVLM lets you set the dtype **per module** (embeddings, vision encoder,
decoder) so you can trade quality for speed/size on each part independently.

## 4. FastVLM — the model itself

FastVLM is Apple's lightweight vision-language model (VLM). A VLM takes an
**image + text prompt** and produces **text**. So "here's a frame, describe it"
or "here's a frame, is anyone wearing a hat?" both work.

What makes it "fast":
- A hybrid vision encoder (**FastViT-HD**) that mixes CNN and Transformer
  blocks and aggressively **downsamples visual tokens** — fewer tokens means
  cheaper attention and faster time-to-first-token.
- It comes in **0.5B, 1.5B, and 7B** sizes. **Use 0.5B** for this project: it's
  the "instant feedback" tier and the only one comfortable for real-time
  browser use on typical laptops.
- It's biased toward **short outputs**, which keeps per-frame latency low —
  perfect for captions and one-line event descriptions.

The model you'll load: **`onnx-community/FastVLM-0.5B-ONNX`**.

## Why "all in the browser" is the interesting part

Three concrete wins you'll be evaluating in your write-up:
- **Zero server cost** — inference is on the client; you host only static files.
- **Privacy by design** — frames from the user's camera/screen never leave the
  device. Nothing is uploaded. This is a genuine, demonstrable property.
- **Real-time interactivity** — no network round-trip per frame; tokens can
  stream straight into the UI.

The trade-offs you'll also be evaluating: the user downloads hundreds of MB of
weights once (then cached), it leans on the user's hardware, and browser
support varies. Honest measurement of both sides is the heart of the project.

Next: `docs/01-environment-setup.md`.
