// Quadrupole mass filter physics (Mathieu equation).
//
// In an ideal quadrupole field Φ = (U + V cos Ωt)(x² − y²)/r0², ion motion obeys
//     d²u/dξ² + (a_u − 2 q_u cos 2ξ) u = 0,   ξ = Ωt/2
//     a_x = −a_y = 8 z e U / (m r0² Ω²),   q_x = −q_y = 4 z e V / (m r0² Ω²)
// (V = zero-to-peak RF amplitude, U = DC). Motion is bounded when the Floquet exponent is
// real, i.e. |trace(monodromy)| < 2 over one RF period. The first stability region (both
// x and y stable) is a small triangle with its apex at (q, a) ≈ (0.706, 0.237).
//
// A scan line a/q = 2U/V through the origin transmits a narrow q-window; masses are
// transmitted in inverse proportion to q, so the window width sets the resolution.

import { AMU, E_CHARGE } from './constants.js';

/** Floquet test: integrate both fundamental solutions over one period (ξ: 0→π) with RK4. */
export function monodromyTrace(a, q, steps = 400) {
  const h = Math.PI / steps;
  const f = (xi, u, v) => [v, -(a - 2 * q * Math.cos(2 * xi)) * u];
  const run = (u0, v0) => {
    let u = u0, v = v0, xi = 0;
    for (let i = 0; i < steps; i++) {
      const k1 = f(xi, u, v);
      const k2 = f(xi + h / 2, u + (h / 2) * k1[0], v + (h / 2) * k1[1]);
      const k3 = f(xi + h / 2, u + (h / 2) * k2[0], v + (h / 2) * k2[1]);
      const k4 = f(xi + h, u + h * k3[0], v + h * k3[1]);
      u += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      v += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      xi += h;
    }
    return [u, v];
  };
  const s1 = run(1, 0), s2 = run(0, 1);
  return s1[0] + s2[1];
}

/** Stable in one coordinate? */
export const stable1D = (a, q) => Math.abs(monodromyTrace(a, q)) < 2;
/** Stable in both x (a, q) and y (−a, −q)? */
export const stable2D = (a, q) => stable1D(a, q) && stable1D(-a, -q);

/**
 * Sample the boundaries of the first stability region for plotting:
 * lower edge a_low(q) (from y-stability: −a ≤ β_y=0 curve) and upper edge a_up(q).
 */
export function stabilityRegion(n = 80) {
  const qs = [], lower = [], upper = [];
  for (let i = 0; i <= n; i++) {
    const q = (i / n) * 0.908;
    // scan a from 0 upwards and downwards to find the 2-D stable interval containing small a
    const aMax = 0.3;
    let up = null, low = null;
    const N = 240;
    let prev = stable2D(0, q);
    if (!prev) { qs.push(q); lower.push(NaN); upper.push(NaN); continue; }
    for (let k = 1; k <= N; k++) {
      const a = (aMax * k) / N;
      if (!stable2D(a, q)) { up = refine(a - aMax / N, a, q); break; }
    }
    for (let k = 1; k <= N; k++) {
      const a = -(aMax * k) / N;
      if (!stable2D(a, q)) { low = refine(a + aMax / N, a, q); break; }
    }
    qs.push(q); upper.push(up ?? NaN); lower.push(low ?? NaN);
  }
  return { q: qs, upper, lower };
}
function refine(aStable, aUnstable, q) {
  let s = aStable, u = aUnstable;
  for (let i = 0; i < 30; i++) { const m = (s + u) / 2; if (stable2D(m, q)) s = m; else u = m; }
  return (s + u) / 2;
}

/**
 * Transmission window along the scan line a = λ q.
 * Returns the stable q-interval [q1, q2] (null if the line misses the region).
 */
