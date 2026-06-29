/**
 * Brük — Speech Output Module
 * Web Speech API TTS — device built-in voices, no download.
 */

import { CONFIG } from './config.js';

let currentUtterance = null;

// ── SPEAK ────────────────────────────────────────────────────────
/**
 * @param {string} text
 * @param {'de'|'en'} lang
 * @param {{ rate?: number, pitch?: number }} options
 */
export function speak(text, lang = 'en', options = {}) {
  if (!('speechSynthesis' in window)) {
    console.warn('Brük: Web Speech API TTS not available.');
    return;
  }

  // Cancel any current speech
  stopSpeaking();

  const bcp47 = lang === 'de' ? CONFIG.TTS.DE_LANG : CONFIG.TTS.EN_LANG;
  const rate = clamp(options.rate ?? CONFIG.TTS.DEFAULT_RATE, 0.5, 2);
  const pitch = clamp(options.pitch ?? CONFIG.TTS.DEFAULT_PITCH, 0.5, 2);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = bcp47;
  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = 1;

  // Pick best available voice
  const voice = getBestVoice(bcp47);
  if (voice) utterance.voice = voice;

  currentUtterance = utterance;

  // iOS Safari workaround: must call inside user gesture context
  // (already guaranteed since this is triggered by button click)
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}

export function isSpeaking() {
  return window.speechSynthesis?.speaking ?? false;
}

// ── VOICE SELECTION ───────────────────────────────────────────────
function getBestVoice(bcp47Prefix) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Try exact lang match first, then prefix match
  return (
    voices.find(v => v.lang === bcp47Prefix && v.localService) ||
    voices.find(v => v.lang.startsWith(bcp47Prefix.split('-')[0]) && v.localService) ||
    voices.find(v => v.lang === bcp47Prefix) ||
    voices.find(v => v.lang.startsWith(bcp47Prefix.split('-')[0])) ||
    null
  );
}

// Voices may load asynchronously
export function getAvailableVoices(lang) {
  const bcp47 = lang === 'de' ? CONFIG.TTS.DE_LANG : CONFIG.TTS.EN_LANG;
  const all = window.speechSynthesis.getVoices();
  return all.filter(v => v.lang.startsWith(bcp47.split('-')[0]));
}

export function isTTSSupported() {
  return 'speechSynthesis' in window;
}

// ── HELPERS ───────────────────────────────────────────────────────
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
