// Single-quad (iCAP RQ-type) and triple-quad (iCAP TQ-type) ICP-MS, schematic but to scale.
//
// Ion path: ICP torch (+X) → sampler/skimmer interface → extraction lens → 90° deflection
// lens (Thermo "RAPID": Right-Angle Positive Ion Deflection, removes neutrals/photons) → [Q1
// mass filter, TQ only] → QCell (flatapole collision/reaction cell) → Q3 analyser →
// discrete-dynode SEM. After the 90° lens the ions travel along −Z.
// Dimensions are representative; Thermo does not publish rod radii or lengths.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, roundedBox, tubeShell, rod, cfFlange, plateWithHole, wire } from '../core/geom.js';
import { buildTurboPump, buildScrollPump } from './vacuum.js';
import { buildSEM } from './sem.js';
import { part } from './parts.js';

const mm = 1e-3;
const H = 0.42; // beam height above the bench (m)

export const ICP_DIMS = { r0: 4.4 * mm, quadLen: 0.20, cellLen: 0.12, rfMHz: 2.5 };

/** Plasma teardrop (additive, emissive). */
function plasmaMesh() {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = 0.011 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - 0.35 * t);
    pts.push(new THREE.Vector2(Math.max(0.0005, r), t * 0.055));
  }
  const g = new THREE.LatheGeometry(pts, 32);
  g.rotateZ(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const m = new THREE.Mesh(g, mat);
  const g2 = g.clone(); g2.scale(1.35, 1.6, 1.6);
  const halo = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color: 0xb06cff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const grp = new THREE.Group();
  grp.add(m, halo);
  return grp;
}

function cone(baseR, tipR, height, orificeR, mat, tipMat) {
  const grp = new THREE.Group();
  const pts = [
    new THREE.Vector2(orificeR, height), new THREE.Vector2(tipR, height), new THREE.Vector2(baseR, 0),
    new THREE.Vector2(baseR + 3 * mm, 0), new THREE.Vector2(baseR + 3 * mm, -2.5 * mm), new THREE.Vector2(baseR - 1 * mm, -2.5 * mm),
    new THREE.Vector2(baseR - 1.5 * mm, -0.5 * mm), new THREE.Vector2(tipR - 0.6 * mm, height - 0.8 * mm), new THREE.Vector2(orificeR, height - 0.8 * mm),
  ];
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateZ(Math.PI / 2); // axis along −X: the cone tip points back towards the plasma
  grp.add(mesh(g, mat, { name: 'cone' }));
  if (tipMat) {
    const tg = new THREE.CylinderGeometry(tipR * 1.2, tipR * 2.2, 3 * mm, 32, 1, true);
    tg.rotateZ(Math.PI / 2);
    const tip = mesh(tg, tipMat, { name: 'cone tip insert' });
    tip.position.x = -(height - 1.5 * mm);
    grp.add(tip);
  }
  return grp;
}

/** Four rods along local +Z centred on the axis. kind 'round' | 'flat' */
function rodSet(len, r0, kind = 'round', mat = M.steelPolished()) {
  const grp = new THREE.Group();
  const rr = 1.148 * r0; // rod radius for best hyperbolic approximation (r/r0 ≈ 1.148)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    let m;
    if (kind === 'flat') {
      m = mesh(new THREE.BoxGeometry(1.1 * r0, 1.0 * mm, len), mat, { name: 'flatapole rod' });
      m.rotation.z = a + Math.PI / 2;
      m.position.set(Math.cos(a) * (r0 + 0.4 * mm), Math.sin(a) * (r0 + 0.4 * mm), 0);
    } else {
      const g = new THREE.CylinderGeometry(rr, rr, len, 28);
      g.rotateX(Math.PI / 2);
      m = mesh(g, mat, { name: 'quadrupole rod' });
      m.position.set(Math.cos(a) * (r0 + rr), Math.sin(a) * (r0 + rr), 0);
    }
    grp.add(m);
  }
  // ceramic holders
  for (const z of [-len / 2 + 0.01, len / 2 - 0.01]) {
    const ring = mesh(plateWithHole(5.2 * r0 + 2 * rr, 5.2 * r0 + 2 * rr, 6 * mm, r0 * 1.15, { round: true }), M.alumina(), { name: 'ceramic rod holder' });
    ring.position.z = z;
    grp.add(ring);
  }
  return grp;
}

