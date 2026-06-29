/**
 * Brük — Transformers.js Loader
 *
 * The importmap in index.html maps the bare specifier
 *   '@huggingface/transformers'
 * to the correct CDN URL. This file uses that bare specifier —
 * a static string — so browsers never need to evaluate a variable URL.
 *
 * All three modules (translation, speech-input, diet) share this single
 * import so the WASM runtime and model caches are never duplicated.
 */

import {
  pipeline,
  env,
} from '@huggingface/transformers';

// ── Global settings (applied once) ───────────────────────────────
// Allow browser's Cache API to store model weights between sessions.
env.allowLocalModels  = false;
env.useBrowserCache   = true;

// Pipeline cache — keyed by task+model string
const _cache = new Map();

/**
 * Returns a cached pipeline, loading it on first call.
 * @param {string} task  — e.g. 'translation', 'automatic-speech-recognition'
 * @param {string} model — HuggingFace model ID
 * @param {object} [opts] — passed to pipeline()
 * @returns {Promise<Function>}
 */
export async function getPipeline(task, model, opts = {}) {
  const key = `${task}::${model}`;
  if (_cache.has(key)) return _cache.get(key);

  const pipe = await pipeline(task, model, opts);
  _cache.set(key, pipe);
  return pipe;
}

export { env };
