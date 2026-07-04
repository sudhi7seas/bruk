/**
 * Brük — Camera & OCR
 * Live viewfinder + Tesseract.js offline OCR (German + English).
 */

import { CONFIG } from './config.js';
import { EL, showToast } from './ui.js';

let _worker  = null;
let _stream  = null;

// ── TESSERACT SETUP ───────────────────────────────────────────────
async function ensureTesseract() {
  if (_worker) return _worker;

  if (!window.Tesseract) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src   = CONFIG.TESSERACT_CDN;
      s.onload  = res;
      s.onerror = () => rej(new CameraError('Failed to load OCR library. Check your internet connection.'));
      document.head.appendChild(s);
    });
  }

  try {
    _worker = await window.Tesseract.createWorker('deu+eng', 1, { logger: () => {} });
  } catch (err) {
    throw new CameraError('Could not start OCR engine: ' + err.message, err);
  }
  return _worker;
}

// ── CAMERA OPEN ───────────────────────────────────────────────────
export async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('Camera access is not supported in this browser.');
  }

  const constraints = [
    { video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
    { video: { facingMode: 'environment' },  audio: false },
    { video: true, audio: false },
  ];

  let lastErr;
  for (const c of constraints) {
    try {
      _stream = await navigator.mediaDevices.getUserMedia(c);
      EL.cameraFeed.srcObject = _stream;
      await EL.cameraFeed.play();
      EL.cameraView.classList.remove('hidden');
      return;
    } catch (err) {
      lastErr = err;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new CameraError('Camera access was denied. Please allow it in your browser settings.');
      }
    }
  }
  throw new CameraError('Could not open camera: ' + (lastErr?.message ?? 'unknown error'), lastErr);
}

export function closeCamera() {
  EL.cameraView.classList.add('hidden');
  _stream?.getTracks().forEach(t => t.stop());
  _stream = null;
  EL.cameraFeed.srcObject = null;
}

// ── CAPTURE + OCR ─────────────────────────────────────────────────
export async function captureAndOCR() {
  const video  = EL.cameraFeed;
  const canvas = EL.captureCanvas;

  if (!video.videoWidth) throw new CameraError('Camera not ready yet. Please wait a moment and try again.');

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  _preprocessForOCR(ctx, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

  showToast('Reading text…', '', 6000);
  const worker = await ensureTesseract();

  let data;
  try {
    ({ data } = await worker.recognize(dataUrl));
  } catch (err) {
    throw new CameraError('Text recognition failed: ' + err.message, err);
  }

  const text = (data.text ?? '').trim();
  if (!text || text.length < 2) {
    throw new CameraError('No text detected. Try pointing at clearer text in better lighting.');
  }
  return text;
}

function _preprocessForOCR(ctx, w, h) {
  const img  = ctx.getImageData(0, 0, w, h);
  const d    = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const grey    = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const boosted = Math.min(255, Math.max(0, (grey - 128) * 1.4 + 128));
    d[i] = d[i + 1] = d[i + 2] = boosted;
  }
  ctx.putImageData(img, 0, 0);
}

export async function terminateOCR() {
  if (_worker) { await _worker.terminate(); _worker = null; }
}

export class CameraError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'CameraError';
    if (cause) this.cause = cause;
  }
}
