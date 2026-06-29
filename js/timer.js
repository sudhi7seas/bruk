/**
 * Brük — Timer Module
 * Animated countdown ring for voice recording.
 */

import { EL } from './ui.js';

let timerInterval = null;
let remainingSeconds = 0;
const CIRCUMFERENCE = 2 * Math.PI * 20; // r=20 in SVG

export function startTimer(durationSeconds, onTick, onExpire) {
  clearTimer();
  remainingSeconds = durationSeconds;

  // Show timer UI
  EL.micBtn.classList.add('timing');
  EL.timerRingWrap.classList.remove('hidden');
  EL.timerCount.textContent = remainingSeconds;
  updateRing(remainingSeconds, durationSeconds);

  timerInterval = setInterval(() => {
    remainingSeconds--;
    EL.timerCount.textContent = remainingSeconds;
    updateRing(remainingSeconds, durationSeconds);
    onTick?.(remainingSeconds);

    if (remainingSeconds <= 0) {
      clearTimer();
      onExpire?.();
    }
  }, 1000);
}

export function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  EL.micBtn.classList.remove('timing');
  EL.timerRingWrap.classList.add('hidden');
}

function updateRing(remaining, total) {
  const progress = remaining / total;
  const offset = CIRCUMFERENCE * (1 - progress);
  EL.timerProgress.style.strokeDashoffset = offset;

  // Colour shifts: blue → orange → red
  if (progress > 0.5) {
    EL.timerProgress.style.stroke = 'white';
  } else if (progress > 0.25) {
    EL.timerProgress.style.stroke = '#FCD34D';
  } else {
    EL.timerProgress.style.stroke = '#FCA5A5';
  }
}

export function getRemainingSeconds() {
  return remainingSeconds;
}
