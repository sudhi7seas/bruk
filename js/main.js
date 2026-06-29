/**
 * Brük — App Orchestration
 * Wires up all modules; handles every user interaction.
 */

import { CONFIG } from './config.js';
import {
  EL,
  setLoadingProgress, hideLoadingScreen,
  applyTheme, getTheme, toggleTheme,
  switchTab, setDirection,
  showResult, hideResult,
  showToast, showError, dismissError, getErrorRetryCallback,
  openSettings, closeSettings as _closeSettings,
  updateCharCount, addConvoBubble, clearConvoLog,
  updateModelStatus,
} from './ui.js';
import { translate, detectLanguage, preloadTranslationModels, TranslationError } from './translation.js';
import {
  startRecording, stopRecording,
  transcribe, isWebSpeechAvailable, transcribeWithWebSpeech,
  preloadWhisper, SpeechError,
} from './speech-input.js';
import { speak, stopSpeaking } from './speech-output.js';
import { openCamera, closeCamera, captureAndOCR, CameraError } from './camera.js';
import { detectDiet } from './diet.js';
import { startTimer, clearTimer } from './timer.js';

// ── STATE ─────────────────────────────────────────────────────────
const S = {
  direction:        'de-en',
  recording:        false,
  translating:      false,
  autoSpeak:        true,
  ttsRate:          1.0,
  ttsPitch:         1.0,
  timerDuration:    15,
  lastResult:       null,   // { text, lang }
  convoLog:         [],
  convoActive:      false,  // prevent double-tap on conversation mics
};

// ── BOOT ──────────────────────────────────────────────────────────
async function boot() {
  applyTheme(getTheme());
  setLoadingProgress(10, 'Loading interface…');
  restorePreferences();
  setLoadingProgress(30, 'Registering offline support…');
  await registerSW();
  setLoadingProgress(60, 'Binding controls…');
  bindAll();
  handleUrlMode();
  setLoadingProgress(100, 'Ready!');
  setTimeout(hideLoadingScreen, 350);
}

function handleUrlMode() {
  const p = new URLSearchParams(location.search);
  if (p.get('mode') === 'conversation') switchTab('conversation');
}

// ── SERVICE WORKER ────────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('Update available — reload to apply.', '', 6000);
        }
      });
    });
  } catch (err) {
    console.warn('[Brük] SW registration failed:', err);
  }
}

// ── PREFERENCES ───────────────────────────────────────────────────
function restorePreferences() {
  const K = CONFIG.STORAGE_KEYS;
  S.direction     = localStorage.getItem(K.DIR_PREFERENCE) ?? 'de-en';
  S.ttsRate       = parseFloat(localStorage.getItem(K.TTS_RATE)   ?? '1');
  S.ttsPitch      = parseFloat(localStorage.getItem(K.TTS_PITCH)  ?? '1');
  S.autoSpeak     = localStorage.getItem(K.AUTO_SPEAK)  !== 'false';
  S.timerDuration = parseInt(localStorage.getItem(K.TIMER_DURATION) ?? '15', 10);

  setDirection(S.direction);
  EL.speechRate.value  = S.ttsRate;  EL.speechRateVal.textContent  = `${S.ttsRate.toFixed(1)}×`;
  EL.speechPitch.value = S.ttsPitch; EL.speechPitchVal.textContent = S.ttsPitch.toFixed(1);
  EL.autoSpeakToggle.setAttribute('aria-checked', String(S.autoSpeak));
  EL.timerDuration.value = S.timerDuration;
}

function savePref(key, value) { localStorage.setItem(key, value); }

