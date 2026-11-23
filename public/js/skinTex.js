// Génération procédurale des textures de skins (canvas 2D).
import * as THREE from 'three';
import { SKINS } from '/shared/skins.js';

const SIZE = 512;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── Bruit de valeur 2D (tuilable) ──────────────────────────────────────────
function makeNoise(rnd, period = 8) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const f = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const p = period;
    const i0 = ((xi % p) + p) % p, j0 = ((yi % p) + p) % p, i1 = (i0 + 1) % p, j1 = (j0 + 1) % p;
    const a = g[j0 * p + i0], b = g[j0 * p + i1], c = g[j1 * p + i0], d = g[j1 * p + i1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return f;
}

function fbm(noises, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noises[i % noises.length](x * f, y * f) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function palette(cols, t) {
  t = Math.max(0, Math.min(0.9999, t));
  const n = cols.length - 1;
  const i = Math.floor(t * n);
  return mix(cols[i], cols[i + 1], t * n - i);
}

// Remplit un canvas pixel par pixel à basse résolution puis l'agrandit
function pixelPass(ctx, res, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = res;
  const cx = c.getContext('2d');
  const img = cx.createImageData(res, res);
  const d = img.data;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const col = fn(x / res, y / res);
      const k = (y * res + x) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = col[3] ?? 255;
    }
  }
  cx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, SIZE, SIZE);
}

// ── Motifs ─────────────────────────────────────────────────────────────────
const P = {};

