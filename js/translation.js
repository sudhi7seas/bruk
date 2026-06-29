/**
 * Brük — Translation Module
 * Helsinki-NLP Opus-MT via Transformers.js (fully offline after first load).
 */

import { CONFIG } from './config.js';
import { updateModelStatus } from './ui.js';
import { getTransformers } from './loader.js';

const _pipelines = {};

// ── LOAD A TRANSLATION PIPELINE ──────────────────────────────────
async function loadPipeline(direction, onProgress) {
  if (_pipelines[direction]) return _pipelines[direction];

  const modelId = direction === 'de-en'
    ? CONFIG.MODELS.TRANSLATION_DE_EN.id
    : CONFIG.MODELS.TRANSLATION_EN_DE.id;

  updateModelStatus(direction, 'loading');
  try {
    const { pipeline } = await getTransformers();

    const pipe = await pipeline('translation', modelId, {
      progress_callback: (info) => {
        if (info.status === 'progress' && onProgress) {
          onProgress(info.file, Math.round(info.progress ?? 0));
        }
      },
    });

    _pipelines[direction] = pipe;
    updateModelStatus(direction, 'loaded');
    return pipe;
  } catch (err) {
    updateModelStatus(direction, 'error');
    throw new TranslationError(
      `Could not load the ${direction} translation model. ` +
      `On first run this requires a Wi-Fi connection (~75 MB per model).\n\n` +
      `Details: ${err.message}`,
      err
    );
  }
}

// ── LANGUAGE DETECTION ────────────────────────────────────────────
export function detectLanguage(text) {
  if (!text || !text.trim()) return 'de';
  if (CONFIG.DE_CHARS.test(text)) return 'de';
  const words     = text.split(/\s+/).length;
  const deMatches = (text.match(CONFIG.DE_WORDS) || []).length;
  return deMatches / words > 0.15 ? 'de' : 'en';
}

// ── TRANSLATE ────────────────────────────────────────────────────
/**
 * @param {string} text
 * @param {'de-en'|'en-de'|'auto'} direction
 * @param {Function} [onProgress]  called with (file, pct)
 * @returns {{ translation: string, detectedDir: string }}
 */
export async function translate(text, direction = 'de-en', onProgress) {
  if (!text || !text.trim()) throw new TranslationError('Nothing to translate.');

  const clean = sanitise(text);

  let resolvedDir = direction;
  if (direction === 'auto') {
    resolvedDir = detectLanguage(clean) === 'de' ? 'de-en' : 'en-de';
  }

  const pipe = await loadPipeline(resolvedDir, onProgress);

  try {
    const result = await pipe(clean, { max_new_tokens: CONFIG.MAX_TRANSLATION_TOKENS });
    const raw = Array.isArray(result) ? result[0] : result;
    const translation = (raw?.translation_text ?? String(raw)).trim();

    if (!translation) throw new TranslationError('Translation returned an empty result. Please try again.');
    return { translation, detectedDir: resolvedDir };
  } catch (err) {
    if (err instanceof TranslationError) throw err;
    throw new TranslationError(`Translation failed: ${err.message}`, err);
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
  return text
    .trim()
    .slice(0, CONFIG.MAX_INPUT_CHARS)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

export class TranslationError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'TranslationError';
    if (cause) this.cause = cause;
  }
}
