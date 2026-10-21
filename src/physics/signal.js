// Time-resolved LA-ICP-MS signal and U–Pb zircon data reduction (simplified).
//
// A quadrupole measures isotopes *sequentially*: in each sweep it dwells on every
// isotope for t_dwell (plus a short settling time). The true, fast-changing aerosol signal
// is therefore sampled at slightly different times for each isotope ("spectral skew"),
// which matters most for short transients. Counts are Poisson.
//
// U–Pb: radiogenic ²⁰⁶Pb/²³⁸U = e^{λ238 t} − 1. Measured ratios carry an instrumental
// mass bias / elemental fractionation factor f and a down-hole drift that grows with
// crater depth. Standard-sample bracketing with a reference zircon measured the same way
// (same spot size, fluence, duration) cancels both to first order.

import { RNG } from './rng.js';
import { pulseResponse } from './ablation.js';

export const LAMBDA_238 = 1.55125e-10; // a⁻¹ (Jaffey et al., 1971)
export const LAMBDA_235 = 9.8485e-10; // a⁻¹
export const U238_U235 = 137.818; // Hiess et al. (2012)

export const REF_ZIRCONS = {
  '91500': { name: '91500', age206_238: 1062.4e6, note: 'Wiedenbeck et al. (1995) ID-TIMS ²⁰⁶Pb/²³⁸U age 1062.4 ± 0.4 Ma' },
  'Plesovice': { name: 'Plešovice', age206_238: 337.13e6, note: 'Sláma et al. (2008) ID-TIMS 337.13 ± 0.37 Ma' },
};

export const ratio206_238 = (t) => Math.exp(LAMBDA_238 * t) - 1;
export const ratio207_235 = (t) => Math.exp(LAMBDA_235 * t) - 1;
export const age206_238 = (r) => Math.log(1 + r) / LAMBDA_238;

/**
 * Simulate a spot analysis.
 * @param o.isotopes [{name, cps (steady ablation cps), bg (gas-blank cps), drift? (per µm/µm aspect)}]
 * @param o.tBlank, o.tAbl, o.tWash  durations (s)
 * @param o.rep repetition rate (Hz); o.p pulse-response params; o.dwell (s) per isotope; o.settle (s)
 * @param o.depthRate µm per second of ablation; o.spot µm
 */
export function simulateSpot(o) {
  const { isotopes, tBlank = 20, tAbl = 30, tWash = 15, rep = 5, p, dwell = 0.01, settle = 0.001, seed = 1, depthRate = 0.4, spot = 25 } = o;
  const rng = new RNG(seed);
  const tEnd = tBlank + tAbl + tWash;
  const sweep = isotopes.length * (dwell + settle);
  // steady-state normaliser: area of one pulse response = 1, so steady level = rep
  const pulses = [];
  for (let t = tBlank; t < tBlank + tAbl; t += 1 / rep) pulses.push(t);
  const env = (t) => {
    let s = 0;
    for (const tp of pulses) { if (tp > t) break; s += pulseResponse(t - tp, p); }
    return s / rep; // 0 → 1 in steady state
  };
  const out = { t: [], series: isotopes.map(() => []), sweep };
  for (let ts = 0; ts < tEnd; ts += sweep) {
    out.t.push(ts);
    isotopes.forEach((iso, i) => {
      const tm = ts + i * (dwell + settle) + dwell / 2;
      const depth = Math.max(0, Math.min(tm, tBlank + tAbl) - tBlank) * depthRate;
      const driftF = 1 + (iso.drift ?? 0) * (depth / spot);
      const rate = iso.bg + iso.cps * env(tm) * driftF;
      const counts = rng.poisson(rate * dwell);
      out.series[i].push(counts / dwell);
    });
  }
  return out;
}

/** Mean of series over a time window, background-subtracted using the blank window. */
export function integrate(sim, i, [a, b], [ba, bb]) {
  let s = 0, n = 0, bs = 0, bn = 0;
  sim.t.forEach((t, k) => {
    if (t >= a && t <= b) { s += sim.series[i][k]; n++; }
    if (t >= ba && t <= bb) { bs += sim.series[i][k]; bn++; }
  });
  return (n ? s / n : 0) - (bn ? bs / bn : 0);
}

/**
 * Standard-sample bracketing for ²⁰⁶Pb/²³⁸U: unknown ratio = measured_unknown × (true_RM / measured_RM).
 */
export function bracket(measUnknown, measRM, trueRM) {
  return measUnknown * (trueRM / measRM);
}
