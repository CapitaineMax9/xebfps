// Sons synthétisés en temps réel (WebAudio), spatialisés pour les autres joueurs.
let ctx = null, master = null, noiseBuf = null;
let volume = 0.6;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

export function setListener(pos, fwd, up) {
  if (!ctx) return;
  const l = ctx.listener;
  if (l.positionX) {
    const t = ctx.currentTime;
    l.positionX.setTargetAtTime(pos.x, t, 0.01); l.positionY.setTargetAtTime(pos.y, t, 0.01); l.positionZ.setTargetAtTime(pos.z, t, 0.01);
    l.forwardX.setTargetAtTime(fwd.x, t, 0.01); l.forwardY.setTargetAtTime(fwd.y, t, 0.01); l.forwardZ.setTargetAtTime(fwd.z, t, 0.01);
    l.upX.setTargetAtTime(up.x, t, 0.01); l.upY.setTargetAtTime(up.y, t, 0.01); l.upZ.setTargetAtTime(up.z, t, 0.01);
  } else {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

// Sortie : directe (son du joueur) ou spatialisée
function out(pos, gain = 1, refDist = 6) {
  const g = ctx.createGain();
  g.gain.value = Math.max(0, fin(gain, 1));
  // position spatialisée seulement si toutes les coordonnées sont finies
  const spatial = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z);
  if (spatial) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.rolloffFactor = 1.1;
    p.maxDistance = 200;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p).connect(master);
  } else g.connect(master);
  return g;
}

function noise(dest, t, dur, { type = 'lowpass', freq = 2000, q = 0.7, freqEnd = null, attack = 0.002, gain = 1, decay = null } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  freq = Math.max(1, fin(freq, 2000)); gain = Math.max(0.0001, fin(gain, 1));
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = Math.max(0.0001, fin(q, 0.7));
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(1, fin(freqEnd, freq)), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.7);
  src.stop(t + dur + 0.05);
}

function tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.5, attack = 0.003 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  freq = Math.max(1, fin(freq, 440)); gain = Math.max(0.0001, fin(gain, 0.5));
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, fin(freqEnd, freq)), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

const SHOTS = {
  pistol: (d, t) => { noise(d, t, 0.18, { freq: 3200, freqEnd: 600, gain: 0.9 }); tone(d, t, 0.08, { freq: 180, freqEnd: 60, gain: 0.6, type: 'triangle' }); },
  deagle: (d, t) => { noise(d, t, 0.35, { freq: 2500, freqEnd: 300, gain: 1.1 }); tone(d, t, 0.18, { freq: 120, freqEnd: 40, gain: 0.9, type: 'triangle' }); noise(d, t + 0.02, 0.4, { freq: 500, gain: 0.3, type: 'bandpass' }); },
  silenced: (d, t) => { noise(d, t, 0.09, { freq: 1500, freqEnd: 300, gain: 0.5, type: 'bandpass', q: 1.2 }); tone(d, t, 0.05, { freq: 300, freqEnd: 120, gain: 0.25 }); },
  silencedRifle: (d, t) => { noise(d, t, 0.12, { freq: 1800, freqEnd: 300, gain: 0.6, type: 'bandpass', q: 1 }); tone(d, t, 0.06, { freq: 220, freqEnd: 80, gain: 0.35, type: 'triangle' }); noise(d, t + 0.01, 0.06, { freq: 5000, gain: 0.12, type: 'highpass' }); },
  smg: (d, t) => { noise(d, t, 0.14, { freq: 3500, freqEnd: 700, gain: 0.75 }); tone(d, t, 0.06, { freq: 160, freqEnd: 70, gain: 0.5, type: 'triangle' }); },
  ak: (d, t) => { noise(d, t, 0.28, { freq: 2600, freqEnd: 400, gain: 1.0 }); tone(d, t, 0.12, { freq: 130, freqEnd: 45, gain: 0.85, type: 'triangle' }); noise(d, t + 0.015, 0.3, { freq: 700, gain: 0.25, type: 'bandpass' }); },
  shotgun: (d, t) => { noise(d, t, 0.5, { freq: 1800, freqEnd: 200, gain: 1.2 }); tone(d, t, 0.25, { freq: 90, freqEnd: 35, gain: 1.0, type: 'triangle' }); },
  sniper: (d, t) => { noise(d, t, 0.55, { freq: 3000, freqEnd: 250, gain: 1.1 }); tone(d, t, 0.25, { freq: 110, freqEnd: 35, gain: 1.0, type: 'triangle' }); },
  awp: (d, t) => {
    // détonation énorme + claquement + écho
    noise(d, t, 0.06, { freq: 7000, gain: 0.8, type: 'highpass' });
    noise(d, t, 0.9, { freq: 2200, freqEnd: 120, gain: 1.4 });
    tone(d, t, 0.45, { freq: 85, freqEnd: 28, gain: 1.3, type: 'sine' });
    tone(d, t, 0.12, { freq: 220, freqEnd: 60, gain: 0.7, type: 'square' });
    noise(d, t + 0.18, 0.9, { freq: 600, freqEnd: 150, gain: 0.25, type: 'bandpass', attack: 0.05 });
  },
};

