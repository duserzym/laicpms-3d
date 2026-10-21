// iCAP RQ (single quad) vs iCAP TQ (triple quad) ICP-MS with mode-dependent ion paths.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { IonBeam } from '../core/beam.js';
import { section, segmented, select, readouts, note, para, table, sources, h } from '../core/ui.js';
import { buildICPMS, ICP_DIMS } from '../components/icpms.js';
import { registerParts } from '../components/parts.js';
import { TQ_MODES } from '../physics/cell.js';
import { SRC, srcList } from '../sources.js';

const MODES_SQ = [
  { id: 'STD', label: 'SQ-STD (no cell gas)' },
  { id: 'KED', label: 'SQ-KED (He + energy barrier)' },
];

function cutPath(path, zCut, fromEnd = false) {
  // path: polyline that ends travelling −Z; split where z first falls below zCut on the final leg
  const out = [], rest = [];
  let split = false;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!split && i > 0 && p.z < zCut && Math.abs(p.x - path[path.length - 1].x) < 1e-6) {
      const a = path[i - 1];
      const t = (zCut - a.z) / (p.z - a.z);
      const m = a.clone().lerp(p, Math.max(0, Math.min(1, t)));
      out.push(m); rest.push(m.clone());
      split = true;
    }
    (split ? rest : out).push(p.clone());
  }
  return fromEnd ? rest : out;
}
const offsetY = (pts, dy) => pts.map((p) => p.clone().add(new THREE.Vector3(0, dy, 0)));

