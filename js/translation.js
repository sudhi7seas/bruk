/**
 * Brük — Translation Module
 * Helsinki-NLP Opus-MT via @huggingface/transformers v4.x, loaded as a
 * native ES module import from a CDN (see loader.js for the exact
 * mechanism and why it's built this way).
 * Models are ~75 MB each; cached in browser after first download.
 */

import { CONFIG } from './config.js';
import { updateModelStatus } from './ui.js';
import { getPipeline } from './loader.js';

// ── LOAD / CACHE A PIPELINE ───────────────────────────────────────
async function loadPipeline(direction, onProgress) {
  const cfg = direction === 'de-en'
    ? CONFIG.MODELS.TRANSLATION_DE_EN
    : CONFIG.MODELS.TRANSLATION_EN_DE;

  updateModelStatus(direction, 'loading');
  try {
    const pipe = await getPipeline(cfg.task, cfg.id, {
      progress_callback: (info) => {
        if (info.status === 'progress' && onProgress) {
          onProgress(info.file, Math.round(info.progress ?? 0));
        }
      },
    });
    updateModelStatus(direction, 'loaded');
    return pipe;
  } catch (err) {
    updateModelStatus(direction, 'error');
    throw new TranslationError(
      `Could not load the ${direction} model.\n\n` +
      `This requires a Wi-Fi connection on first run (~75 MB).\n\n` +
      `Detail: ${err.message}`,
      err
    );
  }
}

// ── LANGUAGE DETECTION ────────────────────────────────────────────
export function detectLanguage(text) {
  if (!text?.trim()) return 'de';
  if (CONFIG.DE_CHARS.test(text)) return 'de';
  const words = text.split(/\s+/).length;
  const hits  = (text.match(CONFIG.DE_WORDS) || []).length;
  return hits / words > 0.15 ? 'de' : 'en';
}

// ── TRANSLATE ────────────────────────────────────────────────────
/**
 * @param {string} text
 * @param {'de-en'|'en-de'|'auto'} direction
 * @param {(file:string, pct:number)=>void} [onProgress]
 * @returns {Promise<{translation:string, detectedDir:string}>}
 */
export async function translate(text, direction = 'de-en', onProgress) {
  if (!text?.trim()) throw new TranslationError('Please enter some text to translate.');

  const clean = sanitise(text);
  let dir = direction;
  if (dir === 'auto') dir = detectLanguage(clean) === 'de' ? 'de-en' : 'en-de';

  const pipe = await loadPipeline(dir, onProgress);

  try {
    const output = await pipe(clean, { max_new_tokens: CONFIG.MAX_TRANSLATION_TOKENS });
    const raw = Array.isArray(output) ? output[0] : output;
    const translation = (raw?.translation_text ?? String(raw)).trim();

    if (!translation) throw new TranslationError('The model returned an empty result. Please try again.');
    return { translation, detectedDir: dir };
  } catch (err) {
    if (err instanceof TranslationError) throw err;
    throw new TranslationError(`Translation error: ${err.message}`, err);
  }
}

// ── PRELOAD BOTH MODELS ───────────────────────────────────────────
export async function preloadTranslationModels(onProgress) {
  return Promise.allSettled([
    loadPipeline('de-en', (f, p) => onProgress?.('de-en', f, p)),
    loadPipeline('en-de', (f, p) => onProgress?.('en-de', f, p)),
  ]);
}

// ── HELPERS ───────────────────────────────────────────────────────
function sanitise(text) {
  return text.trim()
    .slice(0, CONFIG.MAX_INPUT_CHARS)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

export class TranslationError extends Error {
  constructor(msg, cause) { super(msg); this.name = 'TranslationError'; if (cause) this.cause = cause; }
}
