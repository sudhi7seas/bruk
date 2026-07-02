/**
 * Brük — App Orchestration v1.2
 *
 * Boot sequence is now fully synchronous (no CDN fetches at startup).
 * AI models load lazily only when the user first triggers translation/mic.
 */

import { CONFIG }        from './config.js';
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
  showModelLoadingHint, hideModelLoadingHint,
  showActiveVoices,
} from './ui.js';
import { translate, preloadTranslationModels, TranslationError } from './translation.js';
import {
  startRecording, stopRecording,
  transcribe, isWebSpeechAvailable, transcribeWithWebSpeech,
  preloadWhisper, SpeechError,
} from './speech-input.js';
import { speak, stopSpeaking, getPreferredVoices } from './speech-output.js';
import { openCamera, closeCamera, captureAndOCR, CameraError } from './camera.js';
import { detectDiet }                  from './diet.js';
import { startTimer, clearTimer }      from './timer.js';

// ── STATE ─────────────────────────────────────────────────────────
const S = {
  direction:     'de-en',
  recording:     false,
  translating:   false,
  autoSpeak:     true,
  ttsRate:       1.0,
  ttsPitch:      1.0,
  timerDuration: 15,
  lastResult:    null,   // { text, lang }
  convoLog:      [],
  convoActive:   false,
};

// ── BOOT ──────────────────────────────────────────────────────────
// Boot is intentionally synchronous — no network calls, no AI loading.
// The progress bar fills quickly to show the app is alive.
async function boot() {
  try {
    setLoadingProgress(20, 'Applying theme…');
    applyTheme(getTheme());

    setLoadingProgress(40, 'Restoring preferences…');
    restorePreferences();

    setLoadingProgress(60, 'Registering offline support…');
    await registerSW();          // fast — just registers the SW script

    setLoadingProgress(80, 'Wiring controls…');
    bindAll();
    handleUrlMode();

    setLoadingProgress(100, 'Ready!');
    // Small pause so the user sees "Ready!" before the screen disappears
    await sleep(300);
    hideLoadingScreen();
  } catch (err) {
    console.error('[Brük] Boot error:', err);
    setLoadingProgress(100, 'Error during startup — please refresh.');
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
      reg.installing?.addEventListener('statechange', function () {
        if (this.state === 'installed' && navigator.serviceWorker.controller)
          showToast('App updated — reload to apply.', '', 8000);
      });
    });
  } catch (err) {
    console.warn('[Brük] SW registration failed:', err);
    // Non-fatal — app still works without SW
  }
}

// ── PREFERENCES ───────────────────────────────────────────────────
function restorePreferences() {
  const K = CONFIG.STORAGE_KEYS;
  S.direction     = localStorage.getItem(K.DIR_PREFERENCE) ?? 'de-en';
  S.ttsRate       = parseFloat(localStorage.getItem(K.TTS_RATE)   ?? '1');
  S.ttsPitch      = parseFloat(localStorage.getItem(K.TTS_PITCH)  ?? '1');
  S.autoSpeak     = localStorage.getItem(K.AUTO_SPEAK) !== 'false';
  S.timerDuration = parseInt(localStorage.getItem(K.TIMER_DURATION) ?? '15', 10);

  setDirection(S.direction);
  EL.speechRate.value  = S.ttsRate;
  EL.speechRateVal.textContent  = `${S.ttsRate.toFixed(1)}×`;
  EL.speechPitch.value = S.ttsPitch;
  EL.speechPitchVal.textContent = S.ttsPitch.toFixed(1);
  EL.autoSpeakToggle.setAttribute('aria-checked', String(S.autoSpeak));
  EL.timerDuration.value = S.timerDuration;
}

const save = (key, val) => localStorage.setItem(key, val);

