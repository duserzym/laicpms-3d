// Collision/reaction cell physics: kinetic energy discrimination (KED) with He, and
// mass-shift / on-mass reaction chemistry used in triple-quadrupole (TQ) ICP-MS.
//
// KED. An ion of mass m that collides elastically with a stationary gas atom of mass M_g
// keeps, in the lab frame, the fraction
//     E'/E = (m² + M_g² + 2 m M_g cos θ*) / (m + M_g)²
// where θ* is the centre-of-mass scattering angle (isotropic for hard spheres ⇒ cos θ*
// uniform on [−1, 1]). Polyatomic ions (e.g. ⁴⁰Ar¹⁶O⁺) have larger collision cross
// sections than atomic ions of the same nominal mass (⁵⁶Fe⁺), so on average they suffer
// more collisions, lose more energy, and are stopped by a small retarding potential
// (cell bias more positive than the analyser bias). Number of collisions ~ Poisson with
// mean n·σ·L, n = P/(k_B T).
//
// Cross sections below are illustrative relative values (hard-sphere style estimates),
// chosen so polyatomics are ~1.4–1.8× larger than isobaric atomic ions.

import { K_B } from './constants.js';
import { RNG } from './rng.js';

export const KED_PAIRS = [
  { id: 'Fe', analyte: '⁵⁶Fe⁺', mA: 55.935, sA: 40, interf: '⁴⁰Ar¹⁶O⁺', mI: 55.957, sI: 62 },
  { id: 'As', analyte: '⁷⁵As⁺', mA: 74.922, sA: 44, interf: '⁴⁰Ar³⁵Cl⁺', mI: 74.931, sI: 70 },
  { id: 'Cr', analyte: '⁵²Cr⁺', mA: 51.941, sA: 40, interf: '⁴⁰Ar¹²C⁺', mI: 51.962, sI: 58 },
  { id: 'Se', analyte: '⁸⁰Se⁺', mA: 79.917, sA: 45, interf: '⁴⁰Ar₂⁺', mI: 79.925, sI: 76 },
  { id: 'K', analyte: '³⁹K⁺', mA: 38.964, sA: 36, interf: '³⁸ArH⁺', mI: 38.971, sI: 48 },
];

/** Mean fraction of energy retained per isotropic elastic collision. */
export const meanRetained = (m, Mg) => (m * m + Mg * Mg) / ((m + Mg) * (m + Mg));

/** Expected number of collisions over path L (m) at pressure P (Pa), cross-section σ (Å²). */
export function meanCollisions(P, sigmaA2, L = 0.12, T = 300) {
  const n = P / (K_B * T);
  return n * sigmaA2 * 1e-20 * L;
}

/**
 * Monte-Carlo exit-energy distribution.
 * @returns {Float64Array} exit energies (eV)
 */
export function exitEnergies({ m, sigma, P, L = 0.12, E0 = 6, E0sd = 0.8, Mg = 4.0026, n = 6000, seed = 1 }) {
  const rng = new RNG(seed);
  const lam = meanCollisions(P, sigma, L);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let E = Math.max(0.05, rng.normal(E0, E0sd));
    const k = rng.poisson(lam);
    for (let c = 0; c < k; c++) {
      const cos = 2 * rng.u() - 1;
      E *= (m * m + Mg * Mg + 2 * m * Mg * cos) / ((m + Mg) * (m + Mg));
    }
    out[i] = E;
  }
  return out;
}

export function fractionAbove(E, barrier) {
  let c = 0;
  for (const e of E) if (e > barrier) c++;
  return c / E.length;
}

export function histogram(E, { max = 10, bins = 50 } = {}) {
  const h = new Array(bins).fill(0);
  for (const e of E) { const b = Math.min(bins - 1, Math.floor((e / max) * bins)); if (b >= 0) h[b]++; }
  const x = h.map((_, i) => ((i + 0.5) * max) / bins);
  return { x, y: h.map((v) => v / E.length) };
}

