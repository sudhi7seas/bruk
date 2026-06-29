/**
 * Brük — App Configuration
 * Central config for models, endpoints, timeouts, and feature flags.
 */

export const CONFIG = {
  APP_NAME: 'Brük',
  APP_VERSION: '1.0.0',

  // ── MODEL SETTINGS ──────────────────────────────────────────────
  MODELS: {
    TRANSLATION_DE_EN: {
      id: 'Xenova/opus-mt-de-en',
      task: 'translation',
      direction: 'de-en',
      label: 'Translation (DE→EN)',
    },
    TRANSLATION_EN_DE: {
      id: 'Xenova/opus-mt-en-de',
      task: 'translation',
      direction: 'en-de',
      label: 'Translation (EN→DE)',
    },
    WHISPER: {
      id: 'Xenova/whisper-base',
      task: 'automatic-speech-recognition',
      label: 'Speech Recognition',
    },
  },

  // ── TRANSFORMERS.JS CDN ──────────────────────────────────────────
  TRANSFORMERS_CDN: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js',

  // ── VOICE TIMER ──────────────────────────────────────────────────
  VOICE_TIMER_DEFAULT: 15, // seconds
  VOICE_SILENCE_THRESHOLD: 2000, // ms — stop after silence

  // ── TRANSLATION LIMITS ───────────────────────────────────────────
  MAX_INPUT_CHARS: 2000,
  MAX_TRANSLATION_TOKENS: 512,

  // ── TTS DEFAULTS ─────────────────────────────────────────────────
  TTS: {
    DEFAULT_RATE: 1.0,
    DEFAULT_PITCH: 1.0,
    DE_LANG: 'de-DE',
    EN_LANG: 'en-GB',
  },

  // ── LANGUAGE DETECTION ───────────────────────────────────────────
  DE_CHARS: /[äöüßÄÖÜ]/,
  DE_WORDS: /\b(der|die|das|und|ist|nicht|ich|sie|er|wir|haben|sein|mit|auf|für|von|den|dem|des|ein|eine|einen|einem|einer|auch|an|bei|nach|zu|aus|als|vor|über|durch|bis|um|an)\b/i,

  // ── CAMERA ───────────────────────────────────────────────────────
  CAMERA_FACINGMODE: 'environment',
  TESSERACT_CDN: 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js',

  // ── CSP / SECURITY ───────────────────────────────────────────────
  // Allowed model hosts (used for fetch validation in sw.js)
  ALLOWED_MODEL_HOSTS: [
    'huggingface.co',
    'cdn-lfs.huggingface.co',
    'cdn-lfs-us-1.huggingface.co',
    'cdn.jsdelivr.net',
    'unpkg.com',
  ],

  // ── DIET DETECTION ───────────────────────────────────────────────
  // Full keyword lists are loaded from data/diet-keywords.json
  DIET_DATA_PATH: './data/diet-keywords.json',

  // ── STORAGE KEYS ─────────────────────────────────────────────────
  STORAGE_KEYS: {
    THEME: 'bruk_theme',
    TTS_RATE: 'bruk_tts_rate',
    TTS_PITCH: 'bruk_tts_pitch',
    AUTO_SPEAK: 'bruk_auto_speak',
    TIMER_DURATION: 'bruk_timer_duration',
    DIR_PREFERENCE: 'bruk_dir',
  },
};

export default CONFIG;
