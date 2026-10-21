// Laser-ablation physics used by the LA scenes. Simple, transparent models with
// illustrative material constants (calibrate to your own crater measurements).
//
// Fluence           F = E / A                          (J cm⁻²)
// Ablation law      d_pulse = α⁻¹ · ln(F / F_th),  F > F_th    (Beer–Lambert / "two-temperature"
//                   style logarithmic dependence widely observed for ns and fs ablation)
// Washout           signal from one pulse = plug delay through the transfer tube, then two
//                   ideal mixing volumes in series (cell cup and tube/smoothing), with time
//                   constants τ = V / Q:  h(t) = (e^{−t/τ1} − e^{−t/τ2}) / (τ1 − τ2)
// Heat              thermal diffusion length L_th = 2·√(D·τ_eff), τ_eff = max(τ_pulse, τ_e-ph)
// Photons           E_ph = hc/λ = 1239.84 eV·nm / λ; multiphoton order = ⌈E_gap / E_ph⌉

export const HC_EV_NM = 1239.84193;

export const MATERIALS = {
  zircon: { name: 'Zircon', Fth: 0.9, alphaInv: 0.055, D: 1.8e-6, gap: 5.6, note: 'Illustrative: ~0.08–0.1 µm/pulse at 2–4 J cm⁻² with 193 nm.' },
  glass: { name: 'NIST SRM 610 glass', Fth: 0.6, alphaInv: 0.09, D: 0.6e-6, gap: 6.0, note: 'Silicate glass; ablates faster than zircon at equal fluence (illustrative).' },
  calcite: { name: 'Calcite', Fth: 0.4, alphaInv: 0.12, D: 1.1e-6, gap: 6.0, note: 'Soft, cleaving matrix; deep craters (illustrative).' },
  apatite: { name: 'Apatite', Fth: 0.7, alphaInv: 0.07, D: 0.7e-6, gap: 5.9, note: 'Illustrative.' },
};

/** Fluence (J/cm²) from pulse energy (mJ) and spot diameter or side (µm). */
export function fluence(EmJ, dUm, shape = 'round') {
  const dcm = dUm * 1e-4;
  const area = shape === 'square' ? dcm * dcm : (Math.PI * dcm * dcm) / 4;
  return (EmJ * 1e-3) / area;
}

/** Pulse energy (mJ) needed for a target fluence. */
export function energyFor(F, dUm, shape = 'round') {
  return F / fluence(1, dUm, shape);
}

/** Depth per pulse (µm). */
export function depthPerPulse(F, mat) {
  return F > mat.Fth ? mat.alphaInv * Math.log(F / mat.Fth) : 0;
}

/** Crater depth after n pulses (µm), with a mild aspect-ratio slowdown (plume shielding/wall losses). */
export function craterDepth(n, F, mat, dUm) {
  const d0 = depthPerPulse(F, mat);
  // effective depth rate decays as the crater deepens: dz/dn = d0 / (1 + z/(k·D))
  const k = 3; // illustrative aspect-ratio scale
  const D = dUm;
  // closed form of dz/dn = d0/(1+z/(kD)) → z + z²/(2kD) = d0 n
  const a = 1 / (2 * k * D);
  return a > 0 ? (-1 + Math.sqrt(1 + 4 * a * d0 * n)) / (2 * a) : d0 * n;
}

/** Single-pulse response h(t) (1/s), plug delay td, mixing constants τ1, τ2 (s). */
export function pulseResponse(t, { td = 0.15, tau1 = 0.12, tau2 = 0.05 } = {}) {
  const s = t - td;
  if (s <= 0) return 0;
  if (Math.abs(tau1 - tau2) < 1e-9) return (s / (tau1 * tau1)) * Math.exp(-s / tau1);
  return (Math.exp(-s / tau1) - Math.exp(-s / tau2)) / (tau1 - tau2);
}

/** Washout parameters from cell/tube geometry. Q in L/min, volumes in cm³, tube in m & mm. */
export function washoutParams({ cupVol = 1.0, Q = 0.8, tubeLen = 1.5, tubeId = 3.0, smoothVol = 0 }) {
  const Qcm3s = (Q * 1000) / 60;
  const tubeVol = Math.PI * Math.pow(tubeId / 20, 2) * tubeLen * 100; // cm³
  const td = tubeVol / Qcm3s; // plug-flow transit
  const tau1 = cupVol / Qcm3s;
  const tau2 = Math.max(0.01, (smoothVol + 0.1 * tubeVol) / Qcm3s); // dispersion in tube / smoothing device
  return { td, tau1, tau2, tubeVol, Qcm3s };
}

/** Time for a single-pulse signal to fall below `frac` of its peak (s, after the peak). */
export function washoutTime(p, frac = 0.01) {
  let peak = 0, tPeak = 0;
  for (let t = 0; t < 30; t += 0.001) { const v = pulseResponse(t, p); if (v > peak) { peak = v; tPeak = t; } }
  for (let t = tPeak; t < 60; t += 0.002) if (pulseResponse(t, p) < frac * peak) return t;
  return Infinity;
}

/** Signal from a pulse train: sum of responses (normalised so one pulse integrates to 1). */
export function pulseTrain(times, { rep = 10, tOn = 0, tOff = 30, p }) {
  const pulses = [];
  for (let t = tOn; t < tOff; t += 1 / rep) pulses.push(t);
  return times.map((t) => {
    let s = 0;
    for (const tp of pulses) { if (tp > t) break; s += pulseResponse(t - tp, p); }
    return s;
  });
}

/** Downhole fractionation of measured ²⁰⁶Pb/²³⁸U vs crater aspect ratio (illustrative linear model). */
export const downholeFactor = (depthUm, dUm, beta = 0.25) => 1 + beta * (depthUm / dUm);

// ---- ns vs fs ----
export const photonEnergy = (nm) => HC_EV_NM / nm;
export const multiphotonOrder = (gapEv, nm) => Math.max(1, Math.ceil(gapEv / photonEnergy(nm) - 1e-9));

/** Thermal diffusion length (nm) during the effective heating time. */
export function heatDiffusionLength(D, tauPulse, tauEph = 2e-12) {
  const t = Math.max(tauPulse, tauEph);
  return 2 * Math.sqrt(D * t) * 1e9;
}

/** Harmonic wavelengths (nm) of a fundamental. */
export const harmonics = (fundNm, orders = [1, 2, 3, 4, 5]) => orders.map((n) => ({ n, nm: fundNm / n, eV: photonEnergy(fundNm / n) }));

/** Log-normal aerosol number distribution (illustrative): ns has a coarse melt-droplet mode. */
export function particleSizeDistribution(kind, dUm) {
  const ln = (d, med, sg) => Math.exp(-Math.pow(Math.log(d / med), 2) / (2 * Math.pow(Math.log(sg), 2))) / (d * Math.log(sg) * Math.sqrt(2 * Math.PI));
  if (kind === 'fs') return 0.92 * ln(dUm, 0.06, 1.7) + 0.08 * ln(dUm, 0.25, 1.8);
  return 0.6 * ln(dUm, 0.12, 2.0) + 0.4 * ln(dUm, 0.6, 2.2);
}

/** Elemental-fractionation index (illustrative): fs pulses fractionate far less than ns. */
export function fractionationIndex(kind, wavelengthNm) {
  const base = kind === 'fs' ? 1.02 : 1.06 + 0.06 * Math.max(0, (wavelengthNm - 193) / 73);
  return base;
}
