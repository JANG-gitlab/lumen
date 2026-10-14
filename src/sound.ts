/**
 * Sons du verre, synthétisés en Web Audio : aucun fichier à charger, et
 * chaque son se cale exactement sur l'animation qu'il accompagne. Coupé par
 * défaut, le choix du visiteur est retenu d'une visite à l'autre.
 */

const STORAGE_KEY = 'lumen-sound';
const MASTER_VOLUME = 0.55;
// Partiels inharmoniques d'une lame de verre frappée (rapports mesurés sur
// une barre libre), qui donnent le « tink » cristallin plutôt qu'une note.
const GLASS_PARTIALS = [1, 2.32, 4.25, 6.63];

interface Engine {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly room: ConvolverNode;
  readonly noise: AudioBuffer;
}

let engine: Engine | null = null;
let enabled = readPreference();
const listeners = new Set<() => void>();

function readPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function writePreference(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour la visite.
  }
}

function whiteNoise(context: AudioContext, seconds: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

// Pièce courte et claire, façon studio vitré : bruit stéréo qui décroît.
function roomImpulse(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 1.6);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
    }
  }
  return impulse;
}

function ensureEngine(): Engine | null {
  if (engine) return engine;
  if (typeof AudioContext === 'undefined') return null;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = MASTER_VOLUME;
  master.connect(context.destination);
  const room = context.createConvolver();
  room.buffer = roomImpulse(context);
  const wet = context.createGain();
  wet.gain.value = 0.28;
  room.connect(wet).connect(master);
  engine = { context, master, room, noise: whiteNoise(context, 2) };
  return engine;
}

function activeEngine(): Engine | null {
  if (!enabled) return null;
  const current = ensureEngine();
  if (current?.context.state === 'suspended') void current.context.resume();
  return current;
}

/** Envoie un son vers la sortie directe et, un peu, vers la réverbération. */
function output(sound: Engine, node: AudioNode, reverb = 1) {
  node.connect(sound.master);
  if (reverb <= 0) return;
  const send = sound.context.createGain();
  send.gain.value = reverb;
  node.connect(send).connect(sound.room);
}

interface Sweep {
  readonly type: BiquadFilterType;
  readonly from: number;
  readonly to: number;
  readonly q: number;
  readonly peak: number;
  readonly attack: number;
  readonly release: number;
}

/** Bruit filtré dont la fréquence glisse : souffles et whooshs. */
function breath(sound: Engine, sweep: Sweep, delay = 0) {
  const { context } = sound;
  const start = context.currentTime + delay;
  const end = start + sweep.attack + sweep.release;
  const source = context.createBufferSource();
  source.buffer = sound.noise;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = sweep.type;
  filter.Q.value = sweep.q;
  filter.frequency.setValueAtTime(sweep.from, start);
  filter.frequency.exponentialRampToValueAtTime(sweep.to, end);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(sweep.peak, start + sweep.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  source.connect(filter).connect(gain);
  output(sound, gain);
  source.start(start, Math.random());
  source.stop(end + 0.05);
}

/** Lame de verre effleurée : quelques partiels qui s'éteignent vite. */
function ring(sound: Engine, fundamental: number, level: number, decay: number, delay = 0) {
  const { context } = sound;
  const start = context.currentTime + delay;
  GLASS_PARTIALS.forEach((ratio, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = fundamental * ratio * (1 + (Math.random() - 0.5) * 0.004);
    const gain = context.createGain();
    const partialLevel = level / (index + 1);
    const partialDecay = decay / (1 + index * 0.6);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(partialLevel, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + partialDecay);
    oscillator.connect(gain);
    output(sound, gain, 1.4);
    oscillator.start(start);
    oscillator.stop(start + partialDecay + 0.05);
  });
}

/** Coup sourd très bas, pour l'arrivée de la lame contre l'écran. */
function thump(sound: Engine, delay: number) {
  const { context } = sound;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  oscillator.frequency.setValueAtTime(90, start);
  oscillator.frequency.exponentialRampToValueAtTime(38, start + 0.35);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.35, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
  oscillator.connect(gain);
  output(sound, gain, 0.3);
  oscillator.start(start);
  oscillator.stop(start + 0.5);
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** À appeler depuis un geste du visiteur (clic) : le navigateur l'exige. */
export function setSoundEnabled(value: boolean) {
  enabled = value;
  writePreference(value);
  if (value) activeEngine();
  else if (engine) void engine.context.suspend();
  for (const listener of listeners) listener();
}

/** La lame sort de la matière. */
export function playUnfold() {
  const sound = activeEngine();
  if (!sound) return;
  breath(sound, { type: 'bandpass', from: 500, to: 2600, q: 1.4, peak: 0.14, attack: 0.28, release: 0.6 });
  ring(sound, 1320, 0.045, 1.6, 0.22);
}

/** La lame se replie dans la matière. */
export function playFold() {
  const sound = activeEngine();
  if (!sound) return;
  breath(sound, { type: 'bandpass', from: 2400, to: 420, q: 1.2, peak: 0.09, attack: 0.12, release: 0.5 });
}

/** Le curseur effleure la lame. */
export function playTouch() {
  const sound = activeEngine();
  if (!sound) return;
  ring(sound, 1760, 0.02, 0.9);
}

/** La lame fonce vers la caméra, ou s'en éloigne à la fermeture. */
export function playLift(direction: 'in' | 'out', duration: number) {
  const sound = activeEngine();
  if (!sound) return;
  const seconds = duration / 1000;
  if (direction === 'in') {
    breath(sound, { type: 'lowpass', from: 180, to: 5200, q: 0.8, peak: 0.22, attack: seconds * 0.85, release: 0.35 });
    thump(sound, seconds * 0.85);
    ring(sound, 880, 0.03, 2.2, seconds * 0.85);
  } else {
    breath(sound, { type: 'lowpass', from: 4800, to: 160, q: 0.8, peak: 0.16, attack: 0.1, release: seconds });
  }
}
