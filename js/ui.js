/**
 * Brük — UI Module
 * Centralised DOM helpers, toast notifications, and state rendering.
 */

import { CONFIG } from './config.js';

// ── ELEMENT CACHE ────────────────────────────────────────────────
const $ = id => document.getElementById(id);

export const EL = {
  loadingScreen: $('loading-screen'),
  loadingBar: $('loading-bar'),
  loadingStatus: $('loading-status'),
  app: $('app'),

  // Header
  themeToggle: $('theme-toggle'),
  settingsBtn: $('settings-btn'),

  // Tabs
  tabShort: $('tab-short'),
  tabConvo: $('tab-convo'),
  panelShort: $('panel-short'),
  panelConvo: $('panel-convo'),

  // Direction
  dirDeEn: $('dir-de-en'),
  dirAuto: $('dir-auto'),
  dirEnDe: $('dir-en-de'),

  // Input
  inputText: $('input-text'),
  charCount: $('char-count'),
  clearInput: $('clear-input'),
  sourceLangLabel: $('source-lang-label'),

  // Actions
  micBtn: $('mic-btn'),
  cameraBtn: $('camera-btn'),
  translateBtn: $('translate-btn'),

  // Timer
  timerRingWrap: $('timer-ring-wrap'),
  timerProgress: $('timer-progress'),
  timerCount: $('timer-count'),

  // Result
  resultCard: $('result-card'),
  resultText: $('result-text'),
  targetLangLabel: $('target-lang-label'),
  originalText: $('original-text'),
  speakBtn: $('speak-btn'),
  copyBtn: $('copy-btn'),
  dietBadge: $('diet-badge'),
  dietIcon: $('diet-icon'),
  dietLabel: $('diet-label'),

  // Camera
  cameraView: $('camera-view'),
  cameraFeed: $('camera-feed'),
  captureBtn: $('capture-btn'),
  closeCameraBtn: $('close-camera-btn'),
  captureCanvas: $('capture-canvas'),

  // Conversation
  convoLog: $('convo-log'),
  convoDeMic: $('convo-de-mic'),
  convoEnMic: $('convo-en-mic'),
  clearConvoBtn: $('clear-convo-btn'),
  exportConvoBtn: $('export-convo-btn'),

  // Settings
  settingsOverlay: $('settings-overlay'),
  closeSettings: $('close-settings'),
  speechRate: $('speech-rate'),
  speechRateVal: $('speech-rate-val'),
  speechPitch: $('speech-pitch'),
  speechPitchVal: $('speech-pitch-val'),
  autoSpeakToggle: $('auto-speak-toggle'),
  timerDuration: $('timer-duration'),
  preloadModelsBtn: $('preload-models-btn'),
  modelDeEnStatus: $('model-de-en-status'),
  modelEnDeStatus: $('model-en-de-status'),
  modelWhisperStatus: $('model-whisper-status'),

  // Error modal
  errorModal: $('error-modal'),
  errorTitle: $('error-title'),
  errorMessage: $('error-message'),
  errorDismiss: $('error-dismiss'),
  errorRetry: $('error-retry'),

  // Toast
  toastContainer: $('toast-container'),

  // Model loading hint (shown inline during first-use download)
  modelLoadingHint: $('model-loading-hint'),
  modelLoadingText: $('model-loading-text'),
  activeVoiceDe: $('active-voice-de'),
  activeVoiceEn: $('active-voice-en'),
};

// ── LOADING ────────────────────────────────────────────────────────
export function setLoadingProgress(pct, message) {
  EL.loadingBar.style.width = `${Math.min(100, pct)}%`;
  if (message) EL.loadingStatus.textContent = message;
}

export function hideLoadingScreen() {
  EL.loadingScreen.style.transition = 'opacity 0.5s ease';
  EL.loadingScreen.style.opacity = '0';
  setTimeout(() => {
    EL.loadingScreen.classList.add('hidden');
    EL.app.classList.remove('hidden');
  }, 500);
}

// ── THEME ──────────────────────────────────────────────────────────
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]');
  if (meta && theme === 'light') {
    meta.setAttribute('content', '#F0F4FF');
  }
  localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
}

