// Femtosecond laser ablation vs 193 nm ns excimer: harmonics, heat, particles, fractionation.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Sparks } from '../core/beam.js';
import { LaserBeam, wavelengthColor } from '../core/laserbeam.js';
import { Chart, PALETTE } from '../core/chart.js';
import { section, slider, select, segmented, readouts, note, para, table, sources, h, debounce } from '../core/ui.js';
import { buildLA, LA_VENDORS } from '../components/laser.js';
import { registerParts } from '../components/parts.js';
import { craterModel } from './excimer.js';
import { MATERIALS, harmonics, photonEnergy, multiphotonOrder, heatDiffusionLength, particleSizeDistribution, fractionationIndex } from '../physics/ablation.js';
import { RNG } from '../physics/rng.js';
import { srcList } from '../sources.js';

export default {
  id: 'femto',
  title: 'Femtosecond LA vs 193 nm',
  group: 'Laser ablation',
  icon: '✺',
  blurb: '1030 nm Yb + harmonics; fs vs ns heat, particles & fractionation',
  async create(ctx) {
    const root = new THREE.Group();
    const ex = new Exploder();
    const S = { harmonic: 4, taufs: 250e-15, tauns: 5e-9, mat: 'zircon', vendor: 'nwrfemto' };
    const la = buildLA({ type: 'fs', vendor: S.vendor });
    root.add(la.group);
    registerParts(ex, la.parts);
    const beam = new LaserBeam(la.beamPath, { color: wavelengthColor(257), radius: 0.0018, rep: 8 });
    root.add(beam);
    const plume = new Sparks({ color: 0xcfe8ff, max: 600, size: 0.0009 });
    root.add(plume);
    const rng = new RNG(9);
    beam.onPulse = () => {
      for (let i = 0; i < 50; i++) {
        plume.spawn(la.ablation.clone(), new THREE.Vector3(rng.normal(0, 0.008), Math.abs(rng.normal(0.025, 0.008)), rng.normal(0, 0.008)), 0.6, (p, v, a, dt) => { v.x += 0.25 * dt; v.multiplyScalar(0.985); });
      }
    };
    // ns vs fs crater close-ups
    const cNs = craterModel({ spotUm: 30, scale: 400, rim: 4 });
    const cFs = craterModel({ spotUm: 30, scale: 400, rim: 0 });
    cNs.setDepth(18); cFs.setDepth(18);
    cNs.group.position.set(0.5, 0.115, 0.19);
    cFs.group.position.set(0.6, 0.115, 0.19);
    root.add(cNs.group, cFs.group);
    ex.add(cNs.group, [-0.04, 0.05, 0.1], { name: 'ns (193 nm) crater, ×400', info: 'Nanosecond pulses last longer than electron–phonon coupling (~ps): heat diffuses ≈100 nm into the wall during the pulse, producing melt, a resolidified rim and larger droplet particles that can fractionate volatile from refractory elements.', order: 0.9 });
    ex.add(cFs.group, [0.04, 0.05, 0.1], { name: 'fs crater, ×400', info: 'Femtosecond pulses deposit energy before the lattice heats: material is removed by non-thermal / strongly superheated ablation with a heat-affected zone of only nm, little melt, and a fine aerosol — less elemental fractionation and more matrix-independent calibration.', order: 0.9 });
    ctx.label(cNs.group, 'ns crater', { sub: 'melt rim · HAZ', offset: [0, 0.03, 0] });
    ctx.label(cFs.group, 'fs crater', { sub: 'clean walls', offset: [0, 0.03, 0] });
    const f = la.features;
    ctx.label(f.laser.children[0], 'Yb fs laser', { sub: '1030 nm · 100–500 fs', offset: [0, 0.1, 0] });
    ctx.label(f.laser.children[1], 'Harmonic generator', { sub: '515 / 343 / 257 / 206 nm', offset: [0, 0.08, 0] });
    ctx.label(f.cell, 'Two-volume cell', { offset: [0, 0.07, 0] });

    // ---- panel ----
    const intro = section('Femtosecond laser ablation', { icon: '✺' });
    intro.body.append(
      para('Femtosecond LA systems (e.g. ESL NWRFemto) use a Yb solid-state laser at <b>1030 nm</b> with ~100–500 fs pulses, frequency-converted to 515, 343, 257 or 206 nm. Because the pulse is shorter than the electron–lattice coupling time, energy is removed before heat can flow into the surrounding mineral.'),
    );
    const ctl = section('Wavelength & pulse', { icon: '⚙' });
    const H = harmonics(1030);
    const hSeg = segmented({ options: H.map((x) => ({ value: x.n, label: `${Math.floor(x.nm)} nm` })), value: S.harmonic, onChange: (v) => { S.harmonic = v; beam.setColor(wavelengthColor(1030 / v)); refresh(); } });
    const mSel = select({ label: 'Material', value: S.mat, options: Object.entries(MATERIALS).map(([k, m]) => ({ value: k, label: `${m.name} (gap ≈ ${m.gap} eV)` })), onChange: (v) => { S.mat = v; refresh(); } });
    const sFs = slider({ label: 'fs pulse duration', min: 100e-15, max: 1e-12, value: S.taufs, log: true, fmt: (v) => `${(v * 1e15).toFixed(0)} fs`, onInput: (v) => { S.taufs = v; refresh(); } });
    const sNs = slider({ label: 'Excimer pulse duration', min: 1e-9, max: 20e-9, value: S.tauns, log: true, fmt: (v) => `${(v * 1e9).toFixed(1)} ns`, onInput: (v) => { S.tauns = v; refresh(); } });
    const ro = readouts([
      { id: 'ph', label: 'Photon energy' }, { id: 'mp', label: 'Photons per transition (band gap)' },
      { id: 'hfs', label: 'Heat diffusion length, fs' }, { id: 'hns', label: 'Heat diffusion length, 193 nm ns' },
      { id: 'fi', label: 'Fractionation index fs vs ns (illustrative)', wide: true },
    ]);
    ctl.body.append(hSeg.el, mSel.el, sFs.el, sNs.el, ro.el);
    const cc = section('fs vs ns', { icon: '∿' });
    const cHeat = new Chart(cc.body, { height: 160, title: 'Heat-affected depth vs pulse duration', xLabel: 'pulse duration (s)', yLabel: 'L_th (nm)', xLog: true, yLog: true });
    const cPSD = new Chart(cc.body, { height: 160, title: 'Aerosol particle-size distribution (illustrative)', xLabel: 'particle diameter (µm)', yLabel: 'number density', xLog: true, legendPos: 'tr' });
    cc.body.append(
      table(['', '193 nm ArF (ns)', 'fs (Yb + harmonics)'], [
        ['Pulse', '≈ 4–5 ns', '≈ 100–500 fs'],
        ['Rep. rate', '1–300 Hz', 'up to kHz (NWRFemto 1–1000 Hz)'],
        ['Coupling', 'one-photon (6.4 eV) for most minerals', 'multiphoton / ionisation-driven, less wavelength-sensitive'],
        ['Heat-affected zone', '~100 nm, melt rim', '~nm, little melt'],
        ['Aerosol', 'broader, droplets', 'finer, more uniform'],
        ['Fractionation / matrix effects', 'moderate; matrix-matched standards preferred', 'reduced; non-matrix-matched calibration more feasible'],
      ]),
      note('L_th = 2√(D·t) with D = thermal diffusivity and t = max(pulse, ~2 ps electron–phonon time). Particle-size curves and the fractionation index are illustrative shapes, not measurements.', 'warn'),
      sources(srcList('nwrfemto', 'nwrfemtoDb', 'pharos', 'portsmouth')),
    );
    const panel = [intro.el, ctl.el, cc.el];

    const refresh = debounce(() => {
      const nm = 1030 / S.harmonic;
      const mat = MATERIALS[S.mat];
      ro.ph.set(`${photonEnergy(nm).toFixed(2)} eV (193 nm: ${photonEnergy(193).toFixed(2)} eV)`);
      ro.mp.set(`${multiphotonOrder(mat.gap, nm)} at ${nm.toFixed(1)} nm · ${multiphotonOrder(mat.gap, 193)} at 193 nm`);
      ro.hfs.set(`${heatDiffusionLength(mat.D, S.taufs).toFixed(1)} nm`, 'good');
      ro.hns.set(`${heatDiffusionLength(mat.D, S.tauns).toFixed(0)} nm`, 'warn');
      ro.fi.set(`fs ${fractionationIndex('fs', nm).toFixed(2)} · 193 nm ns ${fractionationIndex('ns', 193).toFixed(2)} (1.00 = no fractionation)`);
      const ts = [], l = [];
      for (let e = -14; e <= -7.5; e += 0.1) { ts.push(10 ** e); l.push(heatDiffusionLength(mat.D, 10 ** e)); }
      cHeat.setSeries([{ name: '', color: PALETTE[0], x: ts, y: l, width: 2 }]);
      cHeat.setMarks([{ x: S.taufs, color: PALETTE[2], label: 'fs' }, { x: S.tauns, color: PALETTE[3], label: 'ns' }]);
      const ds = [], a = [], b = [];
      for (let e = -2; e <= 1; e += 0.04) { ds.push(10 ** e); a.push(particleSizeDistribution('fs', 10 ** e)); b.push(particleSizeDistribution('ns', 10 ** e)); }
      const ma = Math.max(...a), mb = Math.max(...b);
      cPSD.setSeries([{ name: 'fs', color: PALETTE[2], x: ds, y: a.map((v) => v / ma), width: 2, fill: true }, { name: 'ns 193 nm', color: PALETTE[3], x: ds, y: b.map((v) => v / mb), width: 2, fill: true }]);
    }, 40);
    refresh();

    return {
      root, exploder: ex, panel, scale: 1.2, defaults: { xray: true },
      camera: { position: [0.8, 0.85, 1.0], target: [0.12, 0.2, 0.05] },
      update(dt) { plume.update(dt); },
      dispose() { cHeat.dispose(); cPSD.dispose(); },
    };
  },
};
