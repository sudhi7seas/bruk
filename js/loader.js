/**
 * Brük — Transformers.js Loader
 * Single shared import of @xenova/transformers so all modules share the
 * same pipeline cache and WASM context.
 *
 * Using a top-level await import means the CDN URL is fixed at parse time.
 * The SW will cache the CDN script after first load.
 */

const TRANSFORMERS_CDN =
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

let _mod = null;

export async function getTransformers() {
  if (_mod) return _mod;
  try {
    _mod = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
    // Enable browser cache for model weights
    _mod.env.allowLocalModels = false;
    _mod.env.useBrowserCache = true;
    return _mod;
  } catch (err) {
    throw new Error(
      'Could not load the AI library. Please check your internet connection and try again. ' +
      '(Models only need to download once.)\n\nDetails: ' + err.message
    );
  }
}