export function getTheme() {
  return localStorage.getItem(CONFIG.STORAGE_KEYS.THEME)
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ── TABS ───────────────────────────────────────────────────────────
export function switchTab(mode) {
  const isShort = mode === 'short';
  EL.tabShort.classList.toggle('active', isShort);
  EL.tabConvo.classList.toggle('active', !isShort);
  EL.tabShort.setAttribute('aria-selected', String(isShort));
  EL.tabConvo.setAttribute('aria-selected', String(!isShort));
  EL.panelShort.classList.toggle('active', isShort);
  EL.panelConvo.classList.toggle('active', !isShort);
  EL.panelShort.classList.toggle('hidden', !isShort);
  EL.panelConvo.classList.toggle('hidden', isShort);
}

// ── DIRECTION ─────────────────────────────────────────────────────
export function setDirection(dir) {
  [EL.dirDeEn, EL.dirAuto, EL.dirEnDe].forEach(btn => {
    const active = btn.dataset.dir === dir;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  const labels = {
    'de-en': { source: 'Deutsch', target: 'English' },
    'en-de': { source: 'English', target: 'Deutsch' },
    'auto':  { source: 'Auto-detect', target: 'Translation' },
  };
  const l = labels[dir] || labels['de-en'];
  EL.sourceLangLabel.textContent = l.source;
  EL.targetLangLabel.textContent = l.target;

  localStorage.setItem(CONFIG.STORAGE_KEYS.DIR_PREFERENCE, dir);
}

// ── RESULT ────────────────────────────────────────────────────────
export function showResult(translation, original, dietResult = null) {
  EL.resultText.textContent = translation;
  EL.originalText.textContent = original;
  EL.resultCard.classList.remove('hidden');

  if (dietResult && dietResult.status !== 'none') {
    const icons = { vegan: '🟢', vegetarian: '🟡', 'non-veg': '🔴', unknown: '⚪' };
    const labels = { vegan: 'Vegan', vegetarian: 'Vegetarian', 'non-veg': 'Non-Vegetarian', unknown: 'Ingredients unclear' };
    EL.dietIcon.textContent = icons[dietResult.status] || '⚪';
    EL.dietLabel.textContent = labels[dietResult.status] || '';
    EL.dietBadge.className = `diet-badge ${dietResult.status}`;
    EL.dietBadge.classList.remove('hidden');
  } else {
    EL.dietBadge.classList.add('hidden');
  }
}

export function hideResult() {
  EL.resultCard.classList.add('hidden');
}

// ── TOAST ─────────────────────────────────────────────────────────
export function showToast(message, type = '', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  EL.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── ERROR MODAL ───────────────────────────────────────────────────
let errorRetryCallback = null;
export function showError(title, message, onRetry = null) {
  EL.errorTitle.textContent = title;
  EL.errorMessage.textContent = message;
  EL.errorModal.classList.remove('hidden');
  errorRetryCallback = onRetry;
  EL.errorRetry.classList.toggle('hidden', !onRetry);
}

export function dismissError() {
  EL.errorModal.classList.add('hidden');
  errorRetryCallback = null;
}

export function getErrorRetryCallback() { return errorRetryCallback; }

// ── MODEL BADGES ──────────────────────────────────────────────────
export function updateModelStatus(model, status) {
  const map = {
    'de-en': EL.modelDeEnStatus,
    'en-de': EL.modelEnDeStatus,
    whisper: EL.modelWhisperStatus,
  };
  const el = map[model];
  if (!el) return;

  const labels = { loaded: 'Ready', loading: 'Loading…', error: 'Error', 'not-loaded': 'Not loaded' };
  el.textContent = labels[status] || status;
  el.className = `model-badge ${status === 'loaded' ? 'loaded' : status === 'loading' ? 'loading' : status === 'error' ? 'error' : ''}`;
}

// ── CHAR COUNT ────────────────────────────────────────────────────
export function updateCharCount(n) {
  EL.charCount.textContent = n;
}

// ── SETTINGS PANEL ────────────────────────────────────────────────
export function openSettings() {
  EL.settingsOverlay.classList.remove('hidden');
  EL.closeSettings.focus();
}
export function closeSettings() {
  EL.settingsOverlay.classList.add('hidden');
}

// ── CONVERSATION BUBBLE ───────────────────────────────────────────
export function addConvoBubble(side, original, translation, onSpeak) {
  // Remove empty state
  const empty = EL.convoLog.querySelector('.convo-empty');
  if (empty) empty.remove();

  const bubble = document.createElement('div');
  bubble.className = `convo-bubble ${side}`;

  const orig = document.createElement('div');
  orig.className = 'bubble-original';
  orig.textContent = original;

  const trans = document.createElement('div');
  trans.className = 'bubble-translation';
  trans.textContent = translation;

  const speakBtn = document.createElement('button');
  speakBtn.className = 'bubble-speaker';
  speakBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Play`;
  speakBtn.addEventListener('click', onSpeak);

  bubble.append(orig, trans, speakBtn);
  EL.convoLog.appendChild(bubble);
  EL.convoLog.scrollTop = EL.convoLog.scrollHeight;
}

export function clearConvoLog() {
  EL.convoLog.innerHTML = '<div class="convo-empty"><p>Tap a mic button to begin the conversation.</p></div>';
}

// ── MODEL LOADING HINT ────────────────────────────────────────────
export function showModelLoadingHint(text) {
  if (!EL.modelLoadingHint) return;
  if (text) EL.modelLoadingText.textContent = text;
  EL.modelLoadingHint.classList.remove('hidden');
}

export function hideModelLoadingHint() {
  EL.modelLoadingHint?.classList.add('hidden');
}

// ── ACTIVE VOICE DISPLAY ───────────────────────────────────────────
export function showActiveVoices({ de, en }) {
  if (EL.activeVoiceDe) {
    EL.activeVoiceDe.textContent = de ? de.name : 'Default device voice';
    EL.activeVoiceDe.className = `model-badge ${de ? 'loaded' : ''}`;
  }
  if (EL.activeVoiceEn) {
    EL.activeVoiceEn.textContent = en ? en.name : 'Default device voice';
    EL.activeVoiceEn.className = `model-badge ${en ? 'loaded' : ''}`;
  }
}
