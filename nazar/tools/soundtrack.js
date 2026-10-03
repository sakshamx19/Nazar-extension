// Generates a royalty-free soundtrack for the demo video: a light, upbeat synth loop
// (pad, bass, pluck arpeggio, soft drums) plus a "pop" on every click and a "whoosh"
// on every scene change. Pure JS, writes a 16-bit stereo WAV.
//
// soundtrack({ duration, clicks: [seconds], scenes: [seconds], musicStart, outroAt }, 'out.wav')
const fs = require('fs');

const SR = 44100;
const BPM = 112;
const BEAT = 60 / BPM;

// C - Am - F - G, two bars each. MIDI note numbers.
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function soundtrack(opts, outFile) {
  const { duration, clicks = [], scenes = [], musicStart = 0, outroAt = duration - 4, music = true } = opts;
  const N = Math.ceil((duration + 0.5) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const add = (i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

  // Deterministic noise so renders are repeatable.
  let seed = 7;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

  // music: false renders only the click / whoosh effects (for mixing over a real track).
  const bars = music ? Math.ceil(duration / (BEAT * 4)) + 1 : 0;
  for (let bar = 0; bar < bars; bar++) {
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const t0 = bar * 4 * BEAT;
    const drums = t0 >= musicStart && t0 < outroAt;

    // Pad: soft sines with slow attack/release across the bar, slight stereo detune.
    for (const note of chord) {
      const f = midi(note);
      const len = 4 * BEAT;
      for (let s = 0; s < len * SR; s++) {
        const t = s / SR;
        const env = Math.min(1, t / 0.35) * Math.min(1, (len - t) / 0.4);
        const v = 0.035 * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t));
        add(Math.floor((t0 + t) * SR), v * (1 + 0.15 * Math.sin(2 * Math.PI * 0.3 * t)), v * (1 - 0.15 * Math.sin(2 * Math.PI * 0.3 * t)));
      }
    }

    for (let beat = 0; beat < 4; beat++) {
      const tb = t0 + beat * BEAT;
      // Bass on beats 1 and 3 (and an off-beat push on 4).
      if (beat === 0 || beat === 2 || (drums && beat === 3)) {
        const f = midi(chord[0] - 24), len = beat === 3 ? BEAT * 0.45 : BEAT * 0.9;
        const offset = beat === 3 ? BEAT * 0.5 : 0;
        for (let s = 0; s < len * SR; s++) {
          const t = s / SR, env = Math.exp(-t * 4) * Math.min(1, t / 0.005);
          add(Math.floor((tb + offset + t) * SR), 0.16 * env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)));
        }
      }
      if (!drums) continue;
      // Kick on every beat.
      for (let s = 0; s < 0.25 * SR; s++) {
        const t = s / SR, f = 50 + 90 * Math.exp(-t * 30);
        add(Math.floor((tb + t) * SR), 0.32 * Math.exp(-t * 14) * Math.sin(2 * Math.PI * f * t));
      }
      // Clap on 2 and 4.
      if (beat === 1 || beat === 3) {
        let lp = 0;
        for (let s = 0; s < 0.18 * SR; s++) {
          const t = s / SR; lp += 0.5 * (noise() - lp);
          const env = Math.exp(-t * 22) * (t < 0.01 ? 0.6 : 1);
          add(Math.floor((tb + t) * SR), 0.09 * env * (noise() - lp), 0.09 * env * (noise() - lp));
        }
      }
      // Hi-hats on 8ths (high-passed noise).
      for (const half of [0, 0.5]) {
        let prev = 0;
        for (let s = 0; s < 0.05 * SR; s++) {
          const t = s / SR, n = noise(), hp = n - prev; prev = n;
          const pan = half ? 0.7 : 1.0;
          add(Math.floor((tb + half * BEAT + t) * SR), 0.035 * Math.exp(-t * 70) * hp * pan, 0.035 * Math.exp(-t * 70) * hp * (1.7 - pan));
        }
      }
      // Pluck arpeggio, 8th notes through the chord one octave up.
      for (const half of [0, 0.5]) {
        const step = beat * 2 + (half ? 1 : 0);
        const note = chord[[0, 1, 2, 1, 0, 2, 1, 2][step]] + 12;
        const f = midi(note);
        for (let s = 0; s < 0.3 * SR; s++) {
          const t = s / SR, env = Math.exp(-t * 9);
          const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * t));
          const v = 0.045 * env * tri;
          add(Math.floor((tb + half * BEAT + t) * SR), v * (step % 2 ? 0.7 : 1), v * (step % 2 ? 1 : 0.7));
        }
      }
    }
  }

  // Click "pop": short pitched blip with a tiny noise transient.
  for (const c of clicks) {
    for (let s = 0; s < 0.09 * SR; s++) {
      const t = s / SR, f = 1400 - 600 * Math.min(1, t / 0.05);
      add(Math.floor((c + t) * SR), 0.22 * Math.exp(-t * 45) * Math.sin(2 * Math.PI * f * t) + 0.05 * Math.exp(-t * 300) * noise());
    }
  }
  // Scene "whoosh": rising filtered noise ending on the cut.
  for (const sc of scenes) {
    const len = 0.45;
    let lp = 0;
    for (let s = 0; s < len * SR; s++) {
      const t = s / SR, k = 0.02 + 0.5 * (t / len);
      lp += k * (noise() - lp);
      const env = Math.sin(Math.PI * t / len) ** 2;
      add(Math.floor((sc - len * 0.8 + t) * SR), 0.18 * env * lp, 0.18 * env * lp * 0.8);
    }
  }

  // Master: fade in/out, gentle saturation, normalise.
  const fadeIn = 0.6 * SR, fadeOut = 2.5 * SR, end = Math.floor(duration * SR);
  let peak = 0;
  for (let i = 0; i < N; i++) {
    let g = 1;
    if (i < fadeIn) g = i / fadeIn;
    if (i > end - fadeOut) g = Math.max(0, (end - i) / fadeOut);
    L[i] = Math.tanh(L[i] * g * 1.2); R[i] = Math.tanh(R[i] * g * 1.2);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = peak > 0 ? 0.89 / peak : 1;

  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(outFile, buf);
}

module.exports = { soundtrack };