export function scanWindow(lambda, { qMax = 0.92, n = 1200 } = {}) {
  let q1 = null, q2 = null;
  for (let i = 1; i <= n; i++) {
    const q = (qMax * i) / n;
    const s = stable2D(lambda * q, q);
    if (s && q1 === null) q1 = q;
    if (!s && q1 !== null && q2 === null) { q2 = q; break; }
  }
  if (q1 === null) return null;
  if (q2 === null) q2 = qMax;
  // refine edges
  const edge = (a, b, wantStableAtA) => {
    for (let k = 0; k < 30; k++) { const m = (a + b) / 2; const s = stable2D(lambda * m, m); if (s === wantStableAtA) a = m; else b = m; }
    return (a + b) / 2;
  };
  q1 = edge(q1, q1 - qMax / n, true);
  q2 = edge(q2 - qMax / n, q2, true);
  return { q1, q2 };
}

/**
 * Resolution m/Δm for scan line slope λ = 2U/V, taking the set mass at the window centre.
 * At fixed V a mass m sits at q ∝ 1/m, so Δm/m ≈ Δq/q.
 */
export function resolutionFor(lambda) {
  const w = scanWindow(lambda);
  if (!w) return { R: Infinity, window: null };
  const qc = (w.q1 + w.q2) / 2;
  return { R: qc / (w.q2 - w.q1), window: w, qc };
}

/** a, q for an ion (mass mU in u) given U, V (V, zero-to-peak), r0 (m), f (Hz). */
export function aq(mU, U, V, r0, f, z = 1) {
  const m = mU * AMU, w = 2 * Math.PI * f;
  return {
    a: (8 * z * E_CHARGE * U) / (m * r0 * r0 * w * w),
    q: (4 * z * E_CHARGE * V) / (m * r0 * r0 * w * w),
  };
}

/** RF amplitude V needed to put mass m at q (default the apex 0.706). */
export function vForMass(mU, r0, f, q = 0.706, z = 1) {
  const m = mU * AMU, w = 2 * Math.PI * f;
  return (q * m * r0 * r0 * w * w) / (4 * z * E_CHARGE);
}

/**
 * Integrate an ion trajectory through the quadrupole in units of ξ = Ωt/2.
 * Returns transverse positions (in units of r0) and whether it hit a rod (|u| > 1).
 * axial: number of RF cycles the ion spends in the filter.
 */
export function trajectory(a, q, { x0 = 0.05, y0 = 0.04, vx0 = 0, vy0 = 0, phase = 0, cycles = 40, stepsPerCycle = 60 } = {}) {
  const n = cycles * stepsPerCycle;
  const h = Math.PI / stepsPerCycle;
  let x = x0, y = y0, vx = vx0, vy = vy0, xi = phase;
  const pts = [[x, y, 0]];
  let hit = false;
  const acc = (xi, x, y) => {
    const c = a - 2 * q * Math.cos(2 * xi);
    return [-c * x, c * y];
  };
  for (let i = 0; i < n; i++) {
    const a1 = acc(xi, x, y);
    const a2 = acc(xi + h / 2, x + (h / 2) * vx, y + (h / 2) * vy);
    const a3 = acc(xi + h / 2, x + (h / 2) * (vx + (h / 2) * a1[0]), y + (h / 2) * (vy + (h / 2) * a1[1]));
    const a4 = acc(xi + h, x + h * (vx + (h / 2) * a2[0]), y + h * (vy + (h / 2) * a2[1]));
    // classic RK4 on (pos, vel)
    const k1x = vx, k1y = vy;
    const k2x = vx + (h / 2) * a1[0], k2y = vy + (h / 2) * a1[1];
    const k3x = vx + (h / 2) * a2[0], k3y = vy + (h / 2) * a2[1];
    const k4x = vx + h * a3[0], k4y = vy + h * a3[1];
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    vx += (h / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]);
    vy += (h / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
    xi += h;
    pts.push([x, y, (i + 1) / n]);
    if (Math.hypot(x, y) > 1) { hit = true; break; }
  }
  return { pts, hit };
}
