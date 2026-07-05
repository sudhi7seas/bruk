/**
 * Brük — Central Configuration
 */

export const CONFIG = {
  APP_NAME:    'Brük',
  APP_VERSION: '1.9.1',

  // ── MODEL IDs ────────────────────────────────────────────────────
  // Loaded via @huggingface/transformers v4.x (see loader.js). Model
  // IDs themselves are unchanged from the original Xenova namespace —
  // only the JS library version that fetches them changed.
  //
  // `dtype: 'q8'` is explicit and deliberate, not a default we fell
  // into: some repos' default dtype selection resolves to a 4-bit
  // ("N-bit" block-quantized) ONNX variant, which has a known ONNX
  // Runtime Web compatibility bug (missing scale tensors for
  // MatMulNBits/QDQ nodes — "Can't create a session" at pipeline
  // creation time). `q8` uses a structurally different, non-N-bit
  // int8 quantization scheme that cannot hit that specific bug, while
  // staying close to the original ~75 MB download size. `loader.js`
  // additionally retries with `fp32` automatically if `q8` itself
  // ever fails to load for a given model, as a safety net.
  MODELS: {
    TRANSLATION_DE_EN: {
      id:    'Xenova/opus-mt-de-en',
      task:  'translation',
      label: 'Translation (DE→EN)',
      dir:   'de-en',
      dtype: 'q8',
    },
    TRANSLATION_EN_DE: {
      id:    'Xenova/opus-mt-en-de',
      task:  'translation',
      label: 'Translation (EN→DE)',
      dir:   'en-de',
      dtype: 'q8',
    },
    WHISPER: {
      id:    'Xenova/whisper-base',
      task:  'automatic-speech-recognition',
      label: 'Speech Recognition',
      dtype: 'q8',
    },
  },

  // Fallback dtype used automatically if a model's preferred dtype
  // above fails to create a session (see loader.js). Full precision
  // has the best chance of existing for any properly converted model,
  // since it never uses N-bit block quantization.
  FALLBACK_DTYPE: 'fp32',

  // ── LIMITS ──────────────────────────────────────────────────────
  MAX_INPUT_CHARS:       2000,
  MAX_TRANSLATION_TOKENS: 512,
  VOICE_TIMER_DEFAULT:    15,   // seconds

  // ── TTS ──────────────────────────────────────────────────────────
  TTS: {
    DEFAULT_RATE:  1.0,
    DEFAULT_PITCH: 1.0,
    DE_LANG: 'de-DE',
    EN_LANG: 'en-GB',
  },

  // ── LANGUAGE DETECTION ───────────────────────────────────────────
  DE_CHARS: /[äöüßÄÖÜ]/,
  DE_WORDS: /\b(der|die|das|und|ist|nicht|ich|sie|er|wir|haben|sein|mit|auf|für|von|den|dem|des|ein|eine|einen|einem|einer|auch|bei|nach|zu|aus|als|vor|durch|bis)\b/i,

  // ── STORAGE KEYS ────────────────────────────────────────────────
  STORAGE_KEYS: {
    THEME:          'bruk_theme',
    TTS_RATE:       'bruk_tts_rate',
    TTS_PITCH:      'bruk_tts_pitch',
    AUTO_SPEAK:     'bruk_auto_speak',
    TIMER_DURATION: 'bruk_timer_duration',
    DIR_PREFERENCE: 'bruk_dir',
  },

  // ── CAMERA / OCR ─────────────────────────────────────────────────
  TESSERACT_CDN: 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js',

  // ── DIET DETECTION ───────────────────────────────────────────────
  DIET_DATA_PATH: './data/diet-keywords.json',
};

export default CONFIG;
