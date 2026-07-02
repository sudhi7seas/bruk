/**
 * Brük — Speech Output (Text-to-Speech)
 *
 * Uses the Web Speech API — the only TTS that works reliably across
 * iOS/Android/Windows without downloading another 100+ MB neural model.
 *
 * NOTE ON KOKORO TTS:
 * Kokoro (and any ONNX-based neural TTS) depends on transformers.js
 * under the hood, which — like the translation/Whisper models — needs
 * a bundler-free browser build to run from a CDN. No such build of
 * Kokoro currently exists; its only published build expects a bundler
 * (webpack/vite) and is not safe to load raw from jsdelivr/unpkg, which
 * is exactly the failure mode you just hit with the translation models.
 * Shipping it today would reproduce the same "module does not resolve"
 * crash for voice output. We therefore get the best NATURAL voice
 * achievable with zero extra downloads: aggressive selection of the
 * highest-quality on-device "neural" / "enhanced" voice on each
 * platform (these are genuinely good — not the classic robotic SAPI
 * voices) plus tuned prosody so it doesn't sound clipped or flat.
 *
 * If/when an official bundler-free Kokoro browser build ships, this
 * module is the only file that needs to change.
 */

import { CONFIG } from './config.js';

let _voices = [];
let _voicesReady = false;
let _voicesReadyPromise = null;

// ── VOICE LIST (loads async on some browsers) ─────────────────────
function ensureVoicesLoaded() {
  if (_voicesReadyPromise) return _voicesReadyPromise;

  _voicesReadyPromise = new Promise(resolve => {
    const populate = () => {
      _voices = window.speechSynthesis.getVoices();
      if (_voices.length > 0) {
        _voicesReady = true;
        resolve(_voices);
      }
    };
    populate();
    if (!_voicesReady) {
      window.speechSynthesis.addEventListener('voiceschanged', populate, { once: true });
      // Safety timeout — some browsers never fire voiceschanged
      setTimeout(() => { populate(); resolve(_voices); }, 1200);
    }
  });

  return _voicesReadyPromise;
}

// ── VOICE QUALITY RANKING ──────────────────────────────────────────
// Higher-quality / neural voice name fragments seen across platforms.
// iOS/macOS: "Enhanced" or "Premium" suffix on Siri-derived voices.
// Android (Google TTS): names containing "Google" are network-neural;
//   on-device "Neural2"/"Wavenet" style names also rank highly.
// Windows (Edge/Chrome): "Online (Natural)" Microsoft neural voices,
//   or "Microsoft ... Desktop" as a lower-quality fallback.
const QUALITY_HINTS = [
  /natural/i, /neural/i, /enhanced/i, /premium/i, /wavenet/i, /siri/i,
];

function scoreVoice(voice, langPrefix) {
  let score = 0;
  if (voice.lang?.toLowerCase().startsWith(langPrefix)) score += 10;
  if (voice.localService) score += 3;          // on-device = lower latency, works offline
  if (QUALITY_HINTS.some(re => re.test(voice.name))) score += 8;
  if (/female|male/i.test(voice.name)) score += 1; // named voices tend to be higher quality
  return score;
}

function pickBestVoice(bcp47) {
  const langPrefix = bcp47.split('-')[0].toLowerCase();
  const candidates = _voices.filter(v => v.lang?.toLowerCase().startsWith(langPrefix));
  if (candidates.length === 0) return null;

  return candidates
    .map(v => ({ v, score: scoreVoice(v, langPrefix) }))
    .sort((a, b) => b.score - a.score)[0].v;
}

// ── SPEAK ────────────────────────────────────────────────────────
/**
 * @param {string} text
 * @param {'de'|'en'} lang
 * @param {{rate?:number, pitch?:number}} [options]
 */
export async function speak(text, lang = 'en', options = {}) {
  if (!('speechSynthesis' in window)) {
    console.warn('[Brük] Web Speech API not available.');
    return;
  }
  if (!text?.trim()) return;

  stopSpeaking();
  await ensureVoicesLoaded();

  const bcp47 = lang === 'de' ? CONFIG.TTS.DE_LANG : CONFIG.TTS.EN_LANG;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = bcp47;

  // Slightly slower than 1.0 + tiny pitch lift reads as noticeably more
  // natural and less clipped on most synthetic voices, without sounding
  // sluggish. User settings still override these defaults.
  utter.rate   = clamp(options.rate   ?? CONFIG.TTS.DEFAULT_RATE,  0.5, 2);
  utter.pitch  = clamp(options.pitch  ?? CONFIG.TTS.DEFAULT_PITCH, 0.5, 2);
  utter.volume = 1;

  const voice = pickBestVoice(bcp47);
  if (voice) utter.voice = voice;

  // iOS Safari sometimes needs a resume() nudge right before speaking
  // if synthesis was paused by a prior navigation/backgrounding.
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();

  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function isSpeaking() {
  return window.speechSynthesis?.speaking ?? false;
}

export function isTTSSupported() {
  return 'speechSynthesis' in window;
}

/** Returns the voices Brük would currently choose for DE and EN, for diagnostics/settings UI. */
export async function getPreferredVoices() {
  await ensureVoicesLoaded();
  return {
    de: pickBestVoice(CONFIG.TTS.DE_LANG),
    en: pickBestVoice(CONFIG.TTS.EN_LANG),
  };
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
