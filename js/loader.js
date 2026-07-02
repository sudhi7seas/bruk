/**
 * Brük — AI Loader (lazy, script-tag based, bundler-free)
 *
 * CRITICAL FIX (v1.3):
 * The npm ESM build of transformers.js (both @xenova and @huggingface
 * packages) contains bare imports like `import 'onnxruntime-common'`
 * that only resolve inside a bundler (webpack/vite). Loaded raw in a
 * browser, that throws: "Module name does not resolve to a valid URL".
 *
 * The fix: use the prebuilt, self-contained IIFE bundle
 * (dist/transformers.min.js) injected via a classic <script> tag.
 * That bundle has everything inlined — no bare specifiers, no bundler
 * needed. It attaches itself to `window.Transformers`.
 *
 * The library is only fetched the first time the user actually
 * translates or records — never at page load — so the app shell is
 * instant regardless of network conditions.
 */

const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
const SCRIPT_URL_FALLBACK = 'https://unpkg.com/@xenova/transformers@2.17.2/dist/transformers.min.js';

let _lib = null;
let _loading = null;
const _cache = new Map(); // 'task::model' -> pipeline (or in-flight Promise)

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-bruk-lib="transformers"]`);
    if (existing) { resolve(); return; }

    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.brukLib = 'transformers';
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error(`Failed to load script: ${src}`)); };
    document.head.appendChild(s);
  });
}

async function loadLib() {
  if (_lib) return _lib;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      try {
        await injectScript(SCRIPT_URL);
      } catch {
        // Primary CDN failed — try the mirror
        await injectScript(SCRIPT_URL_FALLBACK);
      }

      // The IIFE bundle attaches itself as window.Transformers
      const ns = window.Transformers;
      if (!ns || typeof ns.pipeline !== 'function') {
        throw new Error('Library loaded but window.Transformers.pipeline is missing.');
      }

      ns.env.allowLocalModels = false;
      ns.env.useBrowserCache  = true;

      _lib = ns;
      return ns;
    } catch (err) {
      _loading = null; // allow retry
      throw new Error(
        'Could not load the translation engine from the CDN.\n' +
        'Please check your internet connection and try again.\n\n' +
        'Detail: ' + err.message
      );
    }
  })();

  return _loading;
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
