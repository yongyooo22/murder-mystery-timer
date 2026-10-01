/**
 * 알림음. 브라우저는 사용자가 화면을 한 번 누른 뒤에만 소리를 낼 수 있으므로
 * 첫 터치·키 입력 때 오디오를 준비해 둔다.
 */
type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

export function unlockAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

export function installAudioUnlock() {
  const unlock = () => {
    unlockAudio();
    if (context?.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function chime(ctx: AudioContext, frequency: number, start: number, duration: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** warning: 1분 전 짧은 한 음, timeUp: 부드러운 세 음 */
export function playAlert(kind: 'warning' | 'timeUp') {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const t = ctx.currentTime + 0.05;
  if (kind === 'warning') {
    chime(ctx, 880, t, 0.9, 0.18);
    return;
  }
  [784, 988, 1319].forEach((freq, i) => chime(ctx, freq, t + i * 0.32, 1.3, 0.24));
}

export const soundSupported = () =>
  typeof window !== 'undefined' &&
  ('AudioContext' in window || 'webkitAudioContext' in (window as unknown as Record<string, unknown>));
