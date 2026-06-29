/**
 * Brük — Speech Input
 * Primary: Whisper (offline, via Transformers.js).
 * Fallback: Web Speech API (online, device-native).
 */

import { CONFIG } from './config.js';
import { updateModelStatus } from './ui.js';
import { getTransformers } from './loader.js';

let _whisperPipe = null;
let _mediaStream  = null;
let _recorder     = null;
let _chunks       = [];

// ── LOAD WHISPER ─────────────────────────────────────────────────
async function loadWhisper(onProgress) {
  if (_whisperPipe) return _whisperPipe;
  updateModelStatus('whisper', 'loading');
  try {
    const { pipeline } = await getTransformers();
    _whisperPipe = await pipeline(
      'automatic-speech-recognition',
      CONFIG.MODELS.WHISPER.id,
      {
        progress_callback: (info) => {
          if (info.status === 'progress' && onProgress) {
            onProgress(Math.round(info.progress ?? 0));
          }
        },
        chunk_length_s: 30,
        stride_length_s: 5,
      }
    );
    updateModelStatus('whisper', 'loaded');
    return _whisperPipe;
  } catch (err) {
    updateModelStatus('whisper', 'error');
    throw new SpeechError(
      'Could not load the speech recognition model (~75 MB on first run).\n\nDetails: ' + err.message,
      err
    );
  }
}

// ── MICROPHONE STREAM ────────────────────────────────────────────
async function getMicStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    const msg =
      err.name === 'NotAllowedError'  ? 'Microphone access was denied. Please allow it in your browser settings and try again.' :
      err.name === 'NotFoundError'    ? 'No microphone found on this device.' :
      `Microphone error: ${err.message}`;
    throw new SpeechError(msg, err);
  }
}

function bestMimeType() {
  const types = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}

// ── RECORDING ────────────────────────────────────────────────────
/** Returns a Blob of recorded audio after maxSeconds or stopRecording(). */
export function startRecording(maxSeconds = 15) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new SpeechError('Your browser does not support microphone access.'));
  }

  return new Promise(async (resolve, reject) => {
    try {
      _mediaStream = await getMicStream();
      _chunks = [];

      _recorder = new MediaRecorder(_mediaStream, { mimeType: bestMimeType() });
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
  });
}

export function stopRecording() {
  if (_recorder?.state === 'recording') _recorder.stop();
  else _stopStream();
}

function _stopStream() {
  _mediaStream?.getTracks().forEach(t => t.stop());
  _mediaStream = null;
}

// ── WHISPER TRANSCRIPTION ─────────────────────────────────────────
export async function transcribe(audioBlob, language = null, onModelProgress) {
  const pipe = await loadWhisper(onModelProgress);

  try {
    const arrayBuf   = await audioBlob.arrayBuffer();
    const AudioCtx   = window.AudioContext ?? window.webkitAudioContext;
    const audioCtx   = new AudioCtx({ sampleRate: 16000 });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
    audioCtx.close();

    const float32 = audioBuffer.getChannelData(0);
    const opts = { return_timestamps: false };
    if (language) opts.language = language;

    const result = await pipe(float32, opts);
    const text = (result?.text ?? '').trim();

    if (!text) throw new SpeechError('No speech was detected. Please speak clearly and try again.');
    return { text, detectedLanguage: result?.chunks?.[0]?.language ?? null };
  } catch (err) {
    if (err instanceof SpeechError) throw err;
    throw new SpeechError('Transcription failed: ' + err.message, err);
  }
}

// ── WEB SPEECH API FALLBACK ───────────────────────────────────────
export const isWebSpeechAvailable =
  () => ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export function transcribeWithWebSpeech(lang = 'de-DE') {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) { reject(new SpeechError('Speech recognition not available in this browser.')); return; }

    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    let settled = false;
    const done = (fn) => { if (!settled) { settled = true; fn(); } };

    rec.onresult = e => done(() => resolve({ text: e.results[0]?.[0]?.transcript ?? '', detectedLanguage: null }));
    rec.onerror  = e => done(() => reject(new SpeechError(
      e.error === 'not-allowed' ? 'Microphone access denied.' : `Speech recognition error: ${e.error}`
    )));
    rec.onend    = () => done(() => reject(new SpeechError('No speech detected. Please try again.')));

    rec.start();
  });
}

export function preloadWhisper(onProgress) { return loadWhisper(onProgress); }

export class SpeechError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SpeechError';
    if (cause) this.cause = cause;
  }
}
