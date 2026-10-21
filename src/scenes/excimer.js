// 193 nm ArF excimer laser-ablation workstation: beam delivery, two-volume cell, ablation,
// crater growth, aerosol transport and washout.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Sparks } from '../core/beam.js';
import { LaserBeam } from '../core/laserbeam.js';
import { Chart, PALETTE } from '../core/chart.js';
import { section, slider, select, readouts, note, para, table, sources, h, debounce } from '../core/ui.js';
import { M } from '../core/materials.js';
import { mesh } from '../core/geom.js';
import { buildLA, LA_VENDORS } from '../components/laser.js';
import { registerParts } from '../components/parts.js';
import { MATERIALS, fluence, depthPerPulse, craterDepth, washoutParams, washoutTime, pulseResponse, pulseTrain, downholeFactor } from '../physics/ablation.js';
import { RNG } from '../physics/rng.js';
import { srcList, SRC } from '../sources.js';

/** Magnified crater model (×scale) sitting beside the cell. Returns {group, setDepth}. */
export function craterModel({ spotUm = 25, scale = 500, rim = 0 }) {
  const g = new THREE.Group();
  const S = scale * 1e-6; // metres per µm in the model
  const blockW = 120 * S;
  const top = new THREE.MeshPhysicalMaterial({ color: 0xd59a5c, roughness: 0.35, transmission: 0.15, thickness: 0.01, name: 'zircon (magnified)' });
  const block = mesh(new THREE.BoxGeometry(blockW, 60 * S, blockW), top, { name: 'mineral block' });
  block.position.y = -30 * S;
  g.add(block);
  const pit = mesh(new THREE.CylinderGeometry(spotUm * S / 2, spotUm * S / 2 * 0.9, 1, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x5a3820, roughness: 0.9, side: THREE.BackSide, name: 'crater wall' }), { name: 'crater' });
  g.add(pit);
  const floor = mesh(new THREE.CircleGeometry(spotUm * S / 2 * 0.9, 40), new THREE.MeshPhysicalMaterial({ color: 0x3b2516, roughness: 0.95 }), { name: 'crater floor' });
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  // the block top has a dark disc where the pit opens (cheap "hole" illusion)
  const mouth = mesh(new THREE.CircleGeometry(spotUm * S / 2, 40), new THREE.MeshBasicMaterial({ color: 0x120a05 }), { name: 'crater mouth' });
  mouth.rotation.x = -Math.PI / 2; mouth.position.y = 0.0001;
  g.add(mouth);
  let rimMesh = null;
  if (rim > 0) {
    rimMesh = mesh(new THREE.TorusGeometry(spotUm * S / 2 + rim * S * 0.6, rim * S * 0.5, 10, 40), new THREE.MeshPhysicalMaterial({ color: 0xb98454, roughness: 0.15, clearcoat: 1, name: 'resolidified melt rim' }), { name: 'melt rim' });
    rimMesh.rotation.x = Math.PI / 2;
    g.add(rimMesh);
  }
  const setDepth = (dUm) => {
    const d = Math.max(0.2, dUm) * S;
    pit.scale.y = d; pit.position.y = -d / 2;
    floor.position.y = -d + 0.00005;
    mouth.visible = dUm < 0.5;
  };
  setDepth(0);
  // cut-away: make the block semi-transparent so the pit is visible
  top.transparent = true; top.opacity = 0.55;
  return { group: g, setDepth, S, rimMesh };
}

