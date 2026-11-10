import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Original miniature for the scene, synthesized entirely from oscillators and
// seeded noise. No recording, sample pack, or existing song is used.
const sampleRate = 22050;
const bpm = 108;
const beatsPerBar = 4;
const bars = 24;
const beat = 60 / bpm;
const duration = bars * beatsPerBar * beat;
const count = Math.round(duration * sampleRate);
const left = new Float64Array(count);
const right = new Float64Array(count);
const tau = Math.PI * 2;
let seed = 0x0baba108;
function random() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
function add(time, samples, gain, pan = 0) {
  const start = Math.round(time * sampleRate);
  const l = Math.cos((pan + 1) * Math.PI / 4) * gain;
  const r = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = 0; i < samples.length; i++) {
    // Wrap every release and room reflection over the end of the loop.
    const index = ((start + i) % count + count) % count;
    left[index] += samples[i] * l;
    right[index] += samples[i] * r;
  }
}
function makeNote(seconds, render) {
  const samples = new Float64Array(Math.ceil(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) samples[i] = render(i / sampleRate, i);
  return samples;
}
function pluck(midi, time, gain, pan = .2, sustain = 1) {
  const hz = frequency(midi);
  const ringLength = Math.round(sampleRate / hz - .5);
  const ring = new Float64Array(ringLength);
  let smoothed = 0;
  for (let i = 0; i < ring.length; i++) {
    smoothed = smoothed * .57 + (random() * 2 - 1) * .43;
    ring[i] = smoothed;
  }
  const seconds = .95 * sustain;
  const samples = makeNote(seconds, (t, i) => {
    const index = i % ringLength;
    const value = (ring[index] + ring[(index + 1) % ringLength]) * .496;
    ring[index] = value;
    const attack = 1 - Math.exp(-t * 550);
    const release = Math.min(1, (seconds - t) / .075);
    // A quiet body resonance fills out the small acoustic-string timbre.
    return attack * release * (value * 2.1 * Math.exp(-t * 1.9 / sustain)
      + Math.sin(tau * hz * t) * .11 * Math.exp(-t * 5 / sustain));
  });
  add(time, samples, gain, pan);
}
function marimba(midi, time, gain, pan, length = .9) {
  const hz = frequency(midi);
  const samples = makeNote(length, t => {
    const attack = 1 - Math.exp(-t * 380);
    const release = Math.min(1, (length - t) / .06);
    return attack * release * (
      Math.sin(tau * hz * t) * Math.exp(-t * 4.8)
      + .18 * Math.sin(tau * hz * 3.99 * t) * Math.exp(-t * 17)
      + .035 * Math.sin(tau * hz * 9.97 * t) * Math.exp(-t * 34));
  });
  add(time, samples, gain, pan);
  add(time + beat * .75, samples, gain * .065, -pan);
}
function bass(midi, time, gain, length = .48) {
  const hz = frequency(midi);
  add(time, makeNote(length, t => {
    const attack = 1 - Math.exp(-t * 180);
    const release = Math.min(1, (length - t) / .07);
    return attack * release * Math.exp(-t * 3.7) * (
      Math.sin(tau * hz * t) + .14 * Math.sin(tau * hz * 2 * t));
  }), gain);
}
function kick(time, gain) {
  add(time, makeNote(.25, t => {
    const phase = tau * (48 * t + 32 * .032 * (1 - Math.exp(-t / .032)));
    return Math.sin(phase) * Math.exp(-t * 23) * (1 - Math.exp(-t * 900));
  }), gain);
}
function shaker(time, gain, pan) {
  let previous = 0;
  add(time, makeNote(.065, t => {
    const noise = random() * 2 - 1;
    const high = noise - previous; previous = noise;
    return high * .5 * Math.exp(-t * 74) * (1 - Math.exp(-t * 1100));
  }), gain, pan);
}
function rim(time, gain) {
  add(time, makeNote(.09, t => (Math.sin(tau * 920 * t) + .3 * Math.sin(tau * 1430 * t))
    * Math.exp(-t * 100) * (1 - Math.exp(-t * 1400))), gain, -.13);
}

// Eight-bar verse: C6 - Am7 - Fmaj7 - G6 - Cmaj7 - Am7 - Dm7 - G7.
const chords = [
  { notes: [60, 64, 67, 69], root: 36, fifth: 43 },
  { notes: [57, 60, 64, 67], root: 33, fifth: 40 },
  { notes: [57, 60, 64, 65], root: 29, fifth: 36 },
  { notes: [55, 59, 62, 64], root: 31, fifth: 38 },
  { notes: [59, 60, 64, 67], root: 36, fifth: 43 },
  { notes: [57, 60, 64, 67], root: 33, fifth: 40 },
  { notes: [57, 60, 62, 65], root: 38, fifth: 45 },
  { notes: [55, 59, 62, 65], root: 31, fifth: 38 },
];
const melody = [
  [[.5, 76], [1.25, 79], [2, 81], [2.75, 79], [3.5, 76]],
  [[0, 72], [.75, 76], [1.5, 79], [2.5, 76], [3.5, 72]],
  [[0, 69], [.75, 72], [1.5, 76], [2.25, 79], [3, 76], [3.5, 72]],
  [[0, 74], [1, 79], [1.75, 81], [2.5, 79], [3.25, 74], [3.75, 71]],
  [[0, 76], [.75, 79], [1.5, 84], [2.25, 83], [2.75, 81], [3.5, 79]],
  [[0, 76], [.75, 81], [1.5, 79], [2.5, 76], [3.25, 72]],
  [[0, 74], [.75, 77], [1.5, 81], [2.25, 79], [3, 77], [3.5, 74]],
  [[0, 74], [.75, 79], [1.5, 83], [2.25, 81], [2.75, 79], [3.5, 74]],
];

for (let bar = 0; bar < bars; bar++) {
  const verse = Math.floor(bar / 8);
  const chord = chords[bar % 8];
  const base = bar * beatsPerBar * beat;
  // Gentle down/up syncopation, with hand-like offsets instead of rigid clicks.
  for (const [offset, strength, up] of [[0, .82, false], [1, .63, false], [1.5, .4, true],
    [2.5, .67, true], [3, .7, false], [3.5, .43, true]]) {
    const notes = up ? [...chord.notes].reverse() : chord.notes;
    notes.forEach((note, i) => pluck(note, base + offset * beat + i * .011,
      .12 * strength, .24, offset === 0 ? 1.3 : .82));
  }
  bass(chord.root, base, .115, .58);
  bass(chord.fifth, base + 2 * beat, .088, .44);
  if (bar % 2) bass(chord.root + 12, base + 3.5 * beat, .055, .23);
  kick(base, .045); kick(base + 2 * beat, .034);
  rim(base + beat, .021); rim(base + 3 * beat, .023);
  for (let subdivision = 0; subdivision < 8; subdivision++) {
    const swing = subdivision % 2 ? .017 : 0;
    shaker(base + subdivision * beat / 2 + swing, subdivision % 2 ? .013 : .019,
      subdivision % 2 ? .48 : -.4);
  }
  const phrase = melody[bar % 8];
  phrase.forEach(([offset, note], index) => {
    // Verse two answers a little lower; verse three returns to the main tune.
    const shift = verse === 1 && bar % 8 >= 4 ? -12 : 0;
    const velocity = index % 2 ? .073 : .089;
    marimba(note + shift, base + offset * beat + .006, velocity,
      -.22 + (bar % 4) * .07, .82);
  });
  // Quiet closing replies leave breathing space between the melodic phrases.
  if (verse !== 1 && bar % 8 === 1) pluck(79, base + 3.75 * beat, .043, -.28);
  if (verse === 1 && bar % 8 === 3) marimba(67, base + 3.5 * beat, .044, .3);
}

// A small stereo room, calculated circularly so reverb also crosses the seam.
const dryLeft = left.slice();
const dryRight = right.slice();
for (const [seconds, level] of [[.071, .07], [.113, .045], [.173, .025]]) {
  const delay = Math.round(seconds * sampleRate);
  for (let i = 0; i < count; i++) {
    const source = (i - delay + count) % count;
    left[i] += dryRight[source] * level;
    right[i] += dryLeft[source] * level;
  }
}
let peak = 0;
for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const normalization = .7 / peak;
const wav = Buffer.alloc(44 + count * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(count * 4, 40);
let squares = 0;
for (let i = 0; i < count; i++) {
  const l = left[i] * normalization;
  const r = right[i] * normalization;
  squares += l * l + r * r;
  wav.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}
const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/music');
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'tiem-vui.wav'), wav);
const metadata = {
  title: 'Tiệm vui', file: 'tiem-vui.wav', type: 'original synthesized instrumental',
  description: 'Original cheerful marimba and acoustic plucked-string miniature with soft bass, shaker, and rim percussion. Composed for this scene; not an arrangement of an existing song.',
  provenance: 'Generated entirely by scripts/generate-background-music.mjs using oscillators and deterministic seeded noise. No external audio, recordings, or sample packs.',
  bpm, bars, timeSignature: '4/4', key: 'C major', seamlessLoop: true,
  durationSeconds: count / sampleRate, sampleRate, channels: 2, bitsPerSample: 16,
  peakAmplitude: .7, rmsAmplitude: Math.sqrt(squares / (count * 2)),
};
await writeFile(path.join(outputDir, 'SOURCES.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ file: path.join(outputDir, 'tiem-vui.wav'), bytes: wav.length, ...metadata }, null, 2));
