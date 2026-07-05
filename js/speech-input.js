/**
 * Brük — Speech Input
 * Primary path: Whisper (offline) via @huggingface/transformers v4.x,
 * loaded as a native ES module import from a CDN (see loader.js).
 * Fallback: Web Speech API (device-native, requires internet).
 */

import { CONFIG } from './config.js';
import { updateModelStatus } from './ui.js';
import { getPipeline } from './loader.js';

let _stream   = null;
let _recorder = null;
let _chunks   = [];

// ── LOAD WHISPER ──────────────────────────────────────────────────
async function loadWhisper(onProgress) {
  updateModelStatus('whisper', 'loading');
  try {
    const pipe = await getPipeline(
      CONFIG.MODELS.WHISPER.task,
      CONFIG.MODELS.WHISPER.id,
      {
        dtype: CONFIG.MODELS.WHISPER.dtype,
        progress_callback: (info) => {
          if (info.status === 'progress' && onProgress)
            onProgress(Math.round(info.progress ?? 0));
        },
        chunk_length_s: 30,
        stride_length_s: 5,
      },
      CONFIG.FALLBACK_DTYPE
    );
    updateModelStatus('whisper', 'loaded');
    return pipe;
  } catch (err) {
    updateModelStatus('whisper', 'error');
    throw new SpeechError(
      `Could not load the speech recognition model (~75 MB on first run).\nDetail: ${err.message}`,
      err
    );
  }
}

// ── MIC STREAM ────────────────────────────────────────────────────
async function getMicStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    const msg =
      (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
        ? 'Microphone access was denied. Please allow it in your browser/iOS settings and try again.'
        : err.name === 'NotFoundError'
          ? 'No microphone found on this device.'
          : `Microphone error: ${err.message}`;
    throw new SpeechError(msg, err);
  }
}

function bestMimeType() {
  return ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4']
    .find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}

// ── RECORD ────────────────────────────────────────────────────────
export function startRecording(maxSeconds = 15) {
  if (!navigator.mediaDevices?.getUserMedia)
    return Promise.reject(new SpeechError('Microphone access is not supported in this browser.'));

  // The executor itself stays synchronous (avoids the async-executor
  // anti-pattern, where a throw before the first `await` could bypass
  // `reject`); the actual async work runs in an IIFE inside it, with
  // its own try/catch still funnelling every error to `reject`.
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        _stream = await getMicStream();
        _chunks = [];
        _recorder = new MediaRecorder(_stream, { mimeType: bestMimeType() });

        _recorder.ondataavailable = e => { if (e.data.size > 0) _chunks.push(e.data); };
        _recorder.onstop = () => {
          _stopStream();
          resolve(new Blob(_chunks, { type: _recorder.mimeType || 'audio/webm' }));
        };
        _recorder.onerror = e => {
          _stopStream();
          reject(new SpeechError('Recording error: ' + (e.error?.message ?? 'unknown')));
        };

        _recorder.start(250);
        setTimeout(() => { if (_recorder?.state === 'recording') _recorder.stop(); }, maxSeconds * 1000);
      } catch (err) {
        _stopStream();
        reject(err instanceof SpeechError ? err : new SpeechError(err.message, err));
      }
    })();
  });
}

export function stopRecording() {
  if (_recorder?.state === 'recording') _recorder.stop();
  else _stopStream();
}

function _stopStream() {
  _stream?.getTracks().forEach(t => t.stop());
  _stream = null;
}

// ── WHISPER TRANSCRIPTION ─────────────────────────────────────────
export async function transcribe(audioBlob, language = null, onModelProgress) {
  const pipe = await loadWhisper(onModelProgress);
  try {
    const buf  = await audioBlob.arrayBuffer();
    const Ctx  = window.AudioContext ?? window.webkitAudioContext;
    const ctx  = new Ctx({ sampleRate: 16000 });
    const decoded = await ctx.decodeAudioData(buf);
    ctx.close();

    const float32 = decoded.getChannelData(0);
    const opts = { return_timestamps: false };
    if (language) opts.language = language;

    const result = await pipe(float32, opts);
    const text   = (result?.text ?? '').trim();
    if (!text) throw new SpeechError('No speech was detected. Please speak clearly and try again.');
    return { text, detectedLanguage: result?.chunks?.[0]?.language ?? null };
  } catch (err) {
    if (err instanceof SpeechError) throw err;
    throw new SpeechError(`Transcription failed: ${err.message}`, err);
  }
}

// ── WEB SPEECH FALLBACK ───────────────────────────────────────────
export const isWebSpeechAvailable =
  () => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

export function transcribeWithWebSpeech(lang = 'de-DE') {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) { reject(new SpeechError('Speech recognition not available in this browser.')); return; }

    const rec = new SR();
    rec.lang = lang; rec.interimResults = false; rec.maxAlternatives = 1;

    let settled = false;
    const done = fn => { if (!settled) { settled = true; fn(); } };

    rec.onresult = e => done(() => resolve({ text: e.results[0]?.[0]?.transcript ?? '', detectedLanguage: null }));
    rec.onerror  = e => done(() => reject(new SpeechError(
      e.error === 'not-allowed' ? 'Microphone access denied.' : `Speech error: ${e.error}`
    )));
    rec.onend = () => done(() => reject(new SpeechError('No speech detected. Please try again.')));
    rec.start();
  });
}

export async function preloadWhisper(onProgress) { return loadWhisper(onProgress); }

export class SpeechError extends Error {
  constructor(msg, cause) { super(msg); this.name = 'SpeechError'; if (cause) this.cause = cause; }
}