export default {
  id: 'icpms',
  title: 'iCAP RQ vs TQ ICP-MS',
  group: 'ICP-MS',
  icon: '⌬',
  blurb: 'Torch → cones → 90° lens → (Q1) → QCell → Q3 → SEM; on-mass vs mass-shift',
  async create(ctx) {
    const root = new THREE.Group();
    let ex = new Exploder();
    const exploder = { set: (t) => { exploder.t = t; ex.set(t); }, t: 0 };
    let inst = null;
    const S = { variant: new URLSearchParams(location.hash.slice(1)).get('variant') === 'RQ' ? 'RQ' : 'TQ', mode: 'As' };
    const beams = new THREE.Group();

    const intro = section('ICP-MS architecture', { icon: '⌬' });
    const varSeg = segmented({ options: [{ value: 'RQ', label: 'iCAP RQ (single quad)' }, { value: 'TQ', label: 'iCAP TQ (triple quad)' }], value: S.variant, onChange: (v) => { S.variant = v; if (v === 'RQ' && !MODES_SQ.find((m) => m.id === S.mode)) S.mode = 'KED'; rebuild(); } });
    intro.body.append(varSeg.el, para('Ions formed in the argon plasma are sampled through two cones, extracted, bent 90° away from neutrals and photons, cleaned of interferences in the collision/reaction cell and mass-filtered by a quadrupole before an electron multiplier counts them. The triple quad adds a <b>first</b> quadrupole (Q1) in front of the cell so only one precursor m/z can react.'));

    const modeCard = section('Measurement mode', { icon: '⚗' });
    const modeSel = select({ label: 'Mode', value: S.mode, options: [], onChange: (v) => { S.mode = v; drawBeams(); fill(); } });
    const ro = readouts([{ id: 'q1', label: 'Q1' }, { id: 'gas', label: 'Cell gas' }, { id: 'q3', label: 'Q3 / analyser' }, { id: 'det', label: 'Detected' }, { id: 'rm', label: 'Interferences removed', wide: true }]);
    const modeNote = h('div');
    modeCard.body.append(modeSel.el, ro.el, modeNote);

    const spec = section('Specifications & provenance', { icon: '✓', open: false });
    spec.body.append(
      table(['Item', 'iCAP TQ (stated)', ''], [
        ['Interface', 'Front-opening Ni/Pt cones, magnetic release, high-sensitivity / high-matrix inserts', '<span class="tag v">spec</span>'],
        ['Ion optics', 'RAPID 90° deflection lens, off-axis open lens stack', '<span class="tag v">spec</span>'],
        ['Cell', 'QCell flatapole; He, H₂, O₂, NH₃', '<span class="tag v">spec</span>'],
        ['Modes', 'SQ (± He KED), TQ on-mass, TQ mass-shift', '<span class="tag v">spec</span>'],
        ['Detector', 'Dual-mode SEM, dwell ≥ 100 µs', '<span class="tag v">spec</span>'],
        ['Sensitivity', 'up to 330 kcps per µg L⁻¹ (U, SQ)', '<span class="tag v">spec</span>'],
        ['Oxides / doubly charged', '< 2 % / < 4 %', '<span class="tag v">spec</span>'],
        ['Vacuum', 'Split-flow turbo + external rotary/roots', '<span class="tag v">spec</span>'],
        ['Rod r₀, lengths, RF', `r₀ ${(ICP_DIMS.r0 * 1000).toFixed(1)} mm, ${ICP_DIMS.quadLen * 100} cm, ${ICP_DIMS.rfMHz} MHz`, '<span class="tag a">assumed</span>'],
      ]),
      note('The iCAP RQ shares the platform without Q1 (single quad + QCell with KED).'),
      sources(srcList('thermoTQspec', 'thermoTQ', 'thermoTQpage', 'thermoRQ', 'thermoTQe')),
    );
    const panel = [intro.el, modeCard.el, spec.el];

    function rebuild() {
      if (inst) { root.remove(inst.group); inst.group.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); }); }
      ex = new Exploder();
      inst = buildICPMS({ variant: S.variant });
      root.add(inst.group);
      registerParts(ex, inst.parts);
      const L = (obj, t, sub, off) => obj && ctx.label(obj, t, { sub, offset: off });
      const f = inst.features;
      L(f.torch, 'ICP torch', 'RF coil · plasma', [-0.03, 0.05, 0]);
      L(f.interface.children[1], 'Sampler & skimmer', 'Ni / Pt cones', [0, 0.05, 0]);
      L(f.rapid.children[3], '90° deflection lens', 'RAPID', [-0.133, inst.H + 0.04, -0.028]);
      if (f.q1) L(f.q1, 'Q1', 'precursor filter', [0, 0.04, 0]);
      L(f.cell, 'QCell', 'flatapole CRC', [0, 0.04, 0]);
      L(f.q3, S.variant === 'TQ' ? 'Q3' : 'Quadrupole', 'analyser', [0, 0.04, 0]);
      L(f.detector, 'SEM detector', 'pulse / analogue', [0, 0.05, -0.02]);
      const opts = S.variant === 'TQ' ? [...MODES_SQ, ...TQ_MODES.map((m) => ({ id: m.id, label: 'TQ: ' + m.label }))] : MODES_SQ;
      modeSel.el.querySelector('select').replaceChildren(...opts.map((o) => h('option', { value: o.id, selected: o.id === S.mode }, o.label)));
      if (!opts.find((o) => o.id === S.mode)) S.mode = opts[0].id;
      modeSel.set(S.mode);
      root.add(beams);
      drawBeams();
      fill();
      ex.set(exploder.t);
      ctx.app.applyXray?.();
    }

    function drawBeams() {
      for (const b of [...beams.children]) { beams.remove(b); b.dispose?.(); }
      const P = inst.path;
      const k = inst.keyPoints;
      const chain = inst.chain;
      const q3 = chain[chain.length - 1];
      const cell = chain.find((c) => c.name.startsWith('QCell'));
      const q1 = chain.find((c) => c.name.startsWith('Q1'));
      const zCellMid = (cell.z0 + cell.z1) / 2;
      const add = (pts, color, o = {}) => { const b = new IonBeam(pts, { color, radius: 0.0012, particles: 18, speed: 0.12, size: 0.004, ...o }); beams.add(b); return b; };
      const matrixStop = q1 ? q1.z0 - 0.01 : q3.z0 - 0.01;
      // matrix / other masses: rejected by the first mass filter in the path
      add(offsetY(cutPath(P, matrixStop), 0.0025), 0xdfe6ef, { opacity: 0.35, particles: 24 });
      const mode = S.mode;
      const tq = TQ_MODES.find((m) => m.id === mode);
      const cA = 0x5ab0ff, cI = 0xff6f91, cP = 0x4fd6a1;
      if (!tq) {
        // single-quad modes: analyte + polyatomic share the same m/z all the way to the cell
        add(cutPath(P, zCellMid), cA);
        add(cutPath(P, mode === 'KED' ? cell.z1 + 0.005 : zCellMid).map((p) => p.clone().add(new THREE.Vector3(0, -0.0015, 0))), cI, { opacity: 0.5 });
        add(cutPath(cutPath(P, zCellMid, true), k.zDet + 0.02), cA);
        if (mode !== 'KED') add(offsetY(cutPath(P, zCellMid, true), -0.0015), cI, { opacity: 0.5 });
      } else {
        // TQ mass shift: Q1 passes analyte + isobars at q1; analyte reacts in the cell → product
        add(cutPath(P, zCellMid), cA);
        add(offsetY(cutPath(P, q3.z0 - 0.02), -0.0015), cI, { opacity: 0.5 });
        add(cutPath(P, zCellMid, true), cP);
      }
    }

    function fill() {
      const tq = TQ_MODES.find((m) => m.id === S.mode);
      const isTQ = S.variant === 'TQ';
      if (!tq) {
        ro.q1.set(isTQ ? 'wide open (SQ mode)' : '— (no Q1)');
        ro.gas.set(S.mode === 'KED' ? 'He + KED' : 'none');
        ro.q3.set('analyte m/z (e.g. 56)');
        ro.det.set(S.mode === 'KED' ? '⁵⁶Fe⁺ (ArO⁺ suppressed)' : '⁵⁶Fe⁺ + ⁴⁰Ar¹⁶O⁺');
        ro.rm.set(S.mode === 'KED' ? 'Polyatomics lose more energy in He collisions and are stopped by the barrier (see Collision cell scene)' : 'none — polyatomic and isobaric overlaps reach the detector', S.mode === 'KED' ? 'good' : 'warn');
        modeNote.replaceChildren(para('Legend: <span style="color:#5ab0ff">■</span> analyte (e.g. ⁵⁶Fe⁺) · <span style="color:#ff6f91">■</span> polyatomic interferent (⁴⁰Ar¹⁶O⁺) · <span style="color:#9aa">■</span> other ions rejected by the quadrupole.'));
      } else {
        ro.q1.set(`m/z ${tq.q1}`); ro.gas.set(tq.gas); ro.q3.set(`m/z ${tq.q3}`);
        ro.det.set(tq.product, 'good'); ro.rm.set(tq.removes, 'good');
        modeNote.replaceChildren(
          para(`Legend: <span style="color:#5ab0ff">■</span> ${tq.analyte} · <span style="color:#ff6f91">■</span> isobaric/polyatomic ions at m/z ${tq.q1} (unreactive → rejected by Q3) · <span style="color:#4fd6a1">■</span> product ${tq.product}.`),
          note(tq.v ? `Chemistry stated in the cited source.${tq.note ? ' ' + tq.note : ''}` : 'Widely used mass shift; not verified against a source in this project.', tq.v ? '' : 'warn'),
          sources(tq.src ? srcList(tq.src) : []),
        );
      }
    }

    rebuild();
    return {
      root, exploder, panel, scale: 1.0, defaults: { xray: true },
      camera: { position: [0.42, 0.88, 0.6], target: [-0.14, 0.4, -0.24] },
      update(dt) { inst?.turbo?.update?.(dt, true); },
      dispose() {},
    };
  },
};
