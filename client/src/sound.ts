// File-free sound system (Web Audio API) — no audio assets, tiny footprint.
// Pleasant, *adaptive* UI sounds (taps walk a pentatonic scale so rapid tapping
// turns into a little melody instead of one repeated blip) plus phase cues,
// countdown ticks, and a soft evolving ambient pad. Everything routes through a
// master gain so a single mute flag (persisted) silences it all. The
// AudioContext is created + resumed on the first user gesture (autoplay policy).

const MUTE_KEY = 'kao.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let started = false; // ctx created + (maybe) ambient running
let ambient: { stop: () => void } | null = null;

export function getMuted(): boolean {
  return muted;
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function rampMaster(): void {
  if (!ctx || !master) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.04);
}

// ── one synth voice: osc → env-gain → (pan) → master ─────────────────────────
interface VoiceOpts {
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  attack?: number;
  glideTo?: number;
  pan?: number;
}
function voice(freq: number, opts: VoiceOpts = {}): void {
  const c = ctx;
  if (!c || !master || muted) return;
  const { type = 'sine', dur = 0.16, gain = 0.16, attack = 0.005, glideTo, pan = 0 } = opts;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(master);
  } else {
    g.connect(master);
  }
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function arp(freqs: number[], type: OscillatorType, stepMs = 70, gain = 0.15): void {
  freqs.forEach((f, i) => window.setTimeout(() => voice(f, { type, dur: 0.22, gain }), i * stepMs));
}

// ── named sounds ─────────────────────────────────────────────────────────────
// C-major pentatonic — every tap is a pleasant note; the index walks so a burst
// of taps forms an ascending run, then resets.
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
let tapIdx = 0;
let lastTap = 0;

export function sTap(): void {
  // reset the melodic run if taps are spaced out
  const now = ctx ? ctx.currentTime : 0;
  if (now - lastTap > 0.6) tapIdx = 0;
  lastTap = now;
  const f = PENTA[tapIdx % PENTA.length];
  tapIdx++;
  voice(f, { type: 'triangle', dur: 0.13, gain: 0.1, pan: (Math.min(tapIdx, 5) - 3) * 0.08 });
}

export function sConfirm(): void {
  voice(659.25, { type: 'sine', dur: 0.14, gain: 0.16 });
  window.setTimeout(() => voice(987.77, { type: 'sine', dur: 0.22, gain: 0.16 }), 75);
}

export function sTick(urgent = false): void {
  voice(urgent ? 1174.7 : 880.0, { type: 'triangle', dur: 0.05, gain: 0.07 });
}

export function sPhase(screen: string): void {
  switch (screen) {
    case 'LOBBY':
      voice(392, { type: 'sine', dur: 0.45, gain: 0.1 });
      break;
    case 'BUILD':
      arp([523.25, 659.25, 783.99], 'triangle', 65);
      break;
    case 'VOTE':
      arp([783.99, 659.25], 'sine', 80);
      break;
    case 'RESULT':
      // major triad reveal
      voice(523.25, { type: 'sine', dur: 0.5, gain: 0.12 });
      voice(659.25, { type: 'sine', dur: 0.5, gain: 0.1 });
      voice(783.99, { type: 'sine', dur: 0.55, gain: 0.1 });
      break;
    case 'RECAP':
      arp([523.25, 659.25, 783.99, 1046.5], 'triangle', 90, 0.16);
      break;
    default:
      break;
  }
}

// ── ambient pad: quiet, slowly-evolving drone (toggles with mute) ────────────
function startAmbient(): void {
  const c = ctx;
  if (!c || !master || muted || ambient) return;
  try {
    const pad = c.createGain();
    pad.gain.value = 0.0001;
    pad.connect(master);
    pad.gain.setTargetAtTime(0.05, c.currentTime, 2.5); // ease in, stay subtle

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 640;
    lp.Q.value = 0.6;
    lp.connect(pad);

    // soft C drone (C3 / G3 / C4), slightly detuned for warmth
    const freqs = [130.81, 196.0, 261.63];
    const oscs = freqs.map((f, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (i === 1 ? 1.004 : 1);
      o.connect(lp);
      o.start();
      return o;
    });
    // slow filter sweep for gentle movement
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    ambient = {
      stop() {
        const cc = ctx;
        const tt = cc ? cc.currentTime : 0;
        pad.gain.setTargetAtTime(0.0001, tt, 0.4);
        oscs.forEach((o) => o.stop(tt + 0.8));
        lfo.stop(tt + 0.8);
      },
    };
  } catch {
    ambient = null;
  }
}

function stopAmbient(): void {
  if (ambient) {
    ambient.stop();
    ambient = null;
  }
}

// ── lifecycle ────────────────────────────────────────────────────────────────
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (m) {
    stopAmbient();
    rampMaster();
  } else {
    const c = ensureCtx();
    if (c && c.state === 'suspended') void c.resume();
    rampMaster();
    startAmbient();
    sConfirm(); // little chirp confirming sound is back on
  }
}

function wake(): void {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  if (!started) {
    started = true;
    if (!muted) startAmbient();
  }
}

function onGesture(e: Event): void {
  wake();
  if (muted || !ctx) return;
  const t = e.target as Element | null;
  const el = t && t.closest ? t.closest('button, .slot, .vote-card') : null;
  if (!el) return;
  if (el.classList.contains('vote-card')) sConfirm();
  else sTap();
}

export function initSound(): void {
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }
  // capture-phase so the tap sound fires as early as possible on press
  document.addEventListener('pointerdown', onGesture, { passive: true, capture: true });
  document.addEventListener('keydown', wake);
}
