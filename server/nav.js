// Grille de navigation au sol pour les bots + A*.
import { collides } from '../shared/physics.js';
import { PLAYER } from '../shared/constants.js';

export class NavGrid {
  constructor(map) {
    this.map = map;
    const [sx, sz] = map.size;
    const maxDim = Math.max(sx, sz);
    this.cell = maxDim > 600 ? 5 : (maxDim > 300 ? 2 : 1); // grandes maps : cellules plus larges pour garder la nav rapide
    this.ox = -sx / 2;
    this.oz = -sz / 2;
    this.w = Math.floor(sx / this.cell);
    this.h = Math.floor(sz / this.cell);
    const n = this.w * this.h;
    this.walk = new Uint8Array(n);
    this.y = new Float32Array(n);
    // marge supplémentaire pour que les bots ne rasent pas les murs
    const boxes = map.boxes;
    const saved = PLAYER.halfWidth;
    PLAYER.halfWidth = saved + 0.18;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.ox + (i + 0.5) * this.cell, z = this.oz + (j + 0.5) * this.cell;
        const k = j * this.w + i;
        // On cherche la surface la plus haute (< 3m) praticable à cet endroit
        let gy = 0;
        for (const b of boxes) {
          if (b.y1 <= 3 && b.y1 > gy && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) gy = b.y1;
        }
        // on ignore ce qui fait moins de 0.6m au-dessus du sol (marches)
        if (!collides(boxes, x, gy + 0.6, z, PLAYER.height - 0.6)) { this.walk[k] = 1; this.y[k] = gy; }
      }
    }
    PLAYER.halfWidth = saved;
    // Composantes connexes (pour choisir des destinations atteignables)
    this.comp = new Int32Array(n).fill(-1);
    let c = 0;
    const stack = [];
    for (let k = 0; k < n; k++) {
      if (!this.walk[k] || this.comp[k] >= 0) continue;
      stack.push(k); this.comp[k] = c;
      while (stack.length) {
        const cur = stack.pop();
        for (const nb of this.neighbors(cur)) {
          if (this.comp[nb] < 0) { this.comp[nb] = c; stack.push(nb); }
        }
      }
      c++;
    }
    this.compCount = c;
    this.walkList = [];
    for (let k = 0; k < n; k++) if (this.walk[k]) this.walkList.push(k);
  }

  idx(x, z) {
    const i = Math.floor((x - this.ox) / this.cell), j = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  center(k) {
    const i = k % this.w, j = (k / this.w) | 0;
    return [this.ox + (i + 0.5) * this.cell, this.oz + (j + 0.5) * this.cell];
  }

  // Voisins praticables (8 directions, en respectant les marches de 0.52m)
  neighbors(k) {
    const out = [];
    const i = k % this.w, j = (k / this.w) | 0;
    const y0 = this.y[k];
    const ok = (ii, jj) => {
      if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) return -1;
      const kk = jj * this.w + ii;
      if (!this.walk[kk]) return -1;
      if (Math.abs(this.y[kk] - y0) > 0.65) return -1;
      return kk;
    };
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const kk = ok(i + di, j + dj);
        if (kk < 0) continue;
        if (di && dj && (ok(i + di, j) < 0 || ok(i, j + dj) < 0)) continue;
        out.push(kk);
      }
    }
    return out;
  }

  nearest(x, z) {
    let k = this.idx(x, z);
    if (k >= 0 && this.walk[k]) return k;
    let best = -1, bd = Infinity;
    const ci = Math.floor((x - this.ox) / this.cell), cj = Math.floor((z - this.oz) / this.cell);
    for (let r = 1; r <= 4 && best < 0; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const ii = ci + di, jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) continue;
        const kk = jj * this.w + ii;
        if (!this.walk[kk]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = kk; }
      }
    }
    return best;
  }

  randomNode(comp = -1, rnd = Math.random) {
    for (let tries = 0; tries < 50; tries++) {
      const k = this.walkList[Math.floor(rnd() * this.walkList.length)];
      if (comp < 0 || this.comp[k] === comp) return k;
    }
    return this.walkList[0];
  }

  // A* ; renvoie une liste de points [x, z] (lissée) ou null
  findPath(sx, sz, tx, tz) {
    const s = this.nearest(sx, sz), t = this.nearest(tx, tz);
    if (s < 0 || t < 0 || this.comp[s] !== this.comp[t]) return null;
    if (s === t) return [[tx, tz]];
    const n = this.w * this.h;
    if (!this._g || this._g.length !== n) {
      this._g = new Float32Array(n);
      this._from = new Int32Array(n);
      this._stamp = new Uint32Array(n);
      this._closed = new Uint32Array(n);
      this._run = 0;
    }
    const run = ++this._run;
    const g = this._g, from = this._from, stamp = this._stamp, closed = this._closed;
    const [txc, tzc] = this.center(t);
    const hfn = (k) => { const [x, z] = this.center(k); const dx = Math.abs(x - txc), dz = Math.abs(z - tzc); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const heap = new MinHeap();
    stamp[s] = run; g[s] = 0; from[s] = -1;
    heap.push(s, hfn(s));
    let found = false, iter = 0;
    while (heap.size && iter++ < 20000) {
      const cur = heap.pop();
      if (cur === t) { found = true; break; }
      if (closed[cur] === run) continue;
      closed[cur] = run;
      const ci = cur % this.w, cj = (cur / this.w) | 0;
      for (const nb of this.neighbors(cur)) {
        if (closed[nb] === run) continue;
        const ni = nb % this.w, nj = (nb / this.w) | 0;
        const cost = (ni !== ci && nj !== cj) ? 1.414 : 1;
        const ng = g[cur] + cost;
        if (stamp[nb] !== run || ng < g[nb]) {
          stamp[nb] = run; g[nb] = ng; from[nb] = cur;
          heap.push(nb, ng + hfn(nb));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = t; k >= 0; k = from[k]) cells.push(k);
    cells.reverse();
    // Lissage (string pulling)
    const pts = [];
    let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.walkLine(cells[a], cells[b])) b--;
      pts.push(this.center(cells[b]));
      a = b;
    }
    pts[pts.length - 1] = [tx, tz];
    return pts;
  }

  walkLine(ka, kb) {
    const [ax, az] = this.center(ka), [bx, bz] = this.center(kb);
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 0.4);
    let py = this.y[ka];
    for (let s = 1; s <= steps; s++) {
      const x = ax + (bx - ax) * s / steps, z = az + (bz - az) * s / steps;
      const k = this.idx(x, z);
      if (k < 0 || !this.walk[k]) return false;
      if (Math.abs(this.y[k] - py) > 0.65) return false;
      py = this.y[k];
    }
    return true;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[par], k[i]] = [k[i], k[par]]; [p[par], p[i]] = [p[i], p[par]];
      i = par;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
