// worker.js — runs FastVLM off the main thread.
// Loads the model once, then processes one frame at a time, dropping frames
// that arrive while busy so latency stays bounded. See docs/02 Stage 1.

import {
  AutoProcessor,
  AutoModelForImageTextToText,
  RawImage,
  TextStreamer,
} from "@huggingface/transformers";

const MODEL_ID = "onnx-community/FastVLM-0.5B-ONNX";

let processor = null;
let model = null;
let busy = false;

async function ensureLoaded() {
  if (model) return;
  const t0 = performance.now();

  processor = await AutoProcessor.from_pretrained(MODEL_ID);
  model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
    // Per-module dtypes: small + fast. Bump vision_encoder/decoder to "fp16"
    // for higher quality at the cost of size/speed (a good thing to benchmark).
    device: "webgpu", f
    dtype: {
      embed_tokens: "fp16",
      vision_encoder: "q4",
      decoder_model_merged: "q4",
    },
    progress_callback: (e) => {
      if (e.status === "progress") {
        self.postMessage({
          type: "load-progress",
          file: e.file,
          progress: e.progress ?? 0,
        });
      }
    },
  });

  const loadMs = performance.now() - t0;
  self.postMessage({ type: "loaded", loadMs });
}

async function runFrame({ image, prompt, maxTokens }) {
  // image arrives as an ImageBitmap (transferred, zero-copy).
  const raw = await RawImage.fromBlob(
    await bitmapToBlob(image)
  );

  const messages = [{ role: "user", content: prompt }];
  const text = processor.apply_chat_template(messages, {
    add_generation_prompt: true,
  });
  const inputs = await processor(raw, text, { add_special_tokens: false });

  const t0 = performance.now();
  let ttftMs = null;
  let tokenCount = 0;
  let outText = "";

  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t) => {
      if (ttftMs === null) ttftMs = performance.now() - t0;
      tokenCount += 1;
      outText += t;
      self.postMessage({ type: "token", token: t });
    },
  });

  await model.generate({
    ...inputs,
    max_new_tokens: maxTokens ?? 32,
    do_sample: false,
    streamer,
  });

  const totalMs = performance.now() - t0;
  self.postMessage({
    type: "result",
    text: outText.trim(),
    metrics: { ttftMs, totalMs, tokens: tokenCount },
  });
}

// createImageBitmap can't be re-read directly by RawImage in all builds, so
// route through an OffscreenCanvas → Blob. Cheap and reliable.
async function bitmapToBlob(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return await canvas.convertToBlob({ type: "image/png" });
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "load") {
    try {
      await ensureLoaded();
    } catch (err) {
      self.postMessage({ type: "error", where: "load", message: String(err) });
    }
    return;
  }

  if (msg.type === "frame") {
    if (!model) {
      self.postMessage({ type: "dropped", reason: "not-loaded" });
      return;
    }
    if (busy) {
      self.postMessage({ type: "dropped", reason: "busy" });
      return;
    }
    busy = true;
    try {
      await runFrame(msg);
    } catch (err) {
      self.postMessage({ type: "error", where: "frame", message: String(err) });
    } finally {
      busy = false;
    }
  }
};