// sons des nouvelles armes
Object.assign(SHOTS, {
  famas: (d, t) => { noise(d, t, 0.2, { freq: 3000, freqEnd: 500, gain: 0.85 }); tone(d, t, 0.08, { freq: 150, freqEnd: 60, gain: 0.6, type: 'triangle' }); },
  lmg: (d, t) => { noise(d, t, 0.3, { freq: 2200, freqEnd: 300, gain: 1.05 }); tone(d, t, 0.14, { freq: 110, freqEnd: 40, gain: 0.9, type: 'triangle' }); },
  rail: (d, t) => {
    tone(d, t, 0.5, { freq: 2400, freqEnd: 180, gain: 0.5, type: 'sawtooth' });
    tone(d, t, 0.35, { freq: 90, freqEnd: 40, gain: 0.9, type: 'sine' });
    noise(d, t, 0.4, { freq: 6000, freqEnd: 800, gain: 0.5, type: 'bandpass', q: 3 });
  },
  rpg: (d, t) => { noise(d, t, 0.6, { freq: 900, freqEnd: 3000, gain: 0.9, type: 'bandpass', q: 1, attack: 0.02 }); tone(d, t, 0.3, { freq: 70, freqEnd: 40, gain: 0.8 }); },
  bow: (d, t) => { tone(d, t, 0.25, { freq: 180, freqEnd: 90, gain: 0.6, type: 'triangle' }); noise(d, t, 0.05, { freq: 3000, type: 'bandpass', q: 4, gain: 0.5 }); },
  party: (d, t) => {
    noise(d, t, 0.15, { freq: 2500, freqEnd: 800, gain: 0.8 });
    tone(d, t + 0.02, 0.35, { freq: 520, freqEnd: 700, gain: 0.35, type: 'square' });
    tone(d, t + 0.02, 0.35, { freq: 660, freqEnd: 880, gain: 0.25, type: 'square' });
  },
  zap: (d, t) => { tone(d, t, 0.4, { freq: 60, freqEnd: 55, gain: 0.5, type: 'square' }); noise(d, t, 0.4, { freq: 5000, type: 'highpass', gain: 0.5 }); },
  minigun: (d, t) => { noise(d, t, 0.1, { freq: 2800, freqEnd: 500, gain: 0.7 }); tone(d, t, 0.05, { freq: 140, freqEnd: 70, gain: 0.4, type: 'square' }); },
  throw: (d, t) => { noise(d, t, 0.18, { freq: 1200, freqEnd: 400, gain: 0.3, type: 'bandpass', q: 1, attack: 0.03 }); },
  cast_fire: (d, t) => { noise(d, t, 0.3, { freq: 900, freqEnd: 180, gain: 0.5, type: 'bandpass', q: 1 }); tone(d, t, 0.2, { freq: 120, freqEnd: 60, gain: 0.4, type: 'sawtooth' }); },
  cast_bolt: (d, t) => { tone(d, t, 0.18, { freq: 1600, freqEnd: 400, gain: 0.35, type: 'sawtooth' }); noise(d, t, 0.2, { freq: 5000, type: 'highpass', gain: 0.4 }); },
  cast_ice: (d, t) => { tone(d, t, 0.35, { freq: 2600, freqEnd: 900, gain: 0.25, type: 'sine' }); noise(d, t, 0.35, { freq: 4000, type: 'bandpass', q: 2, gain: 0.3 }); },
  cast_arcane: (d, t) => { tone(d, t, 0.3, { freq: 520, freqEnd: 900, gain: 0.3, type: 'triangle' }); tone(d, t, 0.3, { freq: 780, freqEnd: 1300, gain: 0.15, type: 'triangle' }); },
  cast_heal: (d, t) => { tone(d, t, 0.4, { freq: 660, freqEnd: 990, gain: 0.3, type: 'sine' }); tone(d, t + 0.1, 0.4, { freq: 880, freqEnd: 1320, gain: 0.2, type: 'sine' }); },
  cast_summon: (d, t) => { tone(d, t, 0.5, { freq: 200, freqEnd: 400, gain: 0.35, type: 'square' }); noise(d, t, 0.4, { freq: 600, gain: 0.25, type: 'bandpass', q: 1, attack: 0.1 }); },
});