/**
 * @param {{variant:'RQ'|'TQ'}} o
 * @returns {{group, parts, path:THREE.Vector3[], keyPoints:object, features:object, turbo}}
 */
export function buildICPMS({ variant = 'RQ', cabinet = true } = {}) {
  const TQ = variant === 'TQ';
  const group = new THREE.Group();
  group.name = `iCAP ${variant}-type ICP-MS`;
  const parts = [];
  const features = {};
  const { r0, quadLen, cellLen } = ICP_DIMS;

  // ---- torch box: quartz torch + RF load coil + plasma ----
  const torch = new THREE.Group();
  const tubes = [[9.0, 8.0, 0.11], [6.5, 5.6, 0.095], [1.2, 0.6, 0.09]];
  tubes.forEach(([ro, ri, L], i) => {
    const g = tubeShell(ro * mm, ri * mm, L, 36);
    g.rotateZ(-Math.PI / 2);
    const m = mesh(g, i === 2 ? M.alumina() : M.quartz(), { name: ['outer quartz tube', 'auxiliary tube', 'injector'][i] });
    m.position.x = -L / 2;
    torch.add(m);
  });
  const coilPts = [];
  for (let i = 0; i <= 3 * 48; i++) {
    const t = i / 48;
    coilPts.push(new THREE.Vector3(-0.022 + t * 0.006, Math.cos(t * Math.PI * 2) * 0.0135, Math.sin(t * Math.PI * 2) * 0.0135));
  }
  const coil = wire(coilPts, 1.6 * mm, M.copper(), { seg: 300 });
  coil.name = 'RF load coil';
  torch.add(coil);
  const plasma = plasmaMesh();
  plasma.position.x = -0.03;
  torch.add(plasma);
  torch.position.set(-0.3, H, 0);
  group.add(torch);
  parts.push(part(torch, [-0.18, 0, 0.1], 'ICP torch, RF coil & plasma',
    'Three concentric quartz tubes: outer (cooling) Ar, auxiliary Ar and the central injector carrying the sample aerosol (for LA: He carrier + Ar make-up). The copper load coil couples RF power (≈1.2–1.6 kW) into a ≈6000–10 000 K argon plasma that atomises and ionises the aerosol (most elements > 90 % ionised).', { order: 0.3 }));
  features.torch = torch;
  features.plasma = plasma;

  // torch box (shell)
  const tbox = mesh(roundedBox(0.2, 0.2, 0.18, 0.01), M.panel(0xdfe3e8), { name: 'torch box' });
  tbox.position.set(-0.36, H, 0);
  group.add(tbox);
  parts.push(part(tbox, [-0.05, 0.3, 0], 'Torch box (RF shield)', 'Shielded compartment around the plasma; the torch is demountable and self-aligning on the iCAP platform (Thermo).', { order: 0, shell: true }));

  // ---- interface: sampler, skimmer ----
  const iface = new THREE.Group();
  const sampler = cone(22 * mm, 2.2 * mm, 18 * mm, 0.55 * mm, M.steelPolished(), M.platinum());
  sampler.position.x = -0.258;
  const skimmer = cone(13 * mm, 1.4 * mm, 16 * mm, 0.4 * mm, M.steelPolished(), M.platinum());
  skimmer.position.x = -0.249;
  const plate = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 48), M.aluminium(), { name: 'water-cooled interface plate' });
  plate.rotation.z = Math.PI / 2;
  plate.position.x = -0.265;
  iface.add(plate, sampler, skimmer);
  iface.position.y = H;
  group.add(iface);
  parts.push(part(sampler, [-0.06, 0, 0], 'Sampler cone (Ni, Pt tip optional)', 'First orifice (~1 mm) between the atmospheric-pressure plasma and the expansion chamber (~1–3 mbar). The gas expands supersonically; ions keep the plasma velocity and gain a mass-dependent kinetic energy.', { order: 0.5 }));
  parts.push(part(skimmer, [-0.03, 0, 0], 'Skimmer cone', 'Second orifice (~0.5 mm) samples the core of the supersonic jet into the high-vacuum ion-optics chamber. iCAP interfaces offer high-sensitivity and high-matrix inserts (Thermo).', { order: 0.55 }));
  parts.push(part(plate, [-0.12, 0, 0], 'Interface plate', 'Water-cooled; on the iCAP platform the cones are front-accessible and released with a magnetic tool (Thermo).', { order: 0.4 }));
  features.interface = iface;

  // ---- extraction lens + 90° deflection (RAPID) ----
  const optics = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = mesh(plateWithHole(0.04, 0.04, 1.2 * mm, 2.5 * mm + i * 0.5 * mm, { round: true }), M.steel(), { name: 'extraction lens element' });
    p.rotation.y = Math.PI / 2;
    p.position.set(-0.225 + i * 0.012, H, 0);
    optics.add(p);
  }
  // curved deflector electrodes: quarter arcs in the XZ plane around the bend centre
  const RB = 0.095;
  const bendC = new THREE.Vector3(-0.2, H, -RB);
  const arc = (R, dy) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const f = (i / 24) * (Math.PI / 2); pts.push(new THREE.Vector3(bendC.x + R * Math.sin(f), H + dy, bendC.z + R * Math.cos(f))); }
    return pts;
  };
  for (const [R, name] of [[RB - 0.016, 'inner deflector'], [RB + 0.016, 'outer deflector']]) {
    const e = wire(arc(R, 0), 2.6 * mm, M.steelPolished(), { seg: 60 });
    e.name = name;
    optics.add(e);
    for (const dy of [-10 * mm, 10 * mm]) { const sh = wire(arc(R, dy), 1.1 * mm, M.steel(), { seg: 60 }); sh.name = 'deflector shield'; optics.add(sh); }
  }
  const stop = mesh(new THREE.CylinderGeometry(9 * mm, 9 * mm, 4 * mm, 24), M.graphite(), { name: 'neutral beam stop' });
  stop.rotation.z = Math.PI / 2;
  stop.position.set(-0.07, H, 0);
  optics.add(stop);
  group.add(optics);
  parts.push(part(optics, [0, 0.16, 0.12], 'Extraction lens & 90° deflection lens ("RAPID")',
    'The negatively biased extraction lens pulls positive ions out of the skimmer jet. The right-angle deflector then bends ions by 90° while neutrals, photons and particles fly straight on into a beam stop — the main source of background reduction (Thermo: Right Angle Positive Ion Deflection).', { order: 0.6 }));
  features.rapid = optics;

  // ---- quadrupole chain along −Z from the bend exit ----
  const zStart = -0.105;
  let z = zStart;
  const chain = [];
  const addQuad = (name, info, len, kind, color) => {
    const q = rodSet(len, kind === 'flat' ? 3.2 * mm : r0, kind, kind === 'flat' ? M.gold() : M.steelPolished());
    q.position.set(-0.105, H, z - len / 2);
    const can = mesh(tubeShell(0.03, 0.028, len + 0.01, 40), M.steelBrushed(), { name: name + ' housing' });
    can.rotation.x = Math.PI / 2;
    can.position.copy(q.position);
    group.add(q, can);
    parts.push(part(can, [0, 0.11, 0], name + ' housing', 'Shield/vacuum liner (ghosted in X-ray mode).', { order: 0.15, shell: true }));
    parts.push(part(q, [0, 0.05 + chain.length * 0.02, 0], name, info, { order: 0.7 }));
    chain.push({ name, obj: q, z0: z, z1: z - len });
    z -= len + 0.025;
    return q;
  };
  if (TQ) {
    features.q1 = addQuad('Q1 mass filter', 'TQ only: a full quadrupole that admits only the chosen precursor m/z into the cell, so nothing else can react to form new interferences at the product mass. Resolution user-definable (Thermo).', quadLen * 0.85, 'round');
  }
  features.cell = addQuad('QCell (flatapole CRC)', 'Collision/reaction cell built from flat rods ("flatapole") with a low-mass cut-off. He + KED for polyatomic removal; H₂, O₂, NH₃ for reactive chemistry (four gas channels standard on iCAP TQ).', cellLen, 'flat');
  features.q3 = addQuad(TQ ? 'Q3 analyser' : 'Analysing quadrupole', `Mass analyser: DC + RF on four rods (assumed r₀ = ${(r0 * 1000).toFixed(1)} mm, f ≈ ${ICP_DIMS.rfMHz} MHz) transmits a ~0.7 u window that is stepped (peak-hopped) across the masses of interest.`, quadLen, 'round');

  // detector
  const sem = buildSEM({ detail: 'lite' });
  sem.group.position.set(-0.105, H, z - 0.01);
  sem.group.rotation.y = Math.PI; // ions travel −Z
  group.add(sem.group);
  parts.push(part(sem.group, [0, 0.1, -0.12], 'Discrete-dynode SEM (dual mode)', 'Off-axis conversion + discrete dynodes; operated in pulse-counting mode for low signals and analogue mode for high signals, cross-calibrated to give ~10 orders of linear range. iCAP TQ minimum dwell 100 µs (Thermo).', { order: 0.8 }));
  features.detector = sem.group;
  const zDet = z - 0.03;

  // ---- vacuum manifold + pumps + cabinet ----
  const manLen = -(zDet - 0.06);
  const manifold = mesh(roundedBox(0.16, 0.14, manLen + 0.05, 0.01), M.aluminium(), { name: 'vacuum manifold' });
  manifold.position.set(-0.11, H, -manLen / 2 + 0.03);
  group.add(manifold);
  parts.push(part(manifold, [0.35, 0.05, 0], 'Vacuum manifold', 'Differentially pumped: expansion stage (~mbar, rotary/roots pump) → ion optics (~10⁻³–10⁻⁴ mbar) → analyser (~10⁻⁶–10⁻⁷ mbar), using a split-flow turbomolecular pump (Thermo).', { order: 0.05, shell: true }));
  const turbo = buildTurboPump({ speed: 250 });
  turbo.group.position.set(-0.11, H - 0.07, -0.2);
  group.add(turbo.group);
  parts.push(part(turbo.group, [0, -0.2, 0], 'Split-flow turbomolecular pump', 'One turbo with an inter-stage port pumps both the ion-optics region and the analyser (Thermo spec: split-flow turbo backed by an external rotary or roots pump).', { order: 0.2 }));
  const fore = buildScrollPump();
  fore.group.position.set(0.15, 0.08, -0.15);
  group.add(fore.group);
  parts.push(part(fore.group, [0.3, 0, 0], 'Fore-vacuum pump', 'External rotary (or oil-free) pump evacuating the expansion chamber and backing the turbo.', { order: 0.1 }));

  if (cabinet) {
    const cab = new THREE.Group();
    const W = 0.95, D = 0.62, Hc = 0.62;
    const body = mesh(roundedBox(W, Hc, D, 0.02), M.panel(0xeef0f3), { name: 'cabinet' });
    body.position.set(-0.12, Hc / 2 - 0.02, -0.22);
    const stripe = mesh(new THREE.BoxGeometry(W + 0.002, 0.03, D + 0.002), M.panel(0x4b5563), { name: 'trim' });
    stripe.position.set(-0.12, Hc - 0.09, -0.22);
    cab.add(body, stripe);
    group.add(cab);
    parts.push(part(cab, [0, 0, 0.9], 'Instrument cabinet', 'Bench-top housing: RF generator, gas mass-flow controllers (plasma, auxiliary, nebuliser and up to four cell gases), vacuum and detector electronics.', { order: 0, shell: true }));
  }

  // ---- ion path ----
  const path = [new THREE.Vector3(-0.31, H, 0), new THREE.Vector3(-0.24, H, 0), new THREE.Vector3(-0.2, H, 0)];
  for (let i = 1; i <= 20; i++) {
    const f = (i / 20) * (Math.PI / 2);
    path.push(new THREE.Vector3(bendC.x + RB * Math.sin(f), H, bendC.z + RB * Math.cos(f)));
  }
  path.push(new THREE.Vector3(-0.105, H, zDet + 0.02));
  const keyPoints = { cellIn: features.cell ? chain.find((c) => c.name.startsWith('QCell')).z0 : 0, cellOut: chain.find((c) => c.name.startsWith('QCell')).z1, zDet, x: -0.105, H };
  return { group, parts, path, keyPoints, features, turbo, chain, H };
}
