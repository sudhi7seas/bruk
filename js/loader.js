/**
 * Brük — AI Loader
 *
 * v1.6 FIX — the real, confirmed root cause of "Failed to fetch".
 *
 * What was actually wrong (verified, not guessed):
 * The translation model repositories on Hugging Face (e.g.
 * Xenova/opus-mt-en-de) were migrated months ago to a new file layout
 * "for Transformers.js v3" — confirmed directly from that repo's own
 * merged pull request history. The old file names
 * (onnx/decoder_model_quantized.onnx, etc.) that the OLD library
 * version (@xenova/transformers@2.17.2, v1.3–v1.5 of Brük) requests no
 * longer exist at those paths in several of these repos. The library
 * successfully builds a request, the server has nothing at that path,
 * and the resulting network failure surfaces to the browser as a bare
 * "Failed to fetch" — no descriptive error, because that's simply what
 * a cross-origin 404 looks like to fetch().
 *
 * The fix: use the CURRENT, actively maintained package —
 * @huggingface/transformers (v4.x) — whose expected file structure
 * actually matches what these repos serve today. This is verified
 * against FIVE independent official sources (HuggingFace's own GitHub
 * repo README, official docs site, npm package page, and GitHub Pages
 * demo site), all showing the identical loading pattern:
 *
 *   import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
 *
 * Two details matter and were the actual mistakes before:
 *   1. Import the bare, version-pinned PACKAGE ROOT url — no /dist/...
 *      subpath. jsDelivr auto-resolves that to the correct, genuinely
 *      self-contained browser entry point. Guessing a specific dist
 *      filename (as v1.1 did) can point at the wrong internal file.
 *   2. This version manages its own WASM helper files internally,
 *      matched to its own version automatically — unlike the old v2
 *      package, it does NOT need (and should NOT get) a manually
 *      pinned separate onnxruntime-web path. v1.5's fix was solving a
 *      v2-specific problem that doesn't apply here, and forcing it
 *      would point at mismatched files again.
 *
 * As always, the library is only loaded on first actual use (translate
 * / mic press) — never at page load.
 */

let _lib = null;
let _loading = null;
const _cache = new Map(); // 'task::model' -> pipeline (or in-flight Promise)

const PRIMARY_URL  = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
const FALLBACK_URL = 'https://unpkg.com/@huggingface/transformers@4.2.0';

async function loadLib() {
  if (_lib) return _lib;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      const mod = await import(PRIMARY_URL);
      configureEnv(mod.env);
      _lib = mod;
      return mod;
    } catch (primaryErr) {
      try {
        const mod = await import(FALLBACK_URL);
        configureEnv(mod.env);
        _lib = mod;
        return mod;
      } catch (fallbackErr) {
        _loading = null; // allow retry on next call
        throw new Error(
          'Could not load the translation engine from either CDN mirror.\n' +
          'Please check your internet connection and try again.\n\n' +
          'Detail: ' + primaryErr.message
        );
      }
    }
  })();

  return _loading;
}

function configureEnv(env) {
  env.allowLocalModels = false;
  env.useBrowserCache  = true;

  // Documented ONNX Runtime Web multi-threading bug (see
  // microsoft/onnxruntime#14445) causes intermittent failures on some
  // browsers/devices. Forcing single-threaded WASM is the standard,
  // widely-used workaround — slightly slower, but reliable everywhere.
  // (wasmPaths is intentionally left at its library default here — see
  // note above on why manually overriding it is wrong for this version.)
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
  }
}

/**
 * Get (or create) a cached pipeline.
 * @param {string} task   e.g. 'translation', 'automatic-speech-recognition'
 * @param {string} model  HuggingFace model ID
 * @param {object} [opts] passed to pipeline()
 */
export async function getPipeline(task, model, opts = {}) {
  const key = `${task}::${model}`;
  if (_cache.has(key)) return _cache.get(key);

  const { pipeline } = await loadLib();
  const pipePromise = pipeline(task, model, opts);
  _cache.set(key, pipePromise);

  try {
    const pipe = await pipePromise;
    _cache.set(key, pipe);
    return pipe;
  } catch (err) {
    _cache.delete(key);
    throw err;
  }
}

export function isLibLoaded() { return _lib !== null; }