export function playFlashbang(pos = null, intensity = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 1.3 * intensity, 10);
  noise(d, t, 0.25, { freq: 6000, freqEnd: 1500, gain: 1.2 });
  tone(d, t, 0.15, { freq: 200, freqEnd: 90, gain: 0.8, type: 'triangle' });
  // acouphène pour celui qui est flashé
  if (!pos && intensity > 0.3) { const g = out(null, 0.25 * intensity); tone(g, t + 0.05, 1.5 * intensity, { freq: 4200, gain: 0.3, type: 'sine', attack: 0.05 }); }
}

export function playFireLoop() { /* le feu utilise des particules, pas de boucle audio dédiée */ }

export function playSaber(pos = null, swing = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 0.6);
  if (swing) { tone(d, t, 0.3, { freq: 420, freqEnd: 180, gain: 0.4, type: 'sawtooth' }); noise(d, t, 0.25, { freq: 1200, type: 'bandpass', q: 3, gain: 0.3, attack: 0.03 }); }
  else { tone(d, t, 0.4, { freq: 90, gain: 0.3, type: 'sawtooth' }); tone(d, t, 0.4, { freq: 180, gain: 0.15, type: 'square' }); }
}

export function playBonk(pos = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 0.8);
  tone(d, t, 0.6, { freq: 310, freqEnd: 290, gain: 0.6, type: 'sine' });
  tone(d, t, 0.45, { freq: 920, freqEnd: 880, gain: 0.25, type: 'sine' });
  tone(d, t, 0.3, { freq: 1650, gain: 0.12, type: 'triangle' });
  noise(d, t, 0.05, { freq: 3000, type: 'bandpass', gain: 0.5 });
}

export function playExplosion(pos = null, gain = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 1.6 * gain, 12);
  noise(d, t, 1.4, { freq: 1200, freqEnd: 60, gain: 1.5 });
  tone(d, t, 0.8, { freq: 70, freqEnd: 25, gain: 1.4, type: 'sine' });
  noise(d, t + 0.05, 1.6, { freq: 400, freqEnd: 80, gain: 0.5, type: 'bandpass', attack: 0.1 });
}

export function playShot(kind, pos = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, pos ? 1.2 : 0.55, pos ? 10 : 6);
  (SHOTS[kind] || SHOTS.pistol)(d, t);
}

