import { describe, it, expect } from 'vitest';
import { stable2D, stabilityRegion, resolutionFor, aq, vForMass, trajectory } from '../src/physics/quadrupole.js';
import { meanRetained, kedEvaluate, KED_PAIRS, meanCollisions, TQ_MODES } from '../src/physics/cell.js';
import { fluence, energyFor, depthPerPulse, MATERIALS, washoutParams, washoutTime, pulseResponse, harmonics, photonEnergy, multiphotonOrder, heatDiffusionLength } from '../src/physics/ablation.js';
import { ratio206_238, age206_238, simulateSpot, integrate, bracket } from '../src/physics/signal.js';

describe('Mathieu stability', () => {
  it('apex of the first region near (q, a) = (0.706, 0.237)', () => {
    const r = stabilityRegion(50);
    let best = { a: -1, q: 0 };
    r.q.forEach((q, i) => { if (r.upper[i] > best.a) best = { a: r.upper[i], q }; });
    expect(best.a).toBeGreaterThan(0.225);
    expect(best.a).toBeLessThan(0.245);
    expect(best.q).toBeGreaterThan(0.68);
    expect(best.q).toBeLessThan(0.73);
  });
  it('RF-only stability edge at q ≈ 0.908', () => {
    expect(stable2D(0, 0.9)).toBe(true);
    expect(stable2D(0, 0.92)).toBe(false);
  });
  it('resolution rises steeply as the scan line approaches the apex', () => {
    const lo = resolutionFor(0.30).R, hi = resolutionFor(0.333).R;
    expect(hi).toBeGreaterThan(5 * lo);
  });
  it('set mass sits at the chosen q; a/q = 2U/V', () => {
    const V = vForMass(100, 4.4e-3, 2.5e6, 0.7);
    const p = aq(100, 0.33 * V / 2, V, 4.4e-3, 2.5e6);
    expect(p.q).toBeCloseTo(0.7, 6);
    expect(p.a / p.q).toBeCloseTo(0.33, 6);
  });
  it('ions outside the region hit the rods', () => {
    expect(trajectory(0, 0.95, { cycles: 40 }).hit).toBe(true);
    expect(trajectory(0.2, 0.7, { cycles: 40, x0: 0.02, y0: 0.02 }).hit).toBe(false);
  });
});

describe('Collision cell (KED)', () => {
  it('energy retained per He collision', () => {
    expect(meanRetained(56, 4.0026)).toBeCloseTo((56 * 56 + 4.0026 ** 2) / (60.0026 ** 2), 9);
    expect(meanRetained(56, 4)).toBeGreaterThan(0.85);
  });
  it('collision number scales with pressure and cross-section', () => {
    expect(meanCollisions(2, 50)).toBeCloseTo(2 * meanCollisions(1, 50), 9);
  });
  it('polyatomic is suppressed more than analyte', () => {
    const r = kedEvaluate(KED_PAIRS[0], { P: 1.4, barrier: 1, E0: 8 });
    expect(r.nI).toBeGreaterThan(r.nA);
    expect(r.ta).toBeGreaterThan(r.ti * 3);
  });
  it('mass-shift modes shift by the product mass', () => {
    const as = TQ_MODES.find((m) => m.id === 'As');
    expect(as.q3 - as.q1).toBe(16);
    const ti = TQ_MODES.find((m) => m.id === 'Ti');
    expect(ti.q3 - ti.q1).toBe(3 * 17 + 15);
  });
});

describe('Laser ablation', () => {
  it('fluence: 15 µJ on a 25 µm round spot ≈ 3.06 J/cm²', () => {
    expect(fluence(0.015, 25)).toBeCloseTo(3.056, 2);
    expect(energyFor(fluence(0.02, 40), 40)).toBeCloseTo(0.02, 9);
  });
  it('no ablation below threshold; logarithmic above', () => {
    const z = MATERIALS.zircon;
    expect(depthPerPulse(z.Fth * 0.9, z)).toBe(0);
    expect(depthPerPulse(z.Fth * Math.E, z)).toBeCloseTo(z.alphaInv, 9);
  });
  it('washout: single-pulse response integrates to 1 and τ = V/Q', () => {
    const p = washoutParams({ cupVol: 1, Q: 0.6, tubeLen: 1, tubeId: 3 });
    expect(p.tau1).toBeCloseTo(1 / ((0.6 * 1000) / 60), 9);
    let s = 0;
    for (let t = 0; t < 20; t += 0.0005) s += pulseResponse(t, p) * 0.0005;
    expect(s).toBeCloseTo(1, 2);
    const slow = washoutTime(washoutParams({ cupVol: 5, Q: 0.6 }));
    expect(slow).toBeGreaterThan(washoutTime(p));
  });
  it('harmonics of 1030 nm and photon energies', () => {
    const h = harmonics(1030).map((x) => x.nm);
    expect(h[1]).toBeCloseTo(515, 6); expect(h[2]).toBeCloseTo(343.33, 1); expect(h[3]).toBeCloseTo(257.5, 6); expect(h[4]).toBeCloseTo(206, 6);
    expect(photonEnergy(193)).toBeCloseTo(6.424, 2);
    expect(multiphotonOrder(9, 257.5)).toBe(2);
  });
  it('heat diffusion length: ns ≫ fs', () => {
    expect(heatDiffusionLength(1.8e-6, 5e-9)).toBeGreaterThan(30 * heatDiffusionLength(1.8e-6, 300e-15));
  });
});

describe('U–Pb bracketing', () => {
  it('ratio ↔ age round trip', () => {
    expect(age206_238(ratio206_238(1062.4e6)) / 1e6).toBeCloseTo(1062.4, 6);
  });
  it('bracketing removes a common bias', () => {
    const t = 500e6, rm = 1062.4e6, f = 0.8;
    const r = bracket(ratio206_238(t) * f, ratio206_238(rm) * f, ratio206_238(rm));
    expect(age206_238(r) / 1e6).toBeCloseTo(500, 6);
  });
  it('simulated spot: background-subtracted ratio within a few % of input', () => {
    const p = washoutParams({ cupVol: 1, Q: 0.8 });
    const sim = simulateSpot({ isotopes: [{ name: '206', cps: 5e4, bg: 20 }, { name: '238', cps: 5e5, bg: 5 }], p, seed: 3 });
    const r = integrate(sim, 0, [24, 48], [2, 18]) / integrate(sim, 1, [24, 48], [2, 18]);
    expect(Math.abs(r / 0.1 - 1)).toBeLessThan(0.03);
  });
});