// ── EVENT WIRING ──────────────────────────────────────────────────
function bindAll() {
  // Theme / settings
  EL.themeToggle.addEventListener('click', toggleTheme);
  EL.settingsBtn.addEventListener('click', openSettings);
  EL.closeSettings.addEventListener('click', _closeSettings);
  EL.settingsOverlay.addEventListener('click', e => { if (e.target === EL.settingsOverlay) _closeSettings(); });
  EL.settingsOverlay.addEventListener('keydown', e => { if (e.key === 'Escape') _closeSettings(); });

  // Tabs
  EL.tabShort.addEventListener('click', () => switchTab('short'));
  EL.tabConvo.addEventListener('click', () => { stopSpeaking(); switchTab('conversation'); });

  // Direction chips
  [EL.dirDeEn, EL.dirAuto, EL.dirEnDe].forEach(btn =>
    btn.addEventListener('click', () => {
      S.direction = btn.dataset.dir;
      setDirection(S.direction);
      savePref(CONFIG.STORAGE_KEYS.DIR_PREFERENCE, S.direction);
    })
  );

  // Text input
  EL.inputText.addEventListener('input', () => {
    const n = EL.inputText.value.length;
    updateCharCount(n);
    EL.clearInput.classList.toggle('hidden', n === 0);
    if (n === 0) hideResult();
  });
  EL.clearInput.addEventListener('click', () => {
    EL.inputText.value = '';
    updateCharCount(0);
    EL.clearInput.classList.add('hidden');
    hideResult();
    stopSpeaking();
  });

  // Translate
  EL.translateBtn.addEventListener('click', doTranslate);
  EL.inputText.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doTranslate();
  });

  // Mic
  EL.micBtn.addEventListener('click', toggleMic);

  // Camera
  EL.cameraBtn.addEventListener('click', doCameraOpen);
  EL.closeCameraBtn.addEventListener('click', () => { closeCamera(); });
  EL.captureBtn.addEventListener('click', doCapture);

  // Result actions
  EL.speakBtn.addEventListener('click', () => {
    if (S.lastResult) speak(S.lastResult.text, S.lastResult.lang, { rate: S.ttsRate, pitch: S.ttsPitch });
  });
  EL.copyBtn.addEventListener('click', async () => {
    if (!S.lastResult) return;
    try {
      await navigator.clipboard.writeText(S.lastResult.text);
      showToast('Copied!', 'success');
    } catch {
      showToast('Select and copy the text manually.', '');
    }
  });

  // Settings controls
  EL.speechRate.addEventListener('input', () => {
    S.ttsRate = parseFloat(EL.speechRate.value);
    EL.speechRateVal.textContent = `${S.ttsRate.toFixed(1)}×`;
    savePref(CONFIG.STORAGE_KEYS.TTS_RATE, S.ttsRate);
  });
  EL.speechPitch.addEventListener('input', () => {
    S.ttsPitch = parseFloat(EL.speechPitch.value);
    EL.speechPitchVal.textContent = S.ttsPitch.toFixed(1);
    savePref(CONFIG.STORAGE_KEYS.TTS_PITCH, S.ttsPitch);
  });
  EL.autoSpeakToggle.addEventListener('click', () => {
    S.autoSpeak = !S.autoSpeak;
    EL.autoSpeakToggle.setAttribute('aria-checked', String(S.autoSpeak));
    savePref(CONFIG.STORAGE_KEYS.AUTO_SPEAK, S.autoSpeak);
  });
  EL.timerDuration.addEventListener('change', () => {
    S.timerDuration = parseInt(EL.timerDuration.value, 10);
    savePref(CONFIG.STORAGE_KEYS.TIMER_DURATION, S.timerDuration);
  });
  EL.preloadModelsBtn.addEventListener('click', doPreloadModels);

  // Error modal
  EL.errorDismiss.addEventListener('click', dismissError);
  EL.errorRetry.addEventListener('click', () => { const fn = getErrorRetryCallback(); dismissError(); fn?.(); });
  EL.errorModal.addEventListener('keydown', e => { if (e.key === 'Escape') dismissError(); });

  // Conversation
  EL.convoDeMic.addEventListener('click', () => doConvoMic('de'));
  EL.convoEnMic.addEventListener('click', () => doConvoMic('en'));
  EL.clearConvoBtn.addEventListener('click', () => { clearConvoLog(); S.convoLog = []; });
  EL.exportConvoBtn.addEventListener('click', doExportConvo);
}