export function playKnife(pos = null, hit = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 0.6);
  noise(d, t, 0.2, { freq: 900, freqEnd: 3500, type: 'bandpass', q: 2, gain: 0.5, attack: 0.05 });
  if (hit) { noise(d, t + 0.05, 0.12, { freq: 400, gain: 0.8 }); tone(d, t + 0.05, 0.1, { freq: 120, freqEnd: 60, gain: 0.5 }); }
}

export function playClick(pos = null, pitch = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 0.5, 3);
  noise(d, t, 0.03, { freq: 4000 * pitch, type: 'bandpass', q: 4, gain: 0.7 });
  tone(d, t, 0.03, { freq: 1800 * pitch, gain: 0.15, type: 'square' });
}

export function playReload(weaponKind, pos = null, duration = 2.2) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 0.45, 3);
  const steps = weaponKind === 'shotgun' ? [0.1] : [0.15, duration * 0.45, duration * 0.8];
  steps.forEach((s, i) => {
    noise(d, t + s, 0.05, { freq: 2500 + i * 800, type: 'bandpass', q: 3, gain: 0.8 });
    tone(d, t + s, 0.04, { freq: 900 + i * 300, gain: 0.12, type: 'square' });
  });
}

export function playBolt(pos = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 0.5, 3);
  [0.35, 0.6, 0.85].forEach((s, i) => noise(d, t + s, 0.05, { freq: 3000 - i * 500, type: 'bandpass', q: 3, gain: 0.7 }));
}

export function playZoom() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(null, 0.25);
  noise(d, t, 0.06, { freq: 5000, type: 'highpass', gain: 0.4 });
}

export function playStep(pos = null, gain = 0.35) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, gain, 3);
  noise(d, t, 0.09, { freq: 450 + Math.random() * 300, gain: 0.8, type: 'lowpass' });
  tone(d, t, 0.05, { freq: 80, freqEnd: 50, gain: 0.25 });
}

export function playLand(pos = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 0.5, 3);
  noise(d, t, 0.15, { freq: 300, gain: 0.9 });
}

export function playHit(headshot) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(null, 0.5);
  if (headshot) { tone(d, t, 0.25, { freq: 2600, gain: 0.35, type: 'sine' }); tone(d, t, 0.2, { freq: 3900, gain: 0.15, type: 'sine' }); }
  else noise(d, t, 0.06, { freq: 900, gain: 0.5, type: 'bandpass', q: 2 });
}

export function playKill(headshot) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(null, 0.45);
  tone(d, t, 0.15, { freq: 880, gain: 0.3, type: 'triangle' });
  tone(d, t + 0.08, 0.22, { freq: headshot ? 1760 : 1320, gain: 0.3, type: 'triangle' });
}

export function playHurt() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(null, 0.5);
  noise(d, t, 0.15, { freq: 600, gain: 0.7 });
  tone(d, t, 0.12, { freq: 140, freqEnd: 70, gain: 0.4 });
}

export function playImpact(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(pos, 0.25, 2);
  noise(d, t, 0.06, { freq: 2500, type: 'bandpass', q: 1.5, gain: 0.6 });
}

export function playTick(pitch = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(null, 0.3);
  tone(d, t, 0.03, { freq: 1500 * pitch, gain: 0.25, type: 'square' });
}

export function playReveal(rarity) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(null, 0.5);
  const notes = { milspec: [523, 659], restricted: [523, 659, 784], classified: [523, 659, 784, 1047], covert: [440, 554, 659, 880, 1109], gold: [523, 659, 784, 1047, 1319, 1568] }[rarity] || [523];
  notes.forEach((f, i) => tone(d, t + i * 0.09, 0.5, { freq: f, gain: 0.25, type: 'triangle' }));
  if (rarity === 'gold' || rarity === 'covert') noise(d, t, 1.2, { freq: 8000, type: 'highpass', gain: 0.15, attack: 0.2 });
}

export function playUi() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = out(null, 0.2);
  tone(d, t, 0.05, { freq: 1200, gain: 0.2, type: 'sine' });
}
