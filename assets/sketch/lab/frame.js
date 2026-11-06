// Hand-drawn frame for a sketch card: a seeded wobbly rounded rectangle in a 400x300 box, with a small
// overshoot where the pen starts and stops. Same seed, same frame, so cards keep their frame across reloads.
(function () {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function path(key) {
    const r = rng(hash(key)), W = 400, H = 300, m = 6, R = 22, J = 2.2, pts = [];
    const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
    const seg = (ax, ay, bx, by, n) => { for (let i = 0; i < n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]); } };
    const arc = (cx, cy, a0) => { for (let i = 0; i < 3; i++) { const a = a0 + (i / 3) * Math.PI / 2; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); } };
    seg(x0 + R, y0, x1 - R, y0, 6); arc(x1 - R, y0 + R, -Math.PI / 2);
    seg(x1, y0 + R, x1, y1 - R, 4); arc(x1 - R, y1 - R, 0);
    seg(x1 - R, y1, x0 + R, y1, 6); arc(x0 + R, y1 - R, Math.PI / 2);
    seg(x0, y1 - R, x0, y0 + R, 4); arc(x0 + R, y0 + R, Math.PI);
    const p = pts.map(([x, y]) => [x + (r() - .5) * 2 * J, y + (r() - .5) * 2 * J]);
    const over = [p[0][0] + 14 + r() * 10, p[0][1] + (r() - .5) * 4];  // the pen runs a little past where it started
    const all = [...p, [p[0][0] + 2, p[0][1] + 1.5], over];
    let d = `M${all[0][0].toFixed(1)},${all[0][1].toFixed(1)}`;
    for (let i = 1; i < all.length - 1; i++) {
      const mx = (all[i][0] + all[i + 1][0]) / 2, my = (all[i][1] + all[i + 1][1]) / 2;
      d += ` Q${all[i][0].toFixed(1)},${all[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
    }
    return d + ` L${over[0].toFixed(1)},${over[1].toFixed(1)}`;
  }
  // closed version for fills (tint / solid): same wobble, no overshoot tail
  function fill(key) { return path(key).replace(/ L[^ ]+$/, '') + ' Z'; }
  window.SKETCH_FRAME = { path, fill, MODES: ['none', 'outline', 'tint', 'solid'] };
})();
