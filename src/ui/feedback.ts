/**
 * Sound and haptics. Sounds are synthesised with Web Audio (no asset files):
 * short, soft, paper-ish ticks rather than arcade bleeps.
 */

let ctx: AudioContext | null = null;
let soundOn = true;
let hapticsOn = true;

export function configureFeedback(opts: { sound: boolean; haptics: boolean }): void {
  soundOn = opts.sound;
  hapticsOn = opts.haptics;
}

function audio(): AudioContext | null {
  if (!soundOn) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A filtered noise burst, like a card landing on felt. */
function thock(pitch: number, gain = 0.35, decay = 0.09): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const len = Math.floor(ac.sampleRate * decay);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;

  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = pitch;
  filter.Q.value = 1.4;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
}

function tone(freq: number, at: number, dur = 0.22, gain = 0.08): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function buzz(pattern: number | number[]): void {
  if (hapticsOn && 'vibrate' in navigator) navigator.vibrate(pattern);
}

export const fx = {
  pick() {
    thock(2400, 0.12, 0.04);
    buzz(5);
  },
  place() {
    thock(900);
    buzz(12);
  },
  trick() {
    thock(900);
    tone(784, 0.03);
    tone(1175, 0.09);
    buzz([10, 40, 18]);
  },
  invalid() {
    thock(220, 0.3, 0.12);
    buzz([30, 30, 30]);
  },
  undo() {
    thock(1600, 0.15, 0.05);
  },
  deal() {
    for (let i = 0; i < 3; i++) setTimeout(() => thock(1300 + i * 120, 0.12, 0.05), i * 55);
    buzz(8);
  },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.4, 0.07));
    buzz([20, 60, 20, 60, 40]);
  },
  lose() {
    [392, 311, 262].forEach((f, i) => tone(f, i * 0.14, 0.45, 0.06));
    buzz(80);
  },
};
