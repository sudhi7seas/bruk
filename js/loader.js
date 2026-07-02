/**
 * Brük — AI Loader (lazy, official CDN import pattern)
 *
 * v1.4 FIX — confirmed against two independent sources:
 *   1. HuggingFace's own official docs (huggingface.github.io/transformers.js)
 *   2. An independently published, working tutorial (Nov 2025)
 *
 * Both use exactly this pattern, and only this pattern, for bundler-free
 * browser use:
 *
 *   <script type="module">
 *     import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers';
 *   </script>
 *
 * That is a native ES module `import` of a *full URL* — not a bare package
 * name (which needs an importmap) and not a classic <script src> tag
 * (which only works for UMD-style libraries that attach a global variable).
 *
 * v1.3's mistake: it injected the file as a classic <script> tag and
 * expected a `window.Transformers` global. This particular build is an ES
 * module and never attaches anything to `window` — so the script "loaded"
 * successfully (no network error) but the expected global was always
 * going to be missing. That was a wrong assumption on my part, not a CDN
 * or network issue.
 *
 * The fix: use a real dynamic `import()` of the exact URL, matching the
 * officially documented usage byte-for-byte.
 *
 * The import is only triggered on first actual use (translate / mic
 * press) — never at page load — so the app shell still renders instantly
 * regardless of network conditions.
 */

let _lib = null;
let _loading = null;
const _cache = new Map(); // 'task::model' -> pipeline (or in-flight Promise)

async function loadLib() {
  if (_lib) return _lib;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      // Primary: pinned version, exactly as HuggingFace's own docs show it.
      const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      configureEnv(mod.env);
      _lib = mod;
      return mod;
    } catch (primaryErr) {
      // Fallback: unpkg mirror, in case jsdelivr is slow/blocked for this user.
      try {
        const mod = await import('https://unpkg.com/@xenova/transformers@2.17.2');
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

/**
 * v1.5 FIX — the actual cause of "Failed to fetch" during pipeline creation.
 *
 * The main library file loads fine on its own, but internally it needs to
 * fetch a *second* set of files: the ONNX Runtime Web WASM binaries that
 * do the real number-crunching. By default it tries to auto-detect where
 * those live relative to its own script location — and that detection
 * does not work reliably when the main library itself was loaded via a
 * bare dynamic `import()` of a CDN URL (rather than a locally bundled
 * file), which is exactly Brük's setup. The result is a plain,
 * unhelpful "Failed to fetch" once you actually try to translate.
 *
 * This is a widely documented issue (confirmed across multiple official
 * HuggingFace/transformers.js GitHub threads). The fix is to explicitly
 * tell it where those WASM files are, using the *exact* onnxruntime-web
 * version that this specific transformers.js release depends on
 * (1.14.0 for @xenova/transformers@2.17.2 — verified from the package's
 * own published dependency list; using a mismatched version is a
 * separately documented cause of breakage).
 */
function configureEnv(env) {
  env.allowLocalModels = false;
  env.useBrowserCache  = true;

  // Explicit WASM binary location — the actual fix for "Failed to fetch".
  env.backends.onnx.wasm.wasmPaths =
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';

  // Documented ONNX Runtime Web multi-threading bug (see
  // microsoft/onnxruntime#14445) causes intermittent failures on some
  // browsers/devices. Forcing single-threaded WASM is the standard,
  // widely-used workaround — slightly slower, but reliable everywhere.
  env.backends.onnx.wasm.numThreads = 1;
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
