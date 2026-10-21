// Collision/reaction cell: KED with helium and triple-quad reaction chemistry.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Sparks } from '../core/beam.js';
import { Chart, PALETTE } from '../core/chart.js';
import { section, slider, select, readouts, note, para, table, sources, h, debounce } from '../core/ui.js';
import { M } from '../core/materials.js';
import { mesh, plateWithHole, tubeShell } from '../core/geom.js';
import { KED_PAIRS, kedEvaluate, histogram, TQ_MODES, meanRetained } from '../physics/cell.js';
import { RNG } from '../physics/rng.js';
import { srcList } from '../sources.js';

const mm = 1e-3;

export default {
  id: 'cell',
  title: 'Collision / reaction cell',
  group: 'ICP-MS',
  icon: '⚗',
  blurb: 'He KED energy filtering; O₂ / NH₃ / N₂O mass-shift chemistry on a TQ',
  async create(ctx) {
    const root = new THREE.Group();
    const ex = new Exploder();
    const S = { pair: 'Fe', P: 1.4, barrier: 1.0, E0: 8 };
    const Lc = 0.12, r0 = 3.2 * mm;

    // ---- flatapole cell ----
    const rods = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const r = mesh(new THREE.BoxGeometry(1.1 * r0, 1.0 * mm, Lc), M.gold(), { name: 'flatapole rod' });
      r.rotation.z = a + Math.PI / 2;
      r.position.set(Math.cos(a) * (r0 + 0.5 * mm), Math.sin(a) * (r0 + 0.5 * mm), 0);
      rods.add(r);
      ex.add(r, [Math.cos(a) * 0.025, Math.sin(a) * 0.025, 0], { name: 'Flatapole rod', info: 'Flat rods driven with RF only (no mass-resolving DC): ions are confined radially while He collisions or reactions happen. The flat geometry gives a defined low-mass cut-off that also removes light reaction by-products (Thermo QCell).', order: 0.4 });
    }
    root.add(rods);
    const can = mesh(tubeShell(0.018, 0.0165, Lc + 0.01, 48), M.steelBrushed(), { name: 'cell housing' });
    can.rotation.x = Math.PI / 2;
    root.add(can);
    ex.add(can, [0, 0.05, 0], { name: 'Cell housing', info: 'Gas-tight enclosure filled with He (KED) or a reactive gas (H₂, O₂, NH₃) at ~10⁻² mbar, differentially pumped from the analyser.', shell: true, order: 0 });
    const ent = mesh(plateWithHole(0.04, 0.04, 1.2 * mm, 1.6 * mm, { round: true }), M.steel(), { name: 'entrance aperture' });
    ent.position.z = Lc / 2 + 0.008;
    const exit = mesh(plateWithHole(0.04, 0.04, 1.2 * mm, 1.6 * mm, { round: true }), M.steelPolished(), { name: 'exit / KED barrier' });
    exit.position.z = -Lc / 2 - 0.008;
    root.add(ent, exit);
    ex.add(ent, [0, 0, 0.04], { name: 'Cell entrance aperture', info: 'Ions enter with a few eV of axial energy set by the plasma potential and the cell-rod bias.', order: 0.1 });
    ex.add(exit, [0, 0, -0.04], { name: 'Exit lens / KED barrier', info: 'In KED mode the analyser (Q3) bias is set slightly more positive than the cell bias: only ions that kept more than this energy (atomic analytes) climb over the barrier.', order: 0.1 });
    const gasIn = mesh(new THREE.CylinderGeometry(1.2 * mm, 1.2 * mm, 0.02, 12), M.peek(), { name: 'gas inlet' });
    gasIn.position.set(0, 0.027, 0.03);
    root.add(gasIn);
    ex.add(gasIn, [0, 0.07, 0], { name: 'Cell-gas inlet', info: 'Mass-flow controlled He, H₂, O₂, NH₃ (iCAP TQ: four channels standard).', order: 0.05 });
    ctx.label(rods, 'QCell (flatapole)', { sub: 'RF-only', offset: [0, 0.02, 0] });
    ctx.label(exit, 'KED barrier', { sub: 'Q3 bias − cell bias', offset: [0, 0.022, 0] });
    ctx.label(gasIn, 'He / H₂ / O₂ / NH₃', { offset: [0, 0.013, 0] });

    // ---- particles: He atoms + ions ----
    const he = new Sparks({ color: 0x9fb4c8, max: 220, size: 1.0 * mm });
    const ionsA = new Sparks({ color: 0x5ab0ff, max: 140, size: 2.6 * mm });
    const ionsI = new Sparks({ color: 0xff6f91, max: 140, size: 3.2 * mm });
    root.add(he, ionsA, ionsI);
    const rng = new RNG(11);
    for (let i = 0; i < 160; i++) {
      he.spawn(new THREE.Vector3(rng.uniform(-r0, r0), rng.uniform(-r0, r0), rng.uniform(-Lc / 2, Lc / 2)), new THREE.Vector3(rng.normal(0, 0.004), rng.normal(0, 0.004), rng.normal(0, 0.004)), 1e9,
        (p, v) => { if (Math.abs(p.x) > r0) v.x *= -1; if (Math.abs(p.y) > r0) v.y *= -1; if (Math.abs(p.z) > Lc / 2) v.z *= -1; });
    }
    // ions travel −Z; each collision scales speed by √(E'/E)
    function spawnIon(kind) {
      const pair = KED_PAIRS.find((p) => p.id === S.pair);
      const m = kind === 'A' ? pair.mA : pair.mI;
      const sig = kind === 'A' ? pair.sA : pair.sI;
      const lam = (S.P / (1.380649e-23 * 300)) * sig * 1e-20 * Lc; // mean collisions
      const pPer = lam / (Lc / 0.002); // per 2 mm step
      const set = kind === 'A' ? ionsA : ionsI;
      const st = { E: Math.max(0.5, rng.normal(S.E0, 0.8)), lastZ: Lc / 2 + 0.01 };
      const v0 = 0.05; // visual speed at E0
      set.spawn(new THREE.Vector3(rng.normal(0, 0.6 * mm), rng.normal(0, 0.6 * mm), Lc / 2 + 0.012), new THREE.Vector3(0, 0, -v0 * Math.sqrt(st.E / S.E0)), 12, (p, v, age, dt) => {
        if (p.z < st.lastZ - 0.002 && p.z > -Lc / 2) {
          st.lastZ = p.z;
          if (rng.u() < pPer) {
            const cos = 2 * rng.u() - 1;
            st.E *= (m * m + 16 + 2 * m * 4.0026 * cos) / ((m + 4.0026) ** 2);
            const sp = v0 * Math.sqrt(st.E / S.E0);
            v.set(rng.normal(0, sp * 0.4), rng.normal(0, sp * 0.4), -sp);
          }
        }
        // radial RF confinement (visual): pull back toward axis
        v.x -= p.x * 40 * dt; v.y -= p.y * 40 * dt;
        // barrier at the exit
        if (p.z < -Lc / 2 - 0.004 && p.z > -Lc / 2 - 0.009 && v.z < 0 && st.E < S.barrier) { v.z = Math.abs(v.z) * 0.6; st.reflected = true; }
        if (st.reflected && p.z > 0) v.z = -Math.abs(v.z);
      });
    }
    let acc = 0;

    // ---- panel ----
    const intro = section('Collision / reaction cell', { icon: '⚗' });
    intro.body.append(
      para('<b>KED</b> (kinetic energy discrimination): in He, every elastic collision removes on average a fraction 1 − (m² + M²)/(m + M)² of an ion’s energy (≈ 12 % for m ≈ 56 with He). Polyatomic ions such as ⁴⁰Ar¹⁶O⁺ are physically larger, collide more often and arrive with less energy, so a small retarding potential at the exit removes them while most atomic analyte ions pass.'),
      para('<b>Reaction mode</b> (TQ): a reactive gas converts either the analyte (mass shift) or the interference (on-mass). Q1 before the cell admits only one precursor m/z, so new interferences cannot form at the product mass.'),
    );
    const ctl = section('KED settings', { icon: '⚙' });
    const pairSel = select({ label: 'Analyte / interference pair', value: S.pair, options: KED_PAIRS.map((p) => ({ value: p.id, label: `${p.analyte} vs ${p.interf}` })), onChange: (v) => { S.pair = v; recompute(); } });
    const sP = slider({ label: 'He pressure in cell', min: 0.1, max: 3, step: 0.05, value: S.P, fmt: (v) => `${v.toFixed(2)} Pa`, onInput: (v) => { S.P = v; recompute(); } });
    const sB = slider({ label: 'KED barrier', min: 0, max: 5, step: 0.05, value: S.barrier, fmt: (v) => `${v.toFixed(2)} V`, onInput: (v) => { S.barrier = v; recompute(); } });
    const sE = slider({ label: 'Ion energy entering cell', min: 3, max: 15, step: 0.5, value: S.E0, fmt: (v) => `${v.toFixed(1)} eV`, onInput: (v) => { S.E0 = v; recompute(); } });
    const ro = readouts([
      { id: 'nA', label: 'Collisions (analyte)' }, { id: 'nI', label: 'Collisions (polyatomic)' },
      { id: 'tA', label: 'Analyte transmitted' }, { id: 'tI', label: 'Polyatomic transmitted' },
      { id: 'red', label: 'Interference reduction (relative)', wide: true },
    ]);
    ctl.body.append(pairSel.el, sP.el, sB.el, sE.el, ro.el);
    const chartCard = section('Exit-energy distributions', { icon: '∿' });
    const chart = new Chart(chartCard.body, { height: 200, xLabel: 'ion energy at cell exit (eV)', yLabel: 'fraction', yMin: 0, legendPos: 'tr' });
    const curve = new Chart(chartCard.body, { height: 160, title: 'Transmission vs barrier', xLabel: 'barrier (V)', yLabel: 'transmitted', yLog: true, yMin: 1e-4, yMax: 1.2, legendPos: 'bl' });
    chartCard.body.append(note('Cross-sections are illustrative hard-sphere-style values; real KED performance depends on cell geometry, pressure and RF. The trade-off it shows — more suppression costs analyte sensitivity — is general.', 'warn'));

    const rx = section('TQ reaction chemistry', { icon: '⇢' });
    rx.body.append(
      table(['Mode', 'Q1 → Q3', 'Removes', ''], TQ_MODES.map((m) => [m.label, `${m.q1} → ${m.q3}`, m.removes, m.v ? '<span class="tag v">source</span>' : '<span class="tag a">check</span>'])),
      note(TQ_MODES.find((m) => m.id === 'Sr').note),
      sources(srcList('thermoTQ', 'hogmalm2017', 'hogmalmJAAS')),
    );
    const panel = [intro.el, ctl.el, chartCard.el, rx.el];

    const recompute = debounce(() => {
      const pair = KED_PAIRS.find((p) => p.id === S.pair);
      const r = kedEvaluate(pair, { P: S.P, barrier: S.barrier, E0: S.E0 });
      ro.nA.set(r.nA.toFixed(1)); ro.nI.set(r.nI.toFixed(1));
      ro.tA.set(`${(r.ta * 100).toFixed(1)} %`, r.ta < 0.2 ? 'warn' : 'good');
      ro.tI.set(`${(r.ti * 100).toFixed(2)} %`, r.ti < 0.05 ? 'good' : 'warn');
      ro.red.set(`${isFinite(r.reduction) ? r.reduction.toFixed(1) : '>10⁴'}× better analyte/interference ratio · energy kept per collision ≈ ${(meanRetained(pair.mA, 4.0026) * 100).toFixed(0)} %`);
      const ha = histogram(r.ea, { max: S.E0 * 1.5, bins: 60 }), hi = histogram(r.ei, { max: S.E0 * 1.5, bins: 60 });
      chart.setSeries([
        { name: pair.analyte, color: PALETTE[0], x: ha.x, y: ha.y, width: 2, fill: true },
        { name: pair.interf, color: PALETTE[3], x: hi.x, y: hi.y, width: 2, fill: true },
      ]);
      chart.setMarks([{ x: S.barrier, color: '#94a3b8', label: 'barrier' }]);
      const bs = [], ta = [], ti = [];
      for (let b = 0; b <= S.E0 * 1.2; b += S.E0 / 40) {
        bs.push(b);
        let ca = 0, ci = 0;
        for (const e of r.ea) if (e > b) ca++;
        for (const e of r.ei) if (e > b) ci++;
        ta.push(ca / r.ea.length); ti.push(ci / r.ei.length);
      }
      curve.setSeries([{ name: pair.analyte, color: PALETTE[0], x: bs, y: ta, width: 2 }, { name: pair.interf, color: PALETTE[3], x: bs, y: ti, width: 2 }]);
      curve.setMarks([{ x: S.barrier, color: '#94a3b8' }]);
    }, 60);
    recompute();

    return {
      root, exploder: ex, panel, scale: 0.2, defaults: { xray: true },
      camera: { position: [0.13, 0.05, 0.06], target: [0, 0, -0.005] },
      update(dt) {
        acc += dt;
        while (acc > 0.12) { acc -= 0.12; spawnIon(rng.u() < 0.5 ? 'A' : 'I'); }
        he.update(dt); ionsA.update(dt); ionsI.update(dt);
      },
      dispose() { chart.dispose(); curve.dispose(); },
    };
  },
};