/** Full KED evaluation for a pair. */
export function kedEvaluate(pair, { P = 0.5, L = 0.12, E0 = 6, barrier = 3, seed = 3 } = {}) {
  const ea = exitEnergies({ m: pair.mA, sigma: pair.sA, P, L, E0, seed });
  const ei = exitEnergies({ m: pair.mI, sigma: pair.sI, P, L, E0, seed: seed + 1 });
  const ta = fractionAbove(ea, barrier), ti = fractionAbove(ei, barrier);
  return {
    ea, ei, ta, ti,
    nA: meanCollisions(P, pair.sA, L), nI: meanCollisions(P, pair.sI, L),
    reduction: ti > 0 ? ta / ti : Infinity,
  };
}

/**
 * Triple-quad reaction modes. `v` = verified in the cited source; otherwise literature
 * knowledge flagged for checking.
 */
export const TQ_MODES = [
  {
    id: 'As', label: 'As → AsO⁺ (O₂)', gas: 'O₂', q1: 75, q3: 91, analyte: '⁷⁵As⁺', product: '⁷⁵As¹⁶O⁺',
    removes: '⁴⁰Ar³⁵Cl⁺, ¹⁵⁰Nd²⁺/¹⁵⁰Sm²⁺ (doubly charged at m/z 75) — rejected by Q1 or unreactive',
    v: true, src: 'thermoTQ',
  },
  {
    id: 'Se', label: 'Se → SeO⁺ (O₂)', gas: 'O₂', q1: 80, q3: 96, analyte: '⁸⁰Se⁺', product: '⁸⁰Se¹⁶O⁺',
    removes: '⁴⁰Ar₂⁺ (does not form an m/z 96 product); Q1 blocks ⁹⁶Zr/⁹⁶Mo/⁹⁶Ru from entering the cell',
    v: true, src: 'thermoTQ',
  },
  {
    id: 'Ti', label: 'Ti → Ti(NH₃)₃NH⁺ (NH₃)', gas: 'NH₃', q1: 48, q3: 114, analyte: '⁴⁸Ti⁺', product: '⁴⁸Ti(NH₃)₃NH⁺',
    removes: '⁴⁸Ca⁺ (does not react with NH₃), ³²S¹⁶O⁺, ³¹P¹⁶OH⁺',
    v: true, src: 'thermoTQ',
  },
  {
    id: 'Sr', label: 'Sr → SrO⁺ (N₂O) for Rb–Sr', gas: 'N₂O', q1: 87, q3: 103, analyte: '⁸⁷Sr⁺', product: '⁸⁷Sr¹⁶O⁺',
    removes: '⁸⁷Rb⁺ (inert towards N₂O) — enables in-situ Rb–Sr dating',
    v: true, src: 'hogmalm2017', note: 'N₂O is not one of the four standard iCAP TQ cell gases (He, H₂, O₂, NH₃); it needs an additional gas line (assumed possible). SF₆ → SrF⁺ (m/z 106) is the alternative used by Zack & Hogmalm (2016).',
  },
  {
    id: 'P', label: 'P → PO⁺ (O₂)', gas: 'O₂', q1: 31, q3: 47, analyte: '³¹P⁺', product: '³¹P¹⁶O⁺',
    removes: '¹⁵N¹⁶O⁺, ¹⁴N¹⁶O¹H⁺, ¹²C¹⁸O¹H⁺', v: false, src: null,
  },
  {
    id: 'S', label: 'S → SO⁺ (O₂)', gas: 'O₂', q1: 32, q3: 48, analyte: '³²S⁺', product: '³²S¹⁶O⁺',
    removes: '¹⁶O₂⁺, ¹⁴N¹⁸O⁺', v: false, src: null,
  },
];

/** Expected signal-to-interference improvement of a mass-shift mode (simple kinetics). */
export function massShiftSelectivity({ kA = 1e-9, kI = 1e-13, nGas = 2e20, tRes = 2e-5 }) {
  // pseudo-first-order: fraction reacted = 1 − exp(−k n t)  (k in cm³/s → convert to m³/s)
  const fa = 1 - Math.exp(-kA * 1e-6 * nGas * tRes);
  const fi = 1 - Math.exp(-kI * 1e-6 * nGas * tRes);
  return { fa, fi, gain: fi > 0 ? fa / fi : Infinity };
}
