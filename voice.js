// js/voice.js
// Simple Speech Synthesis helper for verbal confirmations.

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Speak a short confirmation.
 * @param {string} text
 * @param {{lang?: string, rate?: number, pitch?: number, volume?: number, queue?: boolean}} opts
 */
export function speak(text, opts = {}) {
  if (!canSpeak() || !text) return;
  const {
    lang = 'en-US',
    rate = 1,
    pitch = 1,
    volume = 1,
    queue = false
  } = opts;

  try {
    if (!queue) window.speechSynthesis.cancel();
  } catch (_) {}

  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  u.pitch = pitch;
  u.volume = volume;

  window.speechSynthesis.speak(u);
}