// ── TRANSLATE ────────────────────────────────────────────────────
async function doTranslate() {
  const raw = EL.inputText.value.trim();
  if (!raw) { showToast('Type something first.', ''); return; }
  if (S.translating) return;

  S.translating = true;
  EL.translateBtn.disabled = true;
  EL.translateBtn.querySelector('span').textContent = 'Translating…';

  try {
    const { translation, detectedDir } = await translate(raw, S.direction);
    const outLang = detectedDir === 'de-en' ? 'en' : 'de';

    S.lastResult = { text: translation, lang: outLang };

    const dietResult = await detectDiet(raw + ' ' + translation);
    showResult(translation, raw, dietResult);

    if (S.autoSpeak) speak(translation, outLang, { rate: S.ttsRate, pitch: S.ttsPitch });
  } catch (err) {
    handleError(err, 'Translation failed', doTranslate);
  } finally {
    S.translating = false;
    EL.translateBtn.disabled = false;
    EL.translateBtn.querySelector('span').textContent = 'Translate';
  }
}

// ── MIC RECORDING ────────────────────────────────────────────────
async function toggleMic() {
  if (S.recording) {
    stopRecording();
    clearTimer();
    setMicActive(false);
    return;
  }

  setMicActive(true);
  let blob;
  try {
    const recPromise = startRecording(S.timerDuration);
    startTimer(S.timerDuration, null, () => { /* auto-stop handled inside startRecording */ });
    blob = await recPromise;
  } catch (err) {
    clearTimer();
    setMicActive(false);
    if (err instanceof SpeechError) showToast(err.message, 'error', 5000);
    else handleError(err, 'Recording failed', toggleMic);
    return;
  }

  clearTimer();
  setMicActive(false);
  showToast('Recognising speech…', '', 5000);

  try {
    const sourceLang = S.direction === 'en-de' ? 'en' : 'de';
    const { text } = await transcribe(blob, sourceLang);
    EL.inputText.value = text;
    updateCharCount(text.length);
    EL.clearInput.classList.remove('hidden');
    await doTranslate();
  } catch (err) {
    // Try Web Speech fallback
    if (isWebSpeechAvailable()) {
      showToast('Trying device speech recognition…', '');
      try {
        const lang = S.direction === 'en-de' ? 'en-GB' : 'de-DE';
        const { text } = await transcribeWithWebSpeech(lang);
        EL.inputText.value = text;
        updateCharCount(text.length);
        EL.clearInput.classList.remove('hidden');
        await doTranslate();
        return;
      } catch { /* fall through to error display */ }
    }
    if (err instanceof SpeechError) showToast(err.message, 'error', 5000);
    else handleError(err, 'Speech recognition failed', toggleMic);
  }
}

function setMicActive(active) {
  S.recording = active;
  EL.micBtn.setAttribute('aria-pressed', String(active));
  EL.micBtn.setAttribute('aria-label', active ? 'Stop recording' : 'Start voice input');
}

// ── CAMERA ───────────────────────────────────────────────────────
async function doCameraOpen() {
  try { await openCamera(); }
  catch (err) {
    if (err instanceof CameraError) showToast(err.message, 'error', 5000);
    else handleError(err, 'Camera error', doCameraOpen);
  }
}

async function doCapture() {
  try {
    const text = await captureAndOCR();
    closeCamera();
    EL.inputText.value = text;
    updateCharCount(text.length);
    EL.clearInput.classList.remove('hidden');
    // Camera defaults to DE input
    if (S.direction === 'auto' || S.direction === 'de-en') {
      // keep current; detectLanguage will confirm
    }
    await doTranslate();
  } catch (err) {
    if (err instanceof CameraError) showToast(err.message, 'error', 5000);
    else handleError(err, 'Capture failed', doCapture);
  }
}

