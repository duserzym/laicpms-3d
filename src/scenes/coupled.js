// Coupled LA–ICP-MS: aerosol transport to the plasma, time-resolved signals with sequential
// quadrupole sampling, and U–Pb zircon standard–sample bracketing.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Sparks, IonBeam } from '../core/beam.js';
import { LaserBeam } from '../core/laserbeam.js';
import { Chart, PALETTE } from '../core/chart.js';
import { section, slider, select, readouts, note, para, buttons, h, debounce } from '../core/ui.js';
import { wire } from '../core/geom.js';
import { buildLA } from '../components/laser.js';
import { buildICPMS } from '../components/icpms.js';
import { registerParts } from '../components/parts.js';
import { washoutParams, fluence, depthPerPulse, MATERIALS } from '../physics/ablation.js';
import { simulateSpot, integrate, bracket, ratio206_238, age206_238, REF_ZIRCONS, U238_U235 } from '../physics/signal.js';
import { RNG } from '../physics/rng.js';

export default {
  id: 'coupled',
  title: 'Coupled LA–ICP-MS & U–Pb',
  group: 'Workflow',
  icon: '⇄',
  blurb: 'Aerosol → plasma; time-resolved signal, dwell/sweep, standard–sample bracketing',
  async create(ctx) {
    const root = new THREE.Group();
    const ex = new Exploder();
    const la = buildLA({ type: 'excimer', vendor: 'analyte' });
    la.group.position.set(-1.35, 0, 0.55);
    root.add(la.group);
    registerParts(ex, la.parts, { extra: [0, 0, 0] });
    const ms = buildICPMS({ variant: 'RQ', cabinet: true });
    root.add(ms.group);
    registerParts(ex, ms.parts);
    ex.add(la.group, [-0.4, 0, 0.3], { name: '193 nm LA system', info: 'Laser-ablation workstation (see the 193 nm scene).', order: 0 });
    // transfer line from LA outlet to the torch injector
    const a = la.transferOut.clone().add(la.group.position);
    const torchIn = new THREE.Vector3(-0.47, ms.H, 0);
    const line = wire([a, new THREE.Vector3(a.x + 0.25, 0.12, a.z), new THREE.Vector3(-0.75, 0.25, 0.3), new THREE.Vector3(-0.62, ms.H, 0.05), torchIn], 2.2 * 1e-3, new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, roughness: 0.3, transmission: 0.45, thickness: 0.003 }));
    line.name = 'transfer line';
    line.userData.part = { name: 'Aerosol transfer line', info: 'Typically 1–3 m of 3–4 mm i.d. tubing. Transit adds a plug delay (tube volume / flow) and some mixing; long lines smooth the signal but slow the washout.' };
    root.add(line);
    const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(a.x + 0.25, 0.12, a.z), new THREE.Vector3(-0.75, 0.25, 0.3), new THREE.Vector3(-0.62, ms.H, 0.05), torchIn]);
    const aerosol = new Sparks({ color: 0xffd9a0, max: 400, size: 0.004 });
    root.add(aerosol);
    const beam = new LaserBeam(la.beamPath.map((p) => p.clone().add(la.group.position)), { color: 0x9b5cff, rep: 5 });
    root.add(beam);
    const ionBeam = new IonBeam(ms.path, { color: 0x5ab0ff, radius: 0.0012, particles: 24, speed: 0.15, size: 0.004 });
    root.add(ionBeam);
    beam.onPulse = () => {
      for (let i = 0; i < 6; i++) {
        const st = { u: 0, speed: 0.12 + Math.random() * 0.05 };
        aerosol.spawn(curve.getPoint(0), new THREE.Vector3(), 12, (p) => {
          st.u = Math.min(1, st.u + st.speed * 0.016);
          p.copy(curve.getPoint(st.u)).add(new THREE.Vector3((Math.random() - 0.5) * 0.003, (Math.random() - 0.5) * 0.003, 0));
        });
      }
    };
    ctx.label(la.group.children.find((c) => c.name === 'enclosure') || la.group, '193 nm LA', { offset: [0.05, 0.56, 0] });
    ctx.label(ms.features.torch, 'ICP', { sub: 'aerosol → ions', offset: [-0.03, 0.05, 0] });
    ctx.label(line, 'He + Ar transfer line', { offset: [-0.8, 0.32, 0.3] });

    // ---- panel ----
    const intro = section('Coupled LA–ICP-MS', { icon: '⇄' });
    intro.body.append(para('Each laser pulse produces a short aerosol packet; after the transfer delay it is atomised and ionised in the plasma. A quadrupole <b>peak-hops</b>: it dwells on each isotope in turn, so the isotopes of a fast transient are sampled at slightly different times. Data are reduced from the time-resolved signal: gas blank → ablation interval → washout.'));
    const ctl = section('U–Pb spot (zircon)', { icon: '⚙' });
    const S = { age: 500e6, U: 300, rm: '91500', dwell: 0.01, rep: 5, spot: 25, Fl: 3.0, Q: 0.8, seed: 1 };
    const sAge = slider({ label: 'Unknown zircon ²⁰⁶Pb/²³⁸U age', min: 10e6, max: 3000e6, value: S.age, fmt: (v) => `${(v / 1e6).toFixed(0)} Ma`, onInput: (v) => { S.age = v; run(); } });
    const sU = slider({ label: 'U concentration', min: 20, max: 2000, value: S.U, log: true, fmt: (v) => `${v.toFixed(0)} µg g⁻¹`, onInput: (v) => { S.U = v; run(); } });
    const rmSel = select({ label: 'Primary reference zircon', value: S.rm, options: Object.entries(REF_ZIRCONS).map(([k, z]) => ({ value: k, label: `${z.name} (${(z.age206_238 / 1e6).toFixed(2)} Ma)` })), onChange: (v) => { S.rm = v; run(); } });
    const sDw = slider({ label: 'Dwell per isotope', min: 0.002, max: 0.05, step: 0.001, value: S.dwell, fmt: (v) => `${(v * 1000).toFixed(0)} ms`, onInput: (v) => { S.dwell = v; run(); } });
    const sRep = slider({ label: 'Repetition rate', min: 1, max: 20, step: 1, value: S.rep, fmt: (v) => `${v} Hz`, onInput: (v) => { S.rep = v; beam.rep = v; run(); } });
    const btn = buttons([{ label: 'New random run', onClick: () => { S.seed++; run(); } }]);
    const ro = readouts([
      { id: 'sweep', label: 'Sweep time' }, { id: 'depth', label: 'Crater depth (30 s)' },
      { id: 'rmMeas', label: 'RM measured ²⁰⁶Pb/²³⁸U' }, { id: 'unkMeas', label: 'Unknown measured' },
      { id: 'res', label: 'Bracketed age (true)', wide: true },
    ]);
    ctl.body.append(sAge.el, sU.el, rmSel.el, sDw.el, sRep.el, btn.el, ro.el);
    const cc = section('Time-resolved signal', { icon: '∿' });
    const cSig = new Chart(cc.body, { height: 200, title: 'Unknown zircon spot', xLabel: 'time (s)', yLabel: 'cps', yLog: true, yMin: 1, legendPos: 'tr' });
    const cRat = new Chart(cc.body, { height: 160, title: '²⁰⁶Pb/²³⁸U vs time (down-hole drift)', xLabel: 'time (s)', yLabel: 'ratio / mean', legendPos: 'tr' });
    cc.body.append(note('Simplified: no common-Pb correction, no ²⁰⁷Pb/²³⁵U or concordia, linear down-hole drift identical in RM and unknown (so bracketing cancels it), and an assumed sensitivity of ~3000 cps per µg g⁻¹ U at 25 µm. Real reductions (e.g. Iolite, LADR) fit the down-hole pattern of the RM and apply it to unknowns.', 'warn'));
    const panel = [intro.el, ctl.el, cc.el];

    const run = debounce(() => {
      const p = washoutParams({ cupVol: 1.0, Q: S.Q, tubeLen: 1.5, tubeId: 3 });
      const depthRate = depthPerPulse(S.Fl, MATERIALS.zircon) * S.rep; // µm/s
      const fInst = 0.82; // instrumental Pb/U bias (illustrative)
      const mk = (age, U, seed) => {
        const r68 = ratio206_238(age);
        const u238 = U * 3000;
        const pb206 = u238 * r68 * fInst;
        const pb207 = pb206 * ((Math.exp(9.8485e-10 * age) - 1) / U238_U235) / r68 * 1.0;
        return simulateSpot({
          isotopes: [
            { name: '²⁰²Hg', cps: 20, bg: 150 }, { name: '²⁰⁴Pb', cps: 2, bg: 120 },
            { name: '²⁰⁶Pb', cps: pb206, bg: 30, drift: 0.25 }, { name: '²⁰⁷Pb', cps: pb207, bg: 25, drift: 0.25 },
            { name: '²³²Th', cps: u238 * 0.4, bg: 5 }, { name: '²³⁸U', cps: u238, bg: 5 },
          ],
          rep: S.rep, p, dwell: S.dwell, settle: 0.001, seed, depthRate, spot: S.spot,
        });
      };
      const rm = REF_ZIRCONS[S.rm];
      const simRM = mk(rm.age206_238, 150, S.seed + 100);
      const sim = mk(S.age, S.U, S.seed);
      const win = [24, 48], bl = [2, 18];
      const meas = (sm) => integrate(sm, 2, win, bl) / integrate(sm, 5, win, bl);
      const mRM = meas(simRM), mU = meas(sim);
      const rTrue = ratio206_238(rm.age206_238);
      const r = bracket(mU, mRM, rTrue);
      const ageOut = age206_238(r);
      ro.sweep.set(`${(sim.sweep * 1000).toFixed(0)} ms (${6} isotopes)`);
      ro.depth.set(`${(depthRate * 30).toFixed(1)} µm`);
      ro.rmMeas.set(`${mRM.toFixed(4)} (true ${rTrue.toFixed(4)})`);
      ro.unkMeas.set(mU.toFixed(4));
      const err = (ageOut / S.age - 1) * 100;
      ro.res.set(`${(ageOut / 1e6).toFixed(1)} Ma (${(S.age / 1e6).toFixed(1)}) · ${err >= 0 ? '+' : ''}${err.toFixed(2)} %`, Math.abs(err) < 2 ? 'good' : 'warn');
      cSig.setSeries(sim.series.map((s, i) => ({ name: ['²⁰²Hg', '²⁰⁴Pb', '²⁰⁶Pb', '²⁰⁷Pb', '²³²Th', '²³⁸U'][i], color: PALETTE[i], x: sim.t, y: s.map((v) => Math.max(1, v)), width: 1 })));
      cSig.setMarks([{ x0: bl[0], x1: bl[1], color: '#94a3b8', alpha: 0.12 }, { x0: win[0], x1: win[1], color: '#10b981', alpha: 0.1 }]);
      const ratioSeries = (sm) => {
        const xs = [], ys = [];
        const m = meas(sm);
        sm.t.forEach((t, k) => { if (t > 21 && t < 50) { const u = sm.series[5][k] - 5; if (u > 0) { xs.push(t); ys.push((sm.series[2][k] - 30) / u / m); } } });
        return { xs, ys };
      };
      const a1 = ratioSeries(sim), a2 = ratioSeries(simRM);
      cRat.setSeries([
        { name: 'unknown', color: PALETTE[0], x: a1.xs, y: a1.ys, type: 'scatter', r: 1.5 },
        { name: `${rm.name} (RM)`, color: PALETTE[1], x: a2.xs, y: a2.ys, type: 'scatter', r: 1.5 },
      ]);
      cRat.setOptions({ yMin: 0.6, yMax: 1.4 });
    }, 80);
    run();

    return {
      root, exploder: ex, panel, scale: 2.2, defaults: { xray: true },
      camera: { position: [-0.2, 1.6, 2.0], target: [-0.6, 0.3, 0.05] },
      update(dt) { aerosol.update(dt); ms.turbo?.update?.(dt, true); },
      dispose() { cSig.dispose(); cRat.dispose(); },
    };
  },
};
