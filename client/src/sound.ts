// File-free sound system (Web Audio API) — no audio assets, tiny footprint.
// Pleasant, *adaptive* UI sounds (taps walk a pentatonic scale so rapid tapping
// turns into a little melody instead of one repeated blip) plus phase cues,
// countdown ticks, and a quiet looping 8-bit chiptune. Everything routes through
// a master gain so a single mute flag (persisted) silences it all. The
// AudioContext is created + resumed on the first user gesture (autoplay policy).

const MUTE_KEY = 'kao.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let started = false; // ctx created + (maybe) music running
// chiptune music state
let music: GainNode | null = null;
let musicTimer: number | null = null;
let musicStep = 0;
let musicNextTime = 0;

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

// ── 8-bit chiptune loop (replaces the old drone) ─────────────────────────────
// A gentle looping arpeggio over a I–V–vi–IV progression (C–G–Am–F): a square
// lead plucks the chord tones while a soft square bass holds the root. Always
// pleasant (diatonic), kept quiet so it sits under the SFX. Scheduled with a
// lookahead clock so timing stays rock-steady regardless of the JS event loop.
const MIDI = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
// chord = { bass root, 4 arpeggio tones } — one chord per bar (8 eighth-steps).
const PROG = [
  { bass: 48, arp: [60, 64, 67, 72] }, // C
  { bass: 43, arp: [59, 62, 67, 71] }, // G
  { bass: 45, arp: [60, 64, 69, 72] }, // Am
  { bass: 41, arp: [60, 65, 69, 72] }, // F
];
const ARP_SEQ = [0, 2, 1, 3, 2, 1, 3, 2]; // up-down weave within each bar
const EIGHTH = 0.2; // seconds per step (~150 bpm eighths)
const STEPS = PROG.length * 8; // 32-step loop

function blip(midi: number, at: number, type: OscillatorType, dur: number, gain: number): void {
  const c = ctx;
  if (!c || !music) return;
  const f = MIDI(midi);
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, at);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(music);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function scheduleStep(step: number, at: number): void {
  const bar = Math.floor(step / 8) % PROG.length;
  const within = step % 8;
  const chord = PROG[bar];
  // lead arpeggio (bright square pluck)
  blip(chord.arp[ARP_SEQ[within]], at, 'square', 0.16, 0.05);
  // bass on the down/half beats (square, low + soft)
  if (within === 0 || within === 4) blip(chord.bass, at, 'triangle', 0.42, 0.06);
  // a light off-beat octave sparkle every other bar for a touch of motion
  if (within === 6 && bar % 2 === 1) blip(chord.arp[3] + 12, at, 'square', 0.1, 0.03);
}

function startMusic(): void {
  const c = ctx;
  if (!c || !master || muted || music) return;
  music = c.createGain();
  music.gain.value = 0.0001;
  music.connect(master);
  music.gain.setTargetAtTime(0.5, c.currentTime, 1.2); // ease in, stay background
  musicStep = 0;
  musicNextTime = c.currentTime + 0.1;
  musicTimer = window.setInterval(() => {
    const cc = ctx;
    if (!cc || !music) return;
    while (musicNextTime < cc.currentTime + 0.15) {
      scheduleStep(musicStep, musicNextTime);
      musicNextTime += EIGHTH;
      musicStep = (musicStep + 1) % STEPS;
    }
  }, 40);
}

function stopMusic(): void {
  if (musicTimer != null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  const g = music;
  const c = ctx;
  if (g && c) {
    g.gain.setTargetAtTime(0.0001, c.currentTime, 0.25);
    window.setTimeout(() => g.disconnect(), 600);
  }
  music = null;
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
    stopMusic();
    rampMaster();
  } else {
    const c = ensureCtx();
    if (c && c.state === 'suspended') void c.resume();
    rampMaster();
    startMusic();
    sConfirm(); // little chirp confirming sound is back on
  }
}

function wake(): void {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  if (!started) {
    started = true;
    if (!muted) startMusic();
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