P.solid = (ctx, c, rnd) => {
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  g.addColorStop(0, c[0]); g.addColorStop(1, c[1] || c[0]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
  // grain anodisé
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`;
    ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 2, 2);
  }
};

P.camo = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  for (let layer = 1; layer < c.length; layer++) {
    ctx.fillStyle = c[layer];
    const n = 26 - layer * 4;
    for (let i = 0; i < n; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 25 + rnd() * 55;
      for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
        ctx.beginPath();
        const pts = 9;
        for (let k = 0; k <= pts; k++) {
          const a = (k / pts) * Math.PI * 2;
          const rr = r * (0.6 + rnd() * 0.6);
          const px = x + ox + Math.cos(a) * rr * 1.4, py = y + oy + Math.sin(a) * rr;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
    }
  }
};

P.digital = (ctx, c, rnd) => {
  const cols = c.map(hexToRgb);
  const n1 = makeNoise(rnd, 8), n2 = makeNoise(rnd, 16);
  const cell = 16;
  for (let y = 0; y < SIZE; y += cell) for (let x = 0; x < SIZE; x += cell) {
    const v = (n1(x / SIZE * 8, y / SIZE * 8) * 0.7 + n2(x / SIZE * 16, y / SIZE * 16) * 0.3);
    const idx = Math.min(cols.length - 1, Math.floor(v * cols.length * 1.1));
    const col = cols[Math.max(0, idx)];
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(x, y, cell, cell);
  }
};

P.waves = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  const ph = rnd() * 10;
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = c[1 + (i % (c.length - 1))];
    ctx.lineWidth = 3 + (i % 3) * 3;
    ctx.globalAlpha = 0.5 + (i % 2) * 0.5;
    ctx.beginPath();
    for (let x = 0; x <= SIZE; x += 8) {
      const y = i * 20 + Math.sin(x / SIZE * Math.PI * 4 + ph + i * 0.4) * 14 + Math.sin(x / SIZE * Math.PI * 2) * 8;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

P.fade = (ctx, c, rnd) => {
  const a = rnd() * 0.6 - 0.3;
  const g = ctx.createLinearGradient(SIZE * (0.5 - Math.cos(a) * 0.6), SIZE * (0.5 - Math.sin(a) * 0.6), SIZE * (0.5 + Math.cos(a) * 0.6), SIZE * (0.5 + Math.sin(a) * 0.6));
  c.forEach((col, i) => g.addColorStop(i / (c.length - 1), col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
  // reflets métalliques
  const h = ctx.createLinearGradient(0, 0, 0, SIZE);
  h.addColorStop(0, 'rgba(255,255,255,0.18)'); h.addColorStop(0.5, 'rgba(255,255,255,0)'); h.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = h; ctx.fillRect(0, 0, SIZE, SIZE);
};

P.hex = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  const r = 22, w = Math.sqrt(3) * r;
  for (let row = -1; row < SIZE / (r * 1.5) + 1; row++) {
    for (let col = -1; col < SIZE / w + 1; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + k * Math.PI / 3;
        const px = cx + Math.cos(a) * (r - 2), py = cy + Math.sin(a) * (r - 2);
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      if (rnd() < 0.22) { ctx.fillStyle = c[1]; ctx.globalAlpha = 0.35 + rnd() * 0.6; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = rnd() < 0.5 ? c[1] : (c[2] || c[1]);
      ctx.lineWidth = 3; ctx.stroke();
    }
  }
};

P.carbon = (ctx, c, rnd) => {
  const s = 8;
  for (let y = 0; y < SIZE; y += s) for (let x = 0; x < SIZE; x += s) {
    const odd = ((x / s + y / s) % 2) === 0;
    const g = ctx.createLinearGradient(x, y, odd ? x + s : x, odd ? y : y + s);
    g.addColorStop(0, c[0]); g.addColorStop(0.5, c[1]); g.addColorStop(1, c[0]);
    ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
  }
  if (c[2]) {
    ctx.fillStyle = c[2];
    const y0 = SIZE * (0.3 + rnd() * 0.3);
    ctx.fillRect(0, y0, SIZE, 18);
    ctx.fillRect(0, y0 + 28, SIZE, 5);
  }
};

P.stripes = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  if (c[2]) {
    const g = ctx.createLinearGradient(0, 0, SIZE, 0);
    g.addColorStop(0, c[0]); g.addColorStop(0.5, c[2]); g.addColorStop(1, c[0]);
    ctx.globalAlpha = 0.5; ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = c[1];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * SIZE + rnd() * 18;
    const w = 8 + rnd() * 16;
    for (const ox of [-SIZE, 0, SIZE]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, -10);
      let y = -10;
      const pts = [];
      while (y < SIZE + 10) { y += 30 + rnd() * 40; pts.push([x + ox + (rnd() - 0.5) * 40, y]); }
      for (const p of pts) ctx.lineTo(p[0] + w * 0.5, p[1]);
      for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0] - w * 0.5 + (rnd() - 0.5) * 6, pts[k][1]);
      ctx.closePath(); ctx.fill();
    }
  }
};

P.lightning = (ctx, c, rnd) => {
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  g.addColorStop(0, c[0]); g.addColorStop(0.5, shade(c[1], -0.7)); g.addColorStop(1, c[0]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
  let r2 = rnd;
  const bolt = (x, y, ang, len, w, depth) => {
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y);
    let px = x, py = y;
    const seg = 10;
    for (let i = 0; i < seg; i++) {
      ang += (r2() - 0.5) * 0.9;
      px += Math.cos(ang) * len / seg; py += Math.sin(ang) * len / seg;
      ctx.lineTo(px, py);
      if (depth < 2 && r2() < 0.25) {
        ctx.stroke();
        bolt(px, py, ang + (r2() - 0.5) * 1.6, len * 0.45, w * 0.6, depth + 1);
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(px, py);
      }
    }
    ctx.stroke();
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const boltSeed = Math.floor(rnd() * 1e9);
  for (let pass = 0; pass < 2; pass++) {
    r2 = mulberry32(boltSeed);
    ctx.shadowColor = c[1]; ctx.shadowBlur = pass ? 4 : 22;
    ctx.strokeStyle = pass ? c[2] : c[1];
    for (let i = 0; i < 7; i++) {
      const sx = r2() * SIZE, sy = r2() * SIZE * 0.2;
      ctx.lineWidth = pass ? 2 : 6;
      bolt(sx, sy, Math.PI / 2 + (r2() - 0.5), SIZE * 0.9, pass ? 2 : 6, 0);
    }
  }
  ctx.shadowBlur = 0;
};

P.scales = (ctx, c, rnd) => {
  ctx.fillStyle = c[2] || '#000'; ctx.fillRect(0, 0, SIZE, SIZE);
  const r = 26;
  for (let row = -1; row < SIZE / (r * 0.7) + 2; row++) {
    for (let col = -1; col < SIZE / (r * 1.6) + 2; col++) {
      const cx = col * r * 1.6 + (row % 2 ? r * 0.8 : 0), cy = row * r * 0.7;
      const g = ctx.createRadialGradient(cx, cy - r * 0.4, 2, cx, cy, r);
      const t = (Math.sin(cx / SIZE * Math.PI * 2 + rnd() * 0.5) + 1) / 2;
      g.addColorStop(0, c[3] || c[1]);
      g.addColorStop(0.45, t > 0.5 ? c[1] : c[0]);
      g.addColorStop(1, c[2] || '#000');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
};

P.flames = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  for (let layer = 0; layer < 2; layer++) {
    const col = c[1 + layer] || c[1];
    for (let i = 0; i < 18; i++) {
      const x = rnd() * SIZE, base = SIZE + 20, h = SIZE * (0.35 + rnd() * 0.55) * (layer ? 0.7 : 1), w = 30 + rnd() * 40;
      const g = ctx.createLinearGradient(0, base, 0, base - h);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      for (const ox of [-SIZE, 0, SIZE]) {
        ctx.beginPath();
        ctx.moveTo(x + ox - w, base);
        ctx.bezierCurveTo(x + ox - w * 0.8, base - h * 0.5, x + ox + w * 0.6 * (rnd() - 0.3), base - h * 0.7, x + ox + (rnd() - 0.5) * w, base - h);
        ctx.bezierCurveTo(x + ox + w * 0.3, base - h * 0.6, x + ox + w * 0.9, base - h * 0.4, x + ox + w, base);
        ctx.closePath(); ctx.fill();
      }
    }
  }
};

P.casehard = (ctx, c, rnd) => {
  const cols = c.map(hexToRgb);
  const ns = [makeNoise(rnd, 6), makeNoise(rnd, 12), makeNoise(rnd, 24), makeNoise(rnd, 48)];
  pixelPass(ctx, 192, (u, v) => {
    const n = fbm(ns, u * 6, v * 6, 4);
    const m = fbm(ns, u * 6 + 3.3, v * 6 + 1.7, 3);
    let col;
    if (n < 0.45) col = mix(cols[0], cols[2], Math.max(0, (n - 0.3) / 0.15));
    else if (n < 0.55) col = mix(cols[2], cols[1], (n - 0.45) / 0.1);
    else col = mix(cols[1], cols[0], Math.max(0, (m - 0.5) * 1.6));
    const k = 0.75 + m * 0.5;
    return [col[0] * k, col[1] * k, col[2] * k];
  });
};

P.doppler = (ctx, c, rnd) => {
  const cols = c.map(hexToRgb);
  const ns = [makeNoise(rnd, 5), makeNoise(rnd, 10), makeNoise(rnd, 20), makeNoise(rnd, 40)];
  pixelPass(ctx, 192, (u, v) => {
    const w = fbm(ns, u * 5, v * 5, 3);
    const n = fbm(ns, u * 5 + w * 2.5, v * 5 + w * 2.5, 4);
    const t = (Math.sin(n * 14) + 1) / 2;
    const col = t < 0.5 ? mix(cols[0], cols[1], t * 2) : mix(cols[1], cols[2], (t - 0.5) * 2);
    return col;
  });
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
    const s = 1 + rnd() * 2;
    ctx.fillRect(rnd() * SIZE, rnd() * SIZE, s, s);
  }
};

P.marble = (ctx, c, rnd) => {
  const cols = c.map(hexToRgb);
  const ns = [makeNoise(rnd, 6), makeNoise(rnd, 12), makeNoise(rnd, 24), makeNoise(rnd, 48)];
  pixelPass(ctx, 192, (u, v) => {
    const n = fbm(ns, u * 6, v * 6, 4);
    const t = Math.abs(Math.sin((u * 4 + v * 2 + n * 4) * Math.PI));
    const vein = Math.pow(1 - t, 6);
    let col = mix(cols[0], cols[1], n * 0.8);
    col = mix(col, cols[2], vein);
    return col;
  });
};

P.circuit = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  const grid = 16;
  const draw = (col, w, blur, count, seedOff) => {
    const r = mulberry32(seedOff);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.shadowColor = col; ctx.shadowBlur = blur;
    for (let i = 0; i < count; i++) {
      let x = Math.floor(r() * SIZE / grid) * grid, y = Math.floor(r() * SIZE / grid) * grid;
      ctx.beginPath(); ctx.moveTo(x, y);
      let dir = Math.floor(r() * 4);
      const segs = 3 + Math.floor(r() * 5);
      for (let s = 0; s < segs; s++) {
        const len = grid * (1 + Math.floor(r() * 4));
        const dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
        x += dx * len; y += dy * len;
        ctx.lineTo(x, y);
        dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
      }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, w * 1.8, 0, Math.PI * 2); ctx.fill();
    }
  };
  draw(c[2] || c[1], 3, 0, 90, 11 + Math.floor(rnd() * 100));
  draw(c[1], 2.5, 10, 40, 22 + Math.floor(rnd() * 100));
  ctx.shadowBlur = 0;
};

P.galaxy = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, r = 50 + rnd() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = hexToRgb(rnd() < 0.5 ? c[1] : c[2]);
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.32)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = c[3] || '#fff';
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    const s = rnd() < 0.95 ? 1.5 : 3;
    ctx.fillRect(rnd() * SIZE, rnd() * SIZE, s, s);
  }
  ctx.globalAlpha = 1;
};

P.synth = (ctx, c) => {
  const g = ctx.createLinearGradient(0, 0, 0, SIZE);
  g.addColorStop(0, c[0]); g.addColorStop(0.55, c[1]); g.addColorStop(0.56, c[0]); g.addColorStop(1, '#05010d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
  // soleil
  const sg = ctx.createLinearGradient(0, SIZE * 0.15, 0, SIZE * 0.55);
  sg.addColorStop(0, c[2]); sg.addColorStop(1, c[1]);
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(SIZE / 2, SIZE * 0.55, SIZE * 0.3, Math.PI, 0); ctx.fill();
  ctx.fillStyle = c[0];
  for (let i = 0; i < 6; i++) ctx.fillRect(0, SIZE * (0.36 + i * 0.033), SIZE, 3 + i * 1.5);
  // grille
  ctx.strokeStyle = c[3]; ctx.lineWidth = 2; ctx.shadowColor = c[3]; ctx.shadowBlur = 8;
  for (let i = 0; i < 12; i++) {
    const y = SIZE * 0.56 + Math.pow(i / 12, 1.8) * SIZE * 0.44;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke();
  }
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath(); ctx.moveTo(SIZE / 2 + i * 12, SIZE * 0.56); ctx.lineTo(SIZE / 2 + i * 70, SIZE); ctx.stroke();
  }
  ctx.shadowBlur = 0;
};

P.geo = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  // grandes formes anguleuses
  const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); };
  poly([[0, SIZE * 0.55], [SIZE * 0.45, SIZE * 0.4], [SIZE, SIZE * 0.62], [SIZE, SIZE], [0, SIZE]], c[2]);
  poly([[0, SIZE * 0.62], [SIZE * 0.4, SIZE * 0.5], [SIZE * 0.7, SIZE * 0.6], [SIZE * 0.55, SIZE * 0.68], [0, SIZE * 0.72]], c[1]);
  poly([[SIZE * 0.6, 0], [SIZE, 0], [SIZE, SIZE * 0.3], [SIZE * 0.78, SIZE * 0.22]], c[1]);
  poly([[SIZE * 0.05, SIZE * 0.1], [SIZE * 0.3, SIZE * 0.05], [SIZE * 0.25, SIZE * 0.25], [SIZE * 0.08, SIZE * 0.28]], c[3] || c[2]);
  poly([[SIZE * 0.72, SIZE * 0.75], [SIZE * 0.95, SIZE * 0.7], [SIZE * 0.9, SIZE * 0.9]], c[1]);
  // lignes techniques
  ctx.strokeStyle = c[2]; ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = rnd() * SIZE * 0.5;
    ctx.beginPath(); ctx.moveTo(rnd() * SIZE * 0.5, y); ctx.lineTo(SIZE * (0.5 + rnd() * 0.5), y); ctx.stroke();
  }
  ctx.fillStyle = c[2];
  ctx.font = 'bold 22px monospace';
  ctx.fillText('XEB-01', SIZE * 0.08, SIZE * 0.38);
  for (let i = 0; i < 8; i++) ctx.fillRect(SIZE * 0.08 + i * 12, SIZE * 0.42, 6, 14);
};

P.splatter = (ctx, c, rnd) => {
  ctx.fillStyle = c[0]; ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 40; i++) {
    const col = c[1 + Math.floor(rnd() * (c.length - 1))];
    const x = rnd() * SIZE, y = rnd() * SIZE, r = 10 + rnd() * 45;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2, d = r * (1 + rnd() * 1.6);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + rnd() * r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    // coulure
    if (rnd() < 0.5) { ctx.fillRect(x - 3, y, 6, r + rnd() * 80); }
  }
  // contours noirs façon graffiti
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 4;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    let x = rnd() * SIZE, y = rnd() * SIZE; ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { ctx.quadraticCurveTo(x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200, x += (rnd() - 0.5) * 160, y += (rnd() - 0.5) * 160); }
    ctx.stroke();
  }
};

P.gorgon = (ctx, c, rnd) => {
  const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 10, SIZE / 2, SIZE / 2, SIZE * 0.7);
  g.addColorStop(0, c[1]); g.addColorStop(1, c[3] || c[0]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    let x = rnd() * SIZE, y = rnd() * SIZE, a = rnd() * Math.PI * 2;
    const w = 6 + rnd() * 10;
    ctx.strokeStyle = c[0]; ctx.lineWidth = w + 4;
    const pts = [];
    for (let k = 0; k < 30; k++) { a += Math.sin(k * 0.5 + i) * 0.35; x += Math.cos(a) * 10; y += Math.sin(a) * 10; pts.push([x, y]); }
    const stroke = (col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
    stroke(c[3] || '#000', w + 5);
    stroke(c[0], w);
    stroke(c[2], 2);
  }
};

function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ── Usure ──────────────────────────────────────────────────────────────────
function applyWear(ctx, float, rnd) {
  if (float <= 0.02) return;
  // éraflures
  const n = Math.floor(float * 420);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, a = rnd() * Math.PI, l = 4 + rnd() * 26 * float + 4;
    ctx.strokeStyle = `rgba(${150 + rnd() * 60},${150 + rnd() * 60},${155 + rnd() * 60},${0.25 + rnd() * 0.5})`;
    ctx.lineWidth = 0.6 + rnd() * 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  // perte de peinture (taches de métal)
  if (float > 0.15) {
    const ns = [makeNoise(rnd, 8), makeNoise(rnd, 16), makeNoise(rnd, 32)];
    const thr = (float - 0.15) * 0.55;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const cx = c.getContext('2d');
    const img = cx.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const v = fbm(ns, x / 128 * 8, y / 128 * 8, 3);
      const k = (y * 128 + x) * 4;
      const a = v < thr + 0.25 ? Math.min(1, (thr + 0.25 - v) * 12) : 0;
      img.data[k] = 120 + v * 60; img.data[k + 1] = 122 + v * 60; img.data[k + 2] = 128 + v * 60; img.data[k + 3] = a * 255;
    }
    cx.putImageData(img, 0, 0);
    ctx.drawImage(c, 0, 0, SIZE, SIZE);
  }
  // salissure générale
  ctx.fillStyle = `rgba(40,32,24,${float * 0.25})`;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

// ── API ────────────────────────────────────────────────────────────────────
const cache = new Map();

export function wearBucket(f) { return Math.round(f * 20) / 20; }

export function skinCanvas(skinId, float = 0, seed = 0) {
  const key = skinId + ':' + seed + ':' + wearBucket(float);
  if (cache.has(key)) return cache.get(key);
  const s = SKINS[skinId];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(hash32(skinId) + seed * 7919);
  (P[s.pattern] || P.solid)(ctx, s.colors, rnd);
  applyWear(ctx, wearBucket(float), mulberry32(seed * 31 + 7));
  const entry = { canvas, tex: null };
  cache.set(key, entry);
  return entry;
}

export function skinTexture(skinId, float, seed) {
  const e = skinCanvas(skinId, float, seed);
  if (!e.tex) {
    const t = new THREE.CanvasTexture(e.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    e.tex = t;
  }
  return e.tex;
}

export function skinFinish(skinId, float) {
  const s = SKINS[skinId];
  const fin = s.fin || { metal: 0.25, rough: 0.5 };
  return { metalness: fin.metal * (1 - float * 0.5), roughness: Math.min(1, fin.rough + float * 0.35) };
}
