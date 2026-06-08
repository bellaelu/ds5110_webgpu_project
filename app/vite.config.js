import { defineConfig } from "vite";

// COOP/COEP make the page cross-origin isolated, which is required for
// performance.measureUserAgentSpecificMemory() and for WASM multi-threading
// (the fallback path). See docs/01-environment-setup.md, Step 4.
export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // The transformers package ships large wasm/ort assets; let it resolve at
  // runtime instead of having Vite pre-bundle it.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  worker: { format: "es" },
});