export default {
  id: 'excimer',
  title: '193 nm excimer LA system',
  group: 'Laser ablation',
  icon: '⚡',
  blurb: 'ArF laser, homogeniser, aperture imaging, two-volume cell, crater & washout',
  async create(ctx) {
    const root = new THREE.Group();
    let ex = new Exploder();
    const exploder = { t: 0, set(t) { this.t = t; ex.set(t); } };
    const S = { vendor: 'analyte', spot: 25, E: 0.015, rep: 5, mat: 'zircon', Q: 0.8, tube: 1.5, shots: 0, playing: true };
    let la = null, beam = null, crater = null;
    const plume = new Sparks({ color: 0xffd9a0, max: 500, size: 0.0015 });
    const rng = new RNG(5);

    function rebuild() {
      if (la) { root.remove(la.group); la.group.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); }); }
      if (beam) { root.remove(beam); }
      if (crater) { root.remove(crater.group); crater.group.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); }); }
      ex = new Exploder();
      la = buildLA({ type: 'excimer', vendor: S.vendor });
      root.add(la.group);
      registerParts(ex, la.parts);
      beam = new LaserBeam(la.beamPath, { color: 0x9b5cff, radius: 0.0022, rep: S.rep });
      beam.onPulse = pulse;
      root.add(beam);
      root.add(plume);
      crater = craterModel({ spotUm: S.spot, scale: 400 });
      crater.group.position.set(0.56, 0.115, 0.19);
      root.add(crater.group);
      ex.add(crater.group, [0.05, 0.08, 0.1], { name: 'Crater (×400, cut-away)', info: 'Magnified crater in zircon: depth grows ≈ linearly with pulses at constant fluence, slowing as the aspect ratio rises (illustrative model).', order: 0.9 });
      ctx.label(crater.group, 'Crater ×400', { sub: 'cut-away', offset: [0, 0.03, 0] });
      const f = la.features;
      ctx.label(f.laser, 'ArF excimer laser', { sub: '193 nm · ns pulses', offset: [-0.32, 0.47, 0] });
      ctx.label(f.optics.children[1], 'Homogeniser', { offset: [0, 0.03, 0] });
      ctx.label(f.optics.children[3], 'Aperture', { sub: 'imaged to sample', offset: [0, 0.035, 0] });
      ctx.label(f.optics.children[5], 'Objective', { offset: [0.03, 0, 0] });
      ctx.label(f.cell, 'Two-volume cell', { sub: la.cell && LA_VENDORS[S.vendor].cell, offset: [0, 0.07, 0] });
      ctx.label(f.gas, 'He + Ar make-up → ICP', { offset: [0.62, 0.13, 0] });
      ex.set(exploder.t);
      ctx.app.applyXray?.();
      S.shots = 0;
    }

    function pulse() {
      const p = la.ablation;
      for (let i = 0; i < 40; i++) {
        const v = new THREE.Vector3(rng.normal(0, 0.012), Math.abs(rng.normal(0.03, 0.012)), rng.normal(0, 0.012));
        plume.spawn(p.clone(), v, 0.5 + rng.u() * 0.5, (pp, vv, age, dt) => {
          // He flow sweeps the plume to the outlet (+x)
          vv.x += 0.25 * dt; vv.y -= 0.05 * dt; vv.multiplyScalar(0.985);
        });
      }
      S.shots += Math.max(1, Math.round(S.rep / Math.min(S.rep, 8)));
      const F = fluence(S.E, S.spot);
      crater.setDepth(craterDepth(S.shots, F, MATERIALS[S.mat], S.spot));
    }

    // ---- panel ----
    const intro = section('193 nm excimer laser ablation', { icon: '⚡' });
    intro.body.append(
      para('An ArF excimer emits ns pulses at <b>193 nm (6.4 eV)</b>, strongly absorbed even by transparent minerals. A homogeniser flattens the beam; an aperture is imaged onto the sample so the crater has vertical walls and a flat floor. Ablated material is swept by <b>He</b> from a small inner volume of a two-volume cell, mixed with Ar make-up gas and carried to the ICP.'),
    );
    const sys = section('System & ablation settings', { icon: '⚙' });
    const vSel = select({ label: 'Commercial system (preset)', value: S.vendor, options: ['analyte', 'nwr193', 'resolution'].map((k) => ({ value: k, label: LA_VENDORS[k].name })), onChange: (v) => { S.vendor = v; S.Q = LA_VENDORS[v].Q; rebuild(); refresh(); specs(); } });
    const mSel = select({ label: 'Material', value: S.mat, options: Object.entries(MATERIALS).map(([k, m]) => ({ value: k, label: m.name })), onChange: (v) => { S.mat = v; refresh(); } });
    const sSpot = slider({ label: 'Spot diameter', min: 5, max: 150, step: 1, value: S.spot, fmt: (v) => `${v} µm`, onInput: (v) => { S.spot = v; refresh(); rebuildCrater(); } });
    const sE = slider({ label: 'Pulse energy on sample', min: 0.0005, max: 0.2, value: S.E, log: true, fmt: (v) => `${(v * 1000).toFixed(1)} µJ`, onInput: (v) => { S.E = v; refresh(); } });
    const sRep = slider({ label: 'Repetition rate', min: 1, max: 50, step: 1, value: S.rep, fmt: (v) => `${v} Hz`, onInput: (v) => { S.rep = v; beam.rep = v; refresh(); } });
    const sQ = slider({ label: 'He carrier flow', min: 0.3, max: 1.5, step: 0.05, value: S.Q, fmt: (v) => `${v.toFixed(2)} L min⁻¹`, onInput: (v) => { S.Q = v; refresh(); } });
    const sT = slider({ label: 'Transfer tube length (3 mm i.d.)', min: 0.3, max: 4, step: 0.1, value: S.tube, fmt: (v) => `${v.toFixed(1)} m`, onInput: (v) => { S.tube = v; refresh(); } });
    const ro = readouts([
      { id: 'F', label: 'Fluence' }, { id: 'dpp', label: 'Depth per pulse' },
      { id: 'd30', label: 'Depth after 30 s' }, { id: 'ar', label: 'Aspect ratio (depth/diam.)' },
      { id: 'tau', label: 'Cup τ = V/Q' }, { id: 'wash', label: 'Washout to 1 %' },
      { id: 'dh', label: 'Down-hole ²⁰⁶Pb/²³⁸U drift over 30 s', wide: true },
    ]);
    sys.body.append(vSel.el, mSel.el, sSpot.el, sE.el, sRep.el, sQ.el, sT.el, ro.el);
    const charts = section('Signal & crater', { icon: '∿' });
    const cPulse = new Chart(charts.body, { height: 170, title: 'Single-pulse response and pulse train', xLabel: 'time (s)', yLabel: 'signal (norm.)', legendPos: 'tr' });
    const cDepth = new Chart(charts.body, { height: 150, title: 'Crater depth vs pulses', xLabel: 'pulses', yLabel: 'depth (µm)' });
    charts.body.append(note('Ablation-rate constants (threshold fluence, α⁻¹), cup volumes and the down-hole fractionation slope are illustrative; measure crater depths on your own instrument to calibrate.', 'warn'));
    const specCard = section('System specifications & provenance', { icon: '✓', open: false });
    const panel = [intro.el, sys.el, charts.el, specCard.el];

    function specs() {
      const V = LA_VENDORS[S.vendor];
      const row = (k, lbl, val) => [lbl, val ?? '—', V.verified.includes(k) ? '<span class="tag v">source</span>' : '<span class="tag a">assumed</span>'];
      specCard.body.replaceChildren(
        para(`<b>${V.name}</b> — ${V.laser}; ${V.cell}.`),
        table(['Item', 'Value', ''], [
          row('nm', 'Wavelength', `${V.nm} nm`), row('pulse', 'Pulse width', V.pulse), row('rep', 'Repetition rate', V.rep),
          row('spot', 'Spot sizes', V.spot), row('fluenceMax', 'Max fluence', V.fluenceMax ? `${V.fluenceMax} J cm⁻²` : 'not stated'),
          row('washout', 'Washout', V.washout), ['Cup volume (model)', `${V.cupVol} cm³`, '<span class="tag a">assumed</span>'],
        ]),
        sources([SRC[V.src], SRC.anu].filter(Boolean)),
      );
    }

    function rebuildCrater() {
      if (crater) { root.remove(crater.group); crater.group.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); }); ex.removeUnder(crater.group); }
      crater = craterModel({ spotUm: S.spot, scale: 400 });
      crater.group.position.set(0.56, 0.115, 0.19);
      root.add(crater.group);
      ex.add(crater.group, [0.05, 0.08, 0.1], { name: 'Crater (×400, cut-away)', info: 'Magnified crater.', order: 0.9 });
      ctx.label(crater.group, 'Crater ×400', { sub: 'cut-away', offset: [0, 0.03, 0] });
      ex.set(exploder.t);
      S.shots = 0;
    }

    const refresh = debounce(() => {
      const mat = MATERIALS[S.mat];
      const F = fluence(S.E, S.spot);
      const dpp = depthPerPulse(F, mat);
      const n30 = S.rep * 30;
      const d30 = craterDepth(n30, F, mat, S.spot);
      ro.F.set(`${F.toFixed(2)} J cm⁻²`, F < mat.Fth ? 'bad' : F > 15 ? 'warn' : 'good');
      ro.dpp.set(`${(dpp * 1000).toFixed(0)} nm`);
      ro.d30.set(`${d30.toFixed(1)} µm`);
      ro.ar.set((d30 / S.spot).toFixed(2), d30 / S.spot > 1 ? 'warn' : '');
      const p = washoutParams({ cupVol: LA_VENDORS[S.vendor].cupVol, Q: S.Q, tubeLen: S.tube, tubeId: 3 });
      ro.tau.set(`${(p.tau1 * 1000).toFixed(0)} ms`);
      const w = washoutTime(p);
      ro.wash.set(`${w.toFixed(2)} s`, w < 2 ? 'good' : 'warn');
      ro.dh.set(`×${downholeFactor(d30, S.spot).toFixed(3)} (illustrative; corrected by matching a reference zircon run identically)`);
      const ts = [], h1 = [], tr = [];
      const tEnd = Math.max(3, p.td + 8 * (p.tau1 + p.tau2));
      for (let t = 0; t <= tEnd; t += tEnd / 400) ts.push(t);
      for (const t of ts) h1.push(pulseResponse(t, p));
      const train = pulseTrain(ts, { rep: S.rep, tOn: 0, tOff: tEnd * 0.5, p });
      const mx = Math.max(...h1), mt = Math.max(...train);
      cPulse.setSeries([
        { name: 'one pulse', color: PALETTE[4], x: ts, y: h1.map((v) => v / mx), width: 2 },
        { name: `${S.rep} Hz train (scaled)`, color: PALETTE[0], x: ts, y: train.map((v) => v / mt), width: 1.6 },
      ]);
      const ns = [], ds = [];
      for (let n = 0; n <= n30; n += Math.max(1, Math.round(n30 / 100))) { ns.push(n); ds.push(craterDepth(n, F, mat, S.spot)); }
      cDepth.setSeries([{ name: '', color: PALETTE[2], x: ns, y: ds, width: 2 }]);
    }, 40);

    rebuild();
    refresh();
    specs();

    return {
      root, exploder, panel, scale: 1.2, defaults: { xray: true },
      camera: { position: [0.75, 0.85, 1.05], target: [0.1, 0.18, 0] },
      update(dt) { plume.update(dt); if (S.shots > 3000) { S.shots = 0; } },
      dispose() { cPulse.dispose(); cDepth.dispose(); },
    };
  },
};