// ── EVENTS ────────────────────────────────────────────────────────
function bindAll() {
  // Theme / settings
  EL.themeToggle.addEventListener('click', toggleTheme);
  EL.settingsBtn.addEventListener('click', () => {
    openSettings();
    getPreferredVoices().then(showActiveVoices).catch(() => {});
  });
  EL.closeSettings.addEventListener('click', _closeSettings);
  EL.settingsOverlay.addEventListener('click', e => {
    if (e.target === EL.settingsOverlay) _closeSettings();
  });
  EL.settingsOverlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') _closeSettings();
  });

  // Mode tabs
  EL.tabShort.addEventListener('click', () => switchTab('short'));
  EL.tabConvo.addEventListener('click', () => { stopSpeaking(); switchTab('conversation'); });

  // Direction chips
  [EL.dirDeEn, EL.dirAuto, EL.dirEnDe].forEach(btn =>
    btn.addEventListener('click', () => {
      S.direction = btn.dataset.dir;
      setDirection(S.direction);
      save(CONFIG.STORAGE_KEYS.DIR_PREFERENCE, S.direction);
    })
  );

  // Text input
  EL.inputText.addEventListener('input', () => {
    const n = EL.inputText.value.length;
    updateCharCount(n);
    EL.clearInput.classList.toggle('hidden', n === 0);
    if (n === 0) { hideResult(); hideModelLoadingHint(); }
  });
  EL.clearInput.addEventListener('click', () => {
    EL.inputText.value = '';
    updateCharCount(0);
    EL.clearInput.classList.add('hidden');
    hideResult();
    hideModelLoadingHint();
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
  EL.closeCameraBtn.addEventListener('click', closeCamera);
  EL.captureBtn.addEventListener('click', doCapture);

  // Result actions
  EL.speakBtn.addEventListener('click', () => {
    if (S.lastResult)
      speak(S.lastResult.text, S.lastResult.lang, { rate: S.ttsRate, pitch: S.ttsPitch });
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

  // Settings sliders / toggles
  EL.speechRate.addEventListener('input', () => {
    S.ttsRate = parseFloat(EL.speechRate.value);
    EL.speechRateVal.textContent = `${S.ttsRate.toFixed(1)}×`;
    save(CONFIG.STORAGE_KEYS.TTS_RATE, S.ttsRate);
  });
  EL.speechPitch.addEventListener('input', () => {
    S.ttsPitch = parseFloat(EL.speechPitch.value);
    EL.speechPitchVal.textContent = S.ttsPitch.toFixed(1);
    save(CONFIG.STORAGE_KEYS.TTS_PITCH, S.ttsPitch);
  });
  EL.autoSpeakToggle.addEventListener('click', () => {
    S.autoSpeak = !S.autoSpeak;
    EL.autoSpeakToggle.setAttribute('aria-checked', String(S.autoSpeak));
    save(CONFIG.STORAGE_KEYS.AUTO_SPEAK, S.autoSpeak);
  });
  EL.timerDuration.addEventListener('change', () => {
    S.timerDuration = parseInt(EL.timerDuration.value, 10);
    save(CONFIG.STORAGE_KEYS.TIMER_DURATION, S.timerDuration);
  });
  EL.preloadModelsBtn.addEventListener('click', doPreloadModels);

  // Error modal
  EL.errorDismiss.addEventListener('click', dismissError);
  EL.errorRetry.addEventListener('click', () => {
    const fn = getErrorRetryCallback();
    dismissError();
    fn?.();
  });
  EL.errorModal.addEventListener('keydown', e => { if (e.key === 'Escape') dismissError(); });

  // Conversation
  EL.convoDeMic.addEventListener('click', () => doConvoMic('de'));
  EL.convoEnMic.addEventListener('click', () => doConvoMic('en'));
  EL.clearConvoBtn.addEventListener('click', () => { clearConvoLog(); S.convoLog = []; });
  EL.exportConvoBtn.addEventListener('click', doExportConvo);
}

// ── TRANSLATE ─────────────────────────────────────────────────────
async function doTranslate() {
  const raw = EL.inputText.value.trim();
  if (!raw) { showToast('Type or speak something first.', ''); return; }
  if (S.translating) return;

  S.translating = true;
  EL.translateBtn.disabled = true;
  EL.translateBtn.querySelector('span').textContent = 'Translating…';

  try {
    showModelLoadingHint('Loading translation model… (first run: ~75 MB, Wi-Fi recommended)');

    const { translation, detectedDir } = await translate(raw, S.direction, (file, pct) => {
      showModelLoadingHint(`Downloading model: ${pct}% — first run only, then fully offline`);
    });

    hideModelLoadingHint();

    const outLang    = detectedDir === 'de-en' ? 'en' : 'de';
    S.lastResult     = { text: translation, lang: outLang };

    const diet = await detectDiet(raw + ' ' + translation);
    showResult(translation, raw, diet);

    if (S.autoSpeak)
      speak(translation, outLang, { rate: S.ttsRate, pitch: S.ttsPitch });

  } catch (err) {
    hideModelLoadingHint();
    handleErr(err, 'Translation failed', doTranslate);
  } finally {
    S.translating = false;
    EL.translateBtn.disabled = false;
    EL.translateBtn.querySelector('span').textContent = 'Translate';
  }
}

// ── MIC ───────────────────────────────────────────────────────────
async function toggleMic() {
  if (S.recording) {
    stopRecording(); clearTimer(); setMicActive(false); return;
  }

  setMicActive(true);
  let blob;
  try {
    const recPromise = startRecording(S.timerDuration);
    startTimer(S.timerDuration, null, () => {});
    blob = await recPromise;
  } catch (err) {
    clearTimer(); setMicActive(false);
    showToast(err instanceof SpeechError ? err.message : 'Recording failed.', 'error', 5000);
    return;
  }

  clearTimer(); setMicActive(false);
  showToast('Recognising speech…', '', 6000);

  try {
    const srcLang = S.direction === 'en-de' ? 'en' : 'de';
    showModelLoadingHint('Loading speech model… (first run: ~75 MB)');

    const { text } = await transcribe(blob, srcLang, pct =>
      showModelLoadingHint(`Downloading Whisper model: ${pct}% — first run only`)
    );

    hideModelLoadingHint();
    EL.inputText.value = text;
    updateCharCount(text.length);
    EL.clearInput.classList.remove('hidden');
    await doTranslate();

  } catch (err) {
    hideModelLoadingHint();
    // Web Speech API fallback
    if (isWebSpeechAvailable()) {
      showToast('Whisper unavailable — trying device speech recognition…', '', 3000);
      try {
        const lang = S.direction === 'en-de' ? 'en-GB' : 'de-DE';
        const { text } = await transcribeWithWebSpeech(lang);
        EL.inputText.value = text;
        updateCharCount(text.length);
        EL.clearInput.classList.remove('hidden');
        await doTranslate();
        return;
      } catch { /* fall through to error */ }
    }
    handleErr(err, 'Speech recognition failed', toggleMic);
  }
}

function setMicActive(on) {
  S.recording = on;
  EL.micBtn.setAttribute('aria-pressed', String(on));
  EL.micBtn.setAttribute('aria-label', on ? 'Stop recording' : 'Start voice input');
}

// ── CAMERA ────────────────────────────────────────────────────────
async function doCameraOpen() {
  try { await openCamera(); }
  catch (err) {
    showToast(err instanceof CameraError ? err.message : 'Camera unavailable.', 'error', 5000);
  }
}

async function doCapture() {
  try {
    const text = await captureAndOCR();
    closeCamera();
    EL.inputText.value = text;
    updateCharCount(text.length);
    EL.clearInput.classList.remove('hidden');
    await doTranslate();
  } catch (err) {
    showToast(err instanceof CameraError ? err.message : 'Capture failed.', 'error', 5000);
  }
}

// ── CONVERSATION MODE ─────────────────────────────────────────────
async function doConvoMic(lang) {
  if (S.convoActive) return;
  S.convoActive = true;

  const btn = lang === 'de' ? EL.convoDeMic : EL.convoEnMic;
  btn.setAttribute('aria-pressed', 'true');

  let blob;
  try {
    const p = startRecording(S.timerDuration);
    startTimer(S.timerDuration, null, () => {});
    blob = await p;
  } catch (err) {
    clearTimer(); btn.setAttribute('aria-pressed', 'false'); S.convoActive = false;
    showToast(err instanceof SpeechError ? err.message : 'Recording failed.', 'error', 5000);
    return;
  }
  clearTimer(); btn.setAttribute('aria-pressed', 'false');

  try {
    const { text: original } = await transcribe(blob, lang);
    const { translation }    = await translate(original, lang === 'de' ? 'de-en' : 'en-de');
    const outLang = lang === 'de' ? 'en' : 'de';

    S.convoLog.push({ lang, original, translation });
    addConvoBubble(lang, original, translation, () =>
      speak(translation, outLang, { rate: S.ttsRate, pitch: S.ttsPitch })
    );
    if (S.autoSpeak)
      speak(translation, outLang, { rate: S.ttsRate, pitch: S.ttsPitch });
  } catch (err) {
    showToast(err?.message ?? 'Error occurred.', 'error', 5000);
  } finally {
    S.convoActive = false;
  }
}

// ── EXPORT ────────────────────────────────────────────────────────
function doExportConvo() {
  if (!S.convoLog.length) { showToast('Nothing to export yet.', ''); return; }

  const lines = S.convoLog.map(e =>
    `${e.lang === 'de' ? '🇩🇪 DE' : '🇬🇧 EN'}\n` +
    `Original:    ${e.original}\n` +
    `Translation: ${e.translation}\n`
  );
  const blob = new Blob(
    [`Brük Conversation — ${new Date().toLocaleString()}\n\n${lines.join('\n')}`],
    { type: 'text/plain;charset=utf-8' }
  );
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), {
    href: url, download: `bruk-${Date.now()}.txt`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Conversation exported.', 'success');
}

// ── PRELOAD ALL MODELS ────────────────────────────────────────────
async function doPreloadModels() {
  EL.preloadModelsBtn.disabled    = true;
  EL.preloadModelsBtn.textContent = 'Downloading…';
  showToast('Downloading AI models — stay on Wi-Fi, this takes a few minutes.', '', 10000);

  let ok = 0, fail = 0;

  try {
    const results = await preloadTranslationModels((dir, file, pct) => {
      updateModelStatus(dir, `${pct}%`);
    });
    results.forEach(r => r.status === 'fulfilled' ? ok++ : fail++);
  } catch { fail++; }

  try {
    await preloadWhisper(pct => updateModelStatus('whisper', `${pct}%`));
    ok++;
  } catch { fail++; }

  if (fail === 0)
    showToast('All models downloaded! Brük works fully offline now.', 'success', 6000);
  else
    showToast(`${ok} model(s) ready, ${fail} failed. Check your connection and retry.`, 'error', 6000);

  EL.preloadModelsBtn.disabled    = false;
  EL.preloadModelsBtn.textContent = 'Download All Models';
}

// ── ERROR DISPLAY ─────────────────────────────────────────────────
function handleErr(err, title, retryFn) {
  console.error(`[Brük] ${title}:`, err);
  if (err instanceof SpeechError || err instanceof CameraError) {
    showToast(err.message, 'error', 6000);
    return;
  }
  showError(title, err?.message ?? String(err), retryFn);
}

// ── START ─────────────────────────────────────────────────────────
boot();
