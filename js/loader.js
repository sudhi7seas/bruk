/**
 * Brük — AI Loader (lazy, non-blocking)
 *
 * The Transformers.js library is loaded ONLY when first needed (on translate/mic press),
 * NOT at module parse time. This means the app shell renders instantly.
 *
 * The dynamic import uses a STATIC STRING LITERAL (required for CSP + browser compat).
 * No importmap needed — the CDN URL is right here as a literal.
 */

// Static string literal — browsers and CSP allow dynamic import of a literal URL
const HF_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/dist/transformers.web.js';

let _lib   = null;          // { pipeline, env } once loaded
let _loading = null;        // in-flight Promise (prevents double-load)
const _cache = new Map();   // pipeline cache keyed by 'task::model'

/**
 * Lazily load the Transformers.js library.
 * Safe to call multiple times — returns cached module after first load.
 */
async function loadLib() {
  if (_lib) return _lib;
  if (_loading) return _loading;          // already in flight — wait for it

  _loading = (async () => {
    try {
      // Static string literal import — allowed by CSP and all browsers
      const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2/dist/transformers.web.js');
      mod.env.allowLocalModels = false;
      mod.env.useBrowserCache  = true;    // persist model weights in Cache Storage
      _lib = mod;
      return mod;
    } catch (err) {
      _loading = null;                    // allow retry on next call
      throw new Error(
        'Could not load the AI library from CDN.\n' +
        'Please check your internet connection and try again.\n\n' +
        'Detail: ' + err.message
      );
    }
  })();

  return _loading;
}

/**
 * Get (or create) a cached Transformers.js pipeline.
 * Loads the library if not yet loaded.
 *
 * @param {string}   task    e.g. 'translation'
 * @param {string}   model   HuggingFace model ID
 * @param {object}  [opts]   passed to pipeline()
 * @returns {Promise<Function>}
 */
export async function getPipeline(task, model, opts = {}) {
  const key = `${task}::${model}`;
  if (_cache.has(key)) return _cache.get(key);

  const { pipeline } = await loadLib();
  // Start pipeline load — but don't await before caching the Promise
  // so concurrent callers share the same in-flight load
  const pipePromise = pipeline(task, model, opts);
  _cache.set(key, pipePromise);           // cache the Promise itself

  try {
    const pipe = await pipePromise;
    _cache.set(key, pipe);               // replace Promise with resolved pipeline
    return pipe;
  } catch (err) {
    _cache.delete(key);                  // allow retry on failure
    throw err;
  }
}

/** True if the library is already loaded in memory (no network needed) */
export function isLibLoaded() { return _lib !== null; }