// ── CONVERSATION MODE ────────────────────────────────────────────
async function doConvoMic(lang) {
  if (S.convoActive) return;
  S.convoActive = true;

  const btn = lang === 'de' ? EL.convoDeMic : EL.convoEnMic;
  btn.setAttribute('aria-pressed', 'true');

  let blob;
  try {
    const recPromise = startRecording(S.timerDuration);
    startTimer(S.timerDuration, null, () => {});
    blob = await recPromise;
  } catch (err) {
    clearTimer();
    btn.setAttribute('aria-pressed', 'false');
    S.convoActive = false;
    if (err instanceof SpeechError) showToast(err.message, 'error', 5000);
    else handleError(err, 'Recording failed', () => doConvoMic(lang));
    return;
  }

  clearTimer();
  btn.setAttribute('aria-pressed', 'false');

  try {
    const { text: original } = await transcribe(blob, lang);
    const dir = lang === 'de' ? 'de-en' : 'en-de';
    const { translation } = await translate(original, dir);
    const outLang = lang === 'de' ? 'en' : 'de';

    S.convoLog.push({ lang, original, translation });
    addConvoBubble(lang, original, translation, () =>
      speak(translation, outLang, { rate: S.ttsRate, pitch: S.ttsPitch })
    );
    if (S.autoSpeak) speak(translation, outLang, { rate: S.ttsRate, pitch: S.ttsPitch });
  } catch (err) {
    if (err instanceof SpeechError || err instanceof TranslationError)
      showToast(err.message, 'error', 5000);
    else handleError(err, 'Conversation error', () => doConvoMic(lang));
  } finally {
    S.convoActive = false;
  }
}

// ── EXPORT CONVERSATION ───────────────────────────────────────────
function doExportConvo() {
  if (!S.convoLog.length) { showToast('Nothing to export yet.', ''); return; }

  const lines = S.convoLog.map(e =>
    `${e.lang === 'de' ? '🇩🇪 DE' : '🇬🇧 EN'}\nOriginal:    ${e.original}\nTranslation: ${e.translation}\n`
  );
  const content = `Brük — Conversation Export\n${new Date().toLocaleString()}\n\n${lines.join('\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `bruk-convo-${Date.now()}.txt` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Exported!', 'success');
}

// ── MODEL PRELOAD ─────────────────────────────────────────────────
async function doPreloadModels() {
  EL.preloadModelsBtn.disabled = true;
  EL.preloadModelsBtn.textContent = 'Downloading…';
  showToast('Downloading AI models — this takes a few minutes on first run.', '', 8000);

  try {
    await preloadTranslationModels((dir, _file, pct) => updateModelStatus(dir, `loading (${pct}%)`));
    await preloadWhisper(pct => updateModelStatus('whisper', `loading (${pct}%)`));
    showToast('All models downloaded and ready!', 'success', 4000);
  } catch (err) {
    showToast('Some models failed. They will load automatically when first used.', 'error', 6000);
    console.error('[Brük] Model preload error:', err);
  } finally {
    EL.preloadModelsBtn.disabled = false;
    EL.preloadModelsBtn.textContent = 'Download All Models';
  }
}

// ── ERROR HANDLER ─────────────────────────────────────────────────
function handleError(err, title, retryFn) {
  console.error(`[Brük] ${title}:`, err);
  // Minor errors → toast only
  if (err instanceof SpeechError || err instanceof CameraError) {
    showToast(err.message, 'error', 5000);
    return;
  }
  showError(title, err?.message ?? String(err), retryFn);
}

// ── START ─────────────────────────────────────────────────────────
boot().catch(err => {
  console.error('[Brük] Boot failed:', err);
  const el = document.getElementById('loading-status');
  if (el) el.textContent = 'Failed to start. Please refresh the page.';
});
