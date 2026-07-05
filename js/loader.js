/**
 * Brük — AI Loader
 *
 * v1.10 FIX — reverted library package based on verified evidence
 * (see docs/REQUIREMENTS.md SWR-1.1 revised, docs/TRACEABILITY.md D-1).
 *
 * Summary of what changed and why:
 * v1.6 switched from `@xenova/transformers` to `@huggingface/transformers`
 * v4.x, based on an inference (not a confirmed failure) that Hugging
 * Face's file-structure migration for v3 would break the old package.
 * v1.9 then added an explicit `dtype: 'q8'` to work around a session-
 * creation error — but that error recurred identically afterward.
 *
 * Investigating further surfaced two pieces of first-party evidence
 * that point the other way:
 *   1. A documented GitHub issue on the official transformers.js repo
 *      (huggingface/transformers.js#1127, "BROKEN examples/demo-site")
 *      reporting that migrating example code from `@xenova/transformers`
 *      to `@huggingface/transformers` v3.x caused several previously-
 *      working models to break or become unreliable.
 *   2. A community discussion thread on `Xenova/opus-mt-en-es` (the
 *      same model family/architecture as Brük's translation models,
 *      converted by the same process) showing a plain
 *      `pipeline('translation', 'Xenova/opus-mt-en-es')` call — no
 *      dtype specified — working correctly with `@xenova/transformers`.
 *
 * `@xenova/transformers@2.17.2` was already confirmed (Brük v1.4) to
 * load correctly as a bundler-free ES module import in this exact
 * deployment environment. This revision reverts to that package, and
 * deliberately does NOT force any `dtype` — letting the library's own,
 * presumably better-tested default selection run for these specific
 * models, rather than continuing to guess which explicit dtype is safe.
 *
 * Honest limit: this is backed by strong circumstantial and first-party
 * evidence, not by an actual browser test run against the real models
 * by either the assistant or the user. See docs/TRACEABILITY.md
 * Level 5 for the explicit statement of what remains to be confirmed.
 *
 * The library is only loaded on first actual use (translate / mic
 * press) — never at page load.
 */

let _lib = null;
let _loading = null;
const _cache = new Map(); // 'task::model::dtype' -> pipeline (or in-flight Promise)

const PRIMARY_URL  = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
const FALLBACK_URL = 'https://unpkg.com/@xenova/transformers@2.17.2';

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
  // browsers/devices. Forcing single-threaded WASM is a standard,
  // widely-used workaround — slightly slower, but reliable everywhere.
  // This is independent of the package/dtype decision above and is
  // retained from the previous revision.
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
  }
}

/**
 * Get (or create) a cached pipeline.
 *
 * No `dtype` is forced by default (see file header) — `opts.dtype` is
 * only applied if a caller explicitly provides one. `fallbackDtype`
 * remains as a defensive safety net: if the (default or explicit)
 * attempt fails with what looks like a session-creation error, this
 * retries once with `fallbackDtype` before giving up.
 *
 * Diagnostic fix (this revision): if the fallback retry *also* fails,
 * the error thrown now includes BOTH the original and the retry's
 * error message, clearly labeled — the previous version let the retry's
 * error silently overwrite the original, making it impossible to tell
 * from the outside whether the retry had even run. This was a real gap
 * identified during review, independent of the package/dtype change.
 *
 * @param {string} task            e.g. 'translation', 'automatic-speech-recognition'
 * @param {string} model           HuggingFace model ID
 * @param {object} [opts]          passed to pipeline(); opts.dtype is only used if explicitly set
 * @param {string} [fallbackDtype] retried automatically if the first attempt fails
 *                                 to create a session (e.g. 'fp32')
 */
export async function getPipeline(task, model, opts = {}, fallbackDtype = null) {
  const key = `${task}::${model}::${opts.dtype ?? 'default'}`;
  if (_cache.has(key)) return _cache.get(key);

  const { pipeline } = await loadLib();

  const attempt = (dtype) => pipeline(task, model, dtype ? { ...opts, dtype } : opts);

  const pipePromise = (async () => {
    try {
      return await attempt(opts.dtype);
    } catch (firstErr) {
      const looksLikeSessionFailure =
        /can'?t create a session|session creation|matmulnbits|missing required scale/i.test(firstErr?.message ?? '');

      if (looksLikeSessionFailure && fallbackDtype && opts.dtype !== fallbackDtype) {
        console.warn(
          `[Brük] Default load failed to create a session for ${model} — ` +
          `retrying automatically with dtype='${fallbackDtype}'.`, firstErr.message
        );
        try {
          return await attempt(fallbackDtype);
        } catch (retryErr) {
          // Preserve BOTH errors — do not let the retry's error silently
          // replace the original, so a real failure here is fully
          // diagnosable rather than ambiguous.
          throw new Error(
            `Both the default load and the '${fallbackDtype}' fallback failed for ${model}.\n\n` +
            `First attempt error: ${firstErr.message}\n\n` +
            `Fallback attempt error: ${retryErr.message}`
          );
        }
      }
      throw firstErr;
    }
  })();

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
