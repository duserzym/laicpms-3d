// Quadrupole mass filter: Mathieu stability, scan line, resolution, and 3-D trajectories.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Chart, PALETTE } from '../core/chart.js';
import { section, slider, readouts, note, para, h, debounce, toggle } from '../core/ui.js';
import { M } from '../core/materials.js';
import { mesh, plateWithHole } from '../core/geom.js';
import { stabilityRegion, scanWindow, resolutionFor, aq, vForMass, trajectory, stable2D } from '../physics/quadrupole.js';
import { RNG } from '../physics/rng.js';
import { ICP_DIMS } from '../components/icpms.js';

const mm = 1e-3;

let REGION = null; // cached boundary curve

export default {
  id: 'quadrupole',
  title: 'Quadrupole physics',
  group: 'ICP-MS',
  icon: '✚',
  blurb: 'Mathieu a–q stability, scan line, resolution & 3-D ion trajectories',
  async create(ctx) {
    ctx.setLoading('Computing the Mathieu stability region…');
    await new Promise((r) => setTimeout(r, 0));
    if (!REGION) REGION = stabilityRegion(60);
    const root = new THREE.Group();
    const ex = new Exploder();
    const r0 = ICP_DIMS.r0, L = ICP_DIMS.quadLen;
    const S = { m: 140, lambda: 0.33, f: ICP_DIMS.rfMHz * 1e6, deltas: [-1, 0, 1], cycles: 90 };

    // ---- rods (hyperbolic approximation by round rods, r = 1.148 r0) ----
    const rr = 1.148 * r0;
    const rods = new THREE.Group();
    const polMat = [new THREE.MeshPhysicalMaterial({ color: 0xd9dee6, metalness: 1, roughness: 0.18 }), new THREE.MeshPhysicalMaterial({ color: 0xc7b28a, metalness: 1, roughness: 0.2 })];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const g = new THREE.CylinderGeometry(rr, rr, L, 40);
      g.rotateX(Math.PI / 2);
      const rod = mesh(g, polMat[i % 2], { name: i % 2 ? 'y-rod pair (−(U + V cos Ωt))' : 'x-rod pair (+(U + V cos Ωt))' });
      rod.position.set(Math.cos(a) * (r0 + rr), Math.sin(a) * (r0 + rr), 0);
      rods.add(rod);
      const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(0.02);
      ex.add(rod, dir, { name: i % 2 ? 'Rod (y pair)' : 'Rod (x pair)', info: i % 2 ? 'Opposite rods are electrically connected. The y pair carries −(U + V cos Ωt): for positive ions the DC makes y motion defocusing, so heavy ions (small q) are lost in y.' : 'The x pair carries +(U + V cos Ωt). The DC focuses positive ions in x but the RF defocuses light ions (large q), which are lost in x.', order: 0.3 });
    }
    root.add(rods);
    for (const z of [-L / 2 - 0.006, L / 2 + 0.006]) {
      const p = mesh(plateWithHole(0.04, 0.04, 1.5 * mm, 2.4 * mm, { round: true }), M.steel(), { name: z < 0 ? 'entrance aperture' : 'exit aperture' });
      p.position.z = z;
      root.add(p);
      ex.add(p, [0, 0, z < 0 ? -0.04 : 0.04], { name: z < 0 ? 'Entrance lens' : 'Exit lens', info: 'Pre/post-filters (short RF-only rods or lenses) reduce fringe-field defocusing at the ends; ions with too much transverse energy are lost here.', order: 0.1 });
    }
    for (const z of [-L / 2 + 0.012, L / 2 - 0.012]) {
      const ring = mesh(plateWithHole(5.6 * r0 + 2 * rr, 5.6 * r0 + 2 * rr, 6 * mm, r0 * 1.1, { round: true }), M.alumina(), { name: 'ceramic holder' });
      ring.position.z = z;
      root.add(ring);
      ex.add(ring, [0, -0.03, 0], { name: 'Ceramic rod holder', info: 'Precision-ground ceramic collars fix r₀ to a few µm; geometric errors broaden peaks and create low-mass tails.', order: 0 });
    }
    ctx.label(rods.children[0], 'x rods', { sub: '+(U + V cos Ωt)', offset: [0, 0.008, -L / 2] });
    ctx.label(rods.children[1], 'y rods', { sub: '−(U + V cos Ωt)', offset: [0, 0.008, L / 2 - 0.02] });

    // ---- trajectories ----
    const trajGroup = new THREE.Group();
    root.add(trajGroup);
    const scale = r0; // transverse units of r0
    const colors = [0xff6f91, 0x4fd6a1, 0x5ab0ff];
    let anim = [];

    function drawTrajectories() {
      for (const c of [...trajGroup.children]) { trajGroup.remove(c); c.geometry?.dispose(); }
      anim = [];
      const rng = new RNG(7);
      const { V, U } = settings();
      S.deltas.forEach((dm, k) => {
        const m = S.m + dm;
        const p = aq(m, U, V, r0, S.f);
        for (let j = 0; j < 3; j++) {
          const tr = trajectory(p.a, p.q, { x0: rng.normal(0, 0.06), y0: rng.normal(0, 0.06), phase: rng.uniform(0, Math.PI), cycles: S.cycles, stepsPerCycle: 40 });
          const N = S.cycles * 40; // z advances uniformly with RF phase (constant axial velocity)
          const pts = tr.pts.map(([x, y], i) => new THREE.Vector3(x * scale, y * scale, -L / 2 + (i / N) * L));
          const g = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: colors[k], transparent: true, opacity: 0.9, toneMapped: false }));
          line.userData.beam = true;
          trajGroup.add(line);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45 * mm, 10, 8), new THREE.MeshBasicMaterial({ color: colors[k], toneMapped: false }));
          dot.userData.beam = true;
          trajGroup.add(dot);
          anim.push({ pts, dot, t: j * 0.3, hit: tr.hit });
          if (j === 0) {
            const tip = new THREE.Object3D();
            tip.position.copy(pts[pts.length - 1]).add(new THREE.Vector3(0, 0.006, 0));
            trajGroup.add(tip);
            ctx.label(tip, `m = ${m}`, { sub: tr.hit ? 'hits rod' : 'transmitted', className: tr.hit ? '' : 'callout' });
          }
        }
      });
    }

    // ---- panel ----
    const intro = section('Quadrupole mass filter', { icon: '✚' });
    intro.body.append(
      para('Opposite rods carry ±(U + V cos Ωt). In reduced units the motion obeys the <b>Mathieu equation</b> with a = 8eU/(m r₀²Ω²) and q = 4eV/(m r₀²Ω²). Only ions whose (q, a) lies inside the small triangular stability region (apex q ≈ 0.706, a ≈ 0.237) have bounded x <i>and</i> y motion and reach the detector.'),
      para('All masses lie on the <b>scan line</b> a/q = 2U/V; heavier ions sit at smaller q. Raising 2U/V towards the apex narrows the transmitted window — higher resolution, lower transmission. Scanning V (with U/V fixed) sweeps masses through the window.'),
    );
    const ctl = section('Settings', { icon: '⚙' });
    const sM = slider({ label: 'Set mass m', min: 7, max: 250, step: 1, value: S.m, fmt: (v) => `${v} u`, onInput: (v) => { S.m = v; update(); } });
    const sL = slider({ label: 'Scan-line slope 2U/V (resolution)', min: 0.25, max: 0.3355, step: 0.0005, value: S.lambda, fmt: (v) => v.toFixed(4), onInput: (v) => { S.lambda = v; update(); } });
    const sF = slider({ label: 'RF frequency', min: 1, max: 4, step: 0.05, value: S.f / 1e6, fmt: (v) => `${v.toFixed(2)} MHz`, onInput: (v) => { S.f = v * 1e6; update(); } });
    const sC = slider({ label: 'RF cycles in the filter', min: 20, max: 200, step: 5, value: S.cycles, fmt: (v) => `${v}`, onInput: (v) => { S.cycles = v; update(); } });
    const ro = readouts([
      { id: 'V', label: 'RF amplitude V (0-pk)' }, { id: 'U', label: 'DC U' },
      { id: 'aq', label: 'Set mass (q, a)' }, { id: 'R', label: 'Resolution m/Δm' },
      { id: 'win', label: 'Transmitted window', wide: true },
    ]);
    ctl.body.append(sM.el, sL.el, sF.el, sC.el, ro.el, note(`r₀ = ${(r0 * 1000).toFixed(1)} mm and f are assumed values (Thermo does not publish them). Trajectories: ±1 u around the set mass, three ions each with random entry position and RF phase.`, 'warn'));
    const chartsCard = section('Stability diagram & peak shape', { icon: '∿' });
    const stab = new Chart(chartsCard.body, { height: 220, title: 'First stability region (x and y stable)', xLabel: 'q', yLabel: 'a', xMin: 0, xMax: 0.92, yMin: 0, yMax: 0.26, legendPos: 'tl' });
    const peak = new Chart(chartsCard.body, { height: 170, title: 'Transmission vs mass (finite RF cycles, Monte-Carlo)', xLabel: 'mass (u)', yLabel: 'transmission', yMin: 0, yMax: 1.05 });
    const panel = [intro.el, ctl.el, chartsCard.el];

    function settings() {
      // choose V so the set mass sits at the centre of the transmitted window
      const w = scanWindow(S.lambda);
      const qc = w ? (w.q1 + w.q2) / 2 : 0.706;
      const V = vForMass(S.m, r0, S.f, qc);
      return { V, U: (S.lambda * V) / 2, qc, w };
    }

    const computePeak = debounce(() => {
      const { V, U } = settings();
      const rng = new RNG(3);
      const ms = [], tr = [];
      const R = resolutionFor(S.lambda).R;
      const span = Math.min(3, Math.max(0.6, (S.m / R) * 2.5));
      for (let i = 0; i <= 40; i++) {
        const m = S.m - span + (2 * span * i) / 40;
        const p = aq(m, U, V, r0, S.f);
        let ok = 0;
        const n = 16;
        for (let j = 0; j < n; j++) {
          const t = trajectory(p.a, p.q, { x0: rng.normal(0, 0.08), y0: rng.normal(0, 0.08), phase: rng.uniform(0, Math.PI), cycles: S.cycles, stepsPerCycle: 24 });
          if (!t.hit) ok++;
        }
        ms.push(m); tr.push(ok / n);
      }
      peak.setSeries([{ name: 'transmission', color: PALETTE[0], x: ms, y: tr, width: 2, fill: true }]);
      peak.setMarks([{ x: S.m, color: '#94a3b8', label: `${S.m} u` }]);
    }, 120);

    function update() {
      const { V, U, w } = settings();
      const R = resolutionFor(S.lambda);
      ro.V.set(`${V.toFixed(0)} V`);
      ro.U.set(`${U.toFixed(1)} V`);
      const p = aq(S.m, U, V, r0, S.f);
      ro.aq.set(`(${p.q.toFixed(3)}, ${p.a.toFixed(4)})`);
      ro.R.set(isFinite(R.R) ? R.R.toFixed(0) : '—', R.R > 300 ? 'warn' : '');
      ro.win.set(w ? `q ∈ [${w.q1.toFixed(3)}, ${w.q2.toFixed(3)}] → Δm ≈ ${(S.m / R.R).toFixed(2)} u at m = ${S.m}` : 'scan line misses the stability region — nothing transmitted', w ? '' : 'bad');
      const qs = [0, 0.92];
      const pts = S.deltas.map((dm) => aq(S.m + dm, U, V, r0, S.f));
      stab.setSeries([
        { name: 'stable (x and y)', color: PALETTE[0], x: REGION.q, y: REGION.upper, width: 2, fill: true },
        { name: 'scan line a/q = 2U/V', color: '#94a3b8', x: qs, y: qs.map((q) => S.lambda * q), dash: [5, 4] },
        ...pts.map((pp, i) => ({ name: `m = ${S.m + S.deltas[i]}${stable2D(pp.a, pp.q) ? ' (stable)' : ''}`, color: ['#ff6f91', '#4fd6a1', '#5ab0ff'][i], x: [pp.q], y: [pp.a], type: 'scatter', r: 4 })),
      ]);
      drawTrajectories();
      computePeak();
    }
    update();

    let t = 0;
    return {
      root, exploder: ex, panel, scale: 0.25,
      camera: { position: [0.12, 0.075, 0.21], target: [0, 0, -0.01] },
      update(dt) {
        t += dt;
        for (const a of anim) {
          const u = ((t * 0.25 + a.t) % 1);
          const i = Math.min(a.pts.length - 1, Math.floor(u * a.pts.length));
          a.dot.position.copy(a.pts[i]);
        }
      },
      dispose() { stab.dispose(); peak.dispose(); },
    };
  },
};
