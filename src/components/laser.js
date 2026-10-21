// Laser-ablation systems: 193 nm ArF excimer and femtosecond (Yb-based + harmonics)
// workstations with beam delivery, two-volume ablation cell, stage and gas handling.
// Geometry is schematic and to plausible scale; vendor-specific layouts differ.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, roundedBox, rod, wire, tubeShell, plateWithHole, cfFlange } from '../core/geom.js';
import { part } from './parts.js';

const mm = 1e-3;

export const LA_VENDORS = {
  analyte: {
    id: 'analyte', name: 'Teledyne Photon Machines Analyte Excite/G2', cell: 'HelEx II two-volume cell', laser: 'ATLEX 300si ArF excimer',
    nm: 193, pulse: '< 4 ns', rep: '1–300 Hz', spot: '2–160 µm (30 apertures)', fluenceMax: null, washout: '< 2 s (facility spec)',
    cupVol: 1.0, Q: 0.8, verified: ['nm', 'pulse', 'rep', 'spot', 'washout'], src: 'tcd',
  },
  nwr193: {
    id: 'nwr193', name: 'Elemental Scientific Lasers NWR193', cell: 'TwoVol two-volume cell', laser: 'ArF excimer',
    nm: 193, pulse: '< 5 ns (assumed)', rep: '1–200 Hz (opt. 500/1000 Hz)', spot: '1–150 µm (IVA; opt. 250 µm)', fluenceMax: 15, washout: 'not stated',
    cupVol: 1.2, Q: 0.8, verified: ['nm', 'rep', 'spot', 'fluenceMax'], src: 'montana',
  },
  resolution: {
    id: 'resolution', name: 'Applied Spectra RESOlution SE', cell: 'S155 two-volume cell (Laurin Technic)', laser: 'ArF excimer',
    nm: 193, pulse: '5 ns', rep: 'up to 300 Hz', spot: 'up to 100 µm (facility config.)', fluenceMax: 20, washout: 'not stated',
    cupVol: 1.5, Q: 0.7, verified: ['nm', 'pulse', 'rep', 'spot', 'fluenceMax'], src: 'tubingen',
  },
  nwrfemto: {
    id: 'nwrfemto', name: 'Elemental Scientific Lasers NWRFemto', cell: 'TwoVol ablation chamber (100 × 100 mm); optional TrueLine cell', laser: 'Light Conversion PHAROS (Yb, 1030 nm) + harmonics',
    nm: 257, pulse: '100–500 fs (PHAROS range)', rep: '1–1000 Hz', spot: '1–65 µm (older 266 nm config.)', fluenceMax: 7, washout: 'not stated',
    cupVol: 1.2, Q: 0.8, verified: ['rep', 'pulse', 'fluenceMax'], src: 'nwrfemto',
  },
  j200fs: {
    id: 'j200fs', name: 'Applied Spectra J200 Tandem (femtosecond LA-LIBS)', cell: 'two-volume cell (assumed)', laser: 'femtosecond source (model not stated)',
    nm: 343, pulse: '~fs (assumed)', rep: 'not stated', spot: 'not stated', fluenceMax: null, washout: 'not stated',
    cupVol: 1.5, Q: 0.7, verified: [], src: 'portsmouth',
  },
};

/** Two-volume ablation cell. Returns group, parts and the ablation point (local). */
export function buildAblationCell(kind = 'analyte') {
  const g = new THREE.Group();
  g.name = 'ablation cell';
  const parts = [];
  const W = kind === 'resolution' ? 0.16 : 0.13, D = kind === 'resolution' ? 0.11 : 0.12, Hh = 0.035;
  // outer cell body (open top frame + window)
  const body = new THREE.Group();
  const floor = mesh(roundedBox(W, 0.008, D, 0.004), M.aluminium(), { name: 'cell base' });
  body.add(floor);
  for (const [w, d, x, z] of [[W, 0.006, 0, D / 2 - 0.003], [W, 0.006, 0, -D / 2 + 0.003], [0.006, D, W / 2 - 0.003, 0], [0.006, D, -W / 2 + 0.003, 0]]) {
    const wall = mesh(new THREE.BoxGeometry(w, Hh, d), M.aluminium(), { name: 'cell wall' });
    wall.position.set(x, Hh / 2, z);
    body.add(wall);
  }
  g.add(body);
  parts.push(part(body, [0, -0.04, 0], 'Outer (large-volume) cell', 'Holds several sample mounts and reference materials; flushed with He. In two-volume designs most of this volume is NOT on the aerosol path, so washout stays fast regardless of cell size.', { order: 0.3, shell: true }));
  const win = mesh(new THREE.BoxGeometry(W - 0.01, 0.004, D - 0.01), M.quartz(), { name: 'UV window' });
  win.position.y = Hh + 0.002;
  g.add(win);
  parts.push(part(win, [0, 0.09, 0], 'Fused-silica window', 'UV-transparent window (193 nm needs high-purity fused silica or CaF₂); the laser and camera look through it.', { order: 0.05, shell: true }));
  // sample mount (epoxy puck with grains) + standards
  const puck = mesh(new THREE.CylinderGeometry(0.0127, 0.0127, 0.008, 40), new THREE.MeshPhysicalMaterial({ color: 0x2d2a26, roughness: 0.35, clearcoat: 0.8, name: 'epoxy mount' }), { name: 'epoxy mount' });
  puck.position.set(0, 0.008, 0);
  g.add(puck);
  const grains = new THREE.Group();
  const zirc = new THREE.MeshPhysicalMaterial({ color: 0xd59a5c, roughness: 0.25, transmission: 0.3, thickness: 0.0005, name: 'zircon' });
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39, r = 0.002 + 0.0085 * Math.sqrt(i / 18);
    const z = mesh(new THREE.BoxGeometry(0.0006, 0.0002, 0.0015), zirc, { name: 'zircon grain' });
    z.position.set(Math.cos(a) * r, 0.0121, Math.sin(a) * r);
    z.rotation.y = a * 1.7;
    grains.add(z);
  }
  g.add(grains);
  const stds = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 24), i === 0 ? M.glass() : M.panel(0x3a3632), { name: 'reference material' });
    s.position.set(-0.045 + i * 0.016, 0.006, 0.035);
    stds.add(s);
  }
  g.add(stds);
  parts.push(part(puck, [0, 0.0, 0], 'Sample mount (25 mm epoxy round)', 'Polished grain mount; here zircons. Unknowns and reference materials (e.g. NIST SRM 610 glass, 91500 or Plešovice zircon) share the cell so they are ablated under identical conditions.', { order: 0.6 }));
  parts.push(part(stds, [0, 0.0, 0.02], 'Reference materials', 'Glass and zircon standards for calibration and standard–sample bracketing.', { order: 0.6 }));
  // inner cup / funnel (the small second volume) right above the ablation site
  const cup = new THREE.Group();
  const funnel = mesh(new THREE.CylinderGeometry(0.004, 0.011, 0.012, 32, 1, true), M.steelPolished(), { name: 'inner cup / funnel' });
  funnel.position.y = 0.0185;
  cup.add(funnel);
  const outTube = wire([new THREE.Vector3(0, 0.025, 0), new THREE.Vector3(0.02, 0.03, 0), new THREE.Vector3(0.05, 0.03, 0), new THREE.Vector3(W / 2 + 0.03, 0.03, 0)], 1.6 * mm, M.peek());
  outTube.name = 'aerosol outlet';
  cup.add(outTube);
  const arm = rod(new THREE.Vector3(-0.012, 0.03, 0), new THREE.Vector3(-W / 2 + 0.01, 0.03, 0), 1.5 * mm, M.steel());
  cup.add(arm);
  g.add(cup);
  const cupInfo = {
    analyte: 'HelEx II: a small "cup" volume sits over the ablation site; He sweeps the aerosol out through a short path while the large cell only holds samples.',
    nwr193: 'TwoVol: an inner sampling volume above the spot inside a larger cell; fast, position-independent washout.',
    resolution: 'S155 (Laurin Technic): a fixed funnel/cup with the sample moving underneath, giving constant aerosol geometry and very fast washout.',
    nwrfemto: 'TwoVol chamber with an inner sampling volume over the spot.',
    j200fs: 'Two-volume cell (assumed).',
  }[kind] || '';
  parts.push(part(cup, [0, 0.05, 0], 'Inner sampling volume (two-volume cell)', cupInfo + ' Washout time constant τ = V_cup / Q_He.', { order: 0.4 }));
  return { group: g, parts, ablationPoint: new THREE.Vector3(0, 0.0122, 0), outlet: new THREE.Vector3(W / 2 + 0.03, 0.03, 0), width: W };
}

/**
 * Full workstation.
 * @param {{type:'excimer'|'fs', vendor:string}} o
 * @returns {{group, parts, beamPath:THREE.Vector3[], ablation:THREE.Vector3, transferOut:THREE.Vector3, features, cell}}
 */
export function buildLA({ type = 'excimer', vendor = 'analyte' } = {}) {
  const fs = type === 'fs';
  const V = LA_VENDORS[vendor];
  const group = new THREE.Group();
  group.name = fs ? 'femtosecond LA system' : '193 nm excimer LA system';
  const parts = [];
  const features = {};
  const Hb = 0.33; // beam height

  // base plate
  const base = mesh(roundedBox(1.25, 0.03, 0.55, 0.01), M.panel(0x3a414c), { name: 'optical base plate' });
  base.position.set(0.05, 0.015, 0);
  group.add(base);

  // laser head
  const head = new THREE.Group();
  if (fs) {
    const osc = mesh(roundedBox(0.42, 0.16, 0.3, 0.01), M.panel(0xe6e9ee), { name: 'fs oscillator + regenerative amplifier' });
    osc.position.set(-0.36, Hb - 0.01, 0);
    const hg = mesh(roundedBox(0.16, 0.12, 0.16, 0.008), M.panel(0x2f3742), { name: 'harmonic generator' });
    hg.position.set(-0.07, Hb, 0);
    const xtal = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const c = mesh(new THREE.BoxGeometry(0.008, 0.008, 0.008), new THREE.MeshPhysicalMaterial({ color: [0x9fffb0, 0x9fd0ff, 0xd0a0ff][i], transmission: 0.6, roughness: 0.1, thickness: 0.004 }), { name: 'nonlinear crystal' });
      c.position.set(-0.11 + i * 0.035, Hb, 0);
      xtal.add(c);
    }
    head.add(osc, hg, xtal);
    parts.push(part(osc, [-0.25, 0.1, 0], 'Femtosecond Yb laser (oscillator + amplifier)', 'Yb-doped solid-state laser (PHAROS-type) at 1030 nm, chirped-pulse amplified to ~100–500 fs pulses (Light Conversion). Pulse energy is deposited faster than electrons can pass heat to the lattice (~ps), so ablation is far less thermal than with ns pulses.', { order: 0.2 }));
    parts.push(part(hg, [0, 0.16, 0], 'Harmonic generator (shell)', 'Lid of the harmonic module.', { order: 0.05, shell: true }));
    parts.push(part(xtal, [0, 0.08, 0.06], 'Nonlinear crystals (SHG/THG/FHG)', 'Frequency doubling/mixing crystals convert 1030 nm to 515, 343, 257 or 206 nm (PHAROS harmonic generators). Shorter wavelengths couple better into transparent minerals.', { order: 0.5 }));
  } else {
    const box = mesh(roundedBox(0.6, 0.24, 0.32, 0.012), M.panel(0xe6e9ee), { name: 'excimer laser head' });
    box.position.set(-0.32, Hb - 0.02, 0);
    const tube = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 32), M.steelBrushed(), { name: 'discharge tube' });
    tube.rotation.z = Math.PI / 2;
    tube.position.set(-0.32, Hb, 0);
    const bottle = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 24), M.panel(0x6b8e23), { name: 'premix gas bottle' });
    bottle.position.set(-0.55, 0.24, -0.22);
    head.add(box, tube, bottle);
    parts.push(part(box, [0, 0.28, 0], 'Excimer laser housing', 'ArF excimer: electric discharge in Ar/F₂/Ne premix forms ArF* excimers that emit 193 nm (6.4 eV) photons in ns pulses.', { order: 0.05, shell: true }));
    parts.push(part(tube, [0, 0.1, 0], 'Discharge tube / resonator', `ArF gain medium; pulse length ${V.pulse} (${V.name}).`, { order: 0.4 }));
    parts.push(part(bottle, [-0.1, 0, -0.1], 'ArF premix gas', 'Halogen premix (F₂ in Ar/Ne) — gas fills age and must be refreshed; F₂ handling needs a gas cabinet and scrubber.', { order: 0.2 }));
  }
  group.add(head);
  features.laser = head;

  // beam path optics
  const opt = new THREE.Group();
  const xA = 0.03, xH = 0.12, xAp = 0.24, xM2 = 0.36;
  const att = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 24), M.black(), { name: 'attenuator' });
  att.rotation.z = Math.PI / 2; att.position.set(xA, Hb, 0);
  const hom = new THREE.Group();
  for (const dx of [-0.012, 0.012]) {
    const arr = mesh(new THREE.BoxGeometry(0.006, 0.03, 0.03), M.quartz(), { name: 'micro-lens array' });
    arr.position.set(xH + dx, Hb, 0);
    hom.add(arr);
  }
  const ap = mesh(plateWithHole(0.05, 0.05, 0.003, 0.0035, { round: true }), M.steel(), { name: 'aperture' });
  ap.rotation.y = Math.PI / 2; ap.position.set(xAp, Hb, 0);
  const wheel = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 40), M.aluminium(), { name: 'aperture wheel' });
  wheel.rotation.z = Math.PI / 2; wheel.position.set(xAp + 0.006, Hb - 0.035, 0);
  const m2 = mesh(new THREE.BoxGeometry(0.004, 0.04, 0.04), M.aluminiumMirror(), { name: 'turning mirror (dichroic)' });
  m2.position.set(xM2, Hb, 0); m2.rotation.z = -Math.PI / 4;
  const objective = mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.07, 32), M.black(), { name: 'objective' });
  objective.position.set(xM2, 0.17, 0);
  const cam = mesh(roundedBox(0.04, 0.05, 0.04, 0.004), M.black(), { name: 'CCD camera' });
  cam.position.set(xM2, Hb + 0.07, 0);
  opt.add(att, hom, ap, wheel, m2, objective, cam);
  group.add(opt);
  parts.push(part(att, [0, 0.08, 0.08], 'Attenuator', 'Variable transmission sets the pulse energy and therefore the fluence on the sample.', { order: 0.55 }));
  parts.push(part(hom, [0, 0.1, 0.1], 'Beam homogeniser', 'Micro-lens arrays turn the uneven raw beam into a flat-top profile so the crater bottom is flat and the ablation rate uniform across the spot.', { order: 0.6 }));
  parts.push(part(ap, [0, 0.1, 0.14], 'Aperture (imaged onto the sample)', `The aperture is demagnified onto the sample by the objective (spot ${V.spot}).`, { order: 0.62 }));
  parts.push(part(wheel, [0, 0.05, 0.14], fs ? 'Aperture / spot selector' : 'Aperture wheel / IVA', 'Selects round or square spot sizes; ESL systems use an infinitely variable aperture (IVA).', { order: 0.62 }));
  parts.push(part(m2, [0, 0.14, 0], 'Dichroic turning mirror', 'Reflects the UV laser down into the objective but passes visible light to the camera above.', { order: 0.65 }));
  parts.push(part(objective, [0, 0.07, 0.12], 'Focusing objective', 'Images the aperture onto the sample with UV-grade optics; long working distance clears the cell window.', { order: 0.68 }));
  parts.push(part(cam, [0, 0.12, 0], 'Viewing camera', 'Coaxial reflected/transmitted-light imaging for spot placement.', { order: 0.7 }));
  features.optics = opt;

  // cell + stage
  const cellObj = buildAblationCell(vendor);
  const stage = new THREE.Group();
  const s1 = mesh(roundedBox(0.2, 0.02, 0.18, 0.004), M.black(), { name: 'Y stage' });
  s1.position.set(xM2, 0.045, 0);
  const s2 = mesh(roundedBox(0.18, 0.02, 0.2, 0.004), M.aluminium(), { name: 'X stage' });
  s2.position.set(xM2, 0.065, 0);
  stage.add(s1, s2);
  group.add(stage);
  parts.push(part(stage, [0, -0.06, 0], 'XYZ stage', 'Moves the cell under the fixed beam with ~µm repeatability; raster/line scans for imaging.', { order: 0.2 }));
  cellObj.group.position.set(xM2, 0.077, 0);
  group.add(cellObj.group);
  for (const p of cellObj.parts) parts.push(p);
  const ablation = cellObj.ablationPoint.clone().add(cellObj.group.position);
  features.cell = cellObj.group;

  // gas handling: He in, aerosol out, Ar make-up, transfer tube
  const gas = new THREE.Group();
  const outW = cellObj.outlet.clone().add(cellObj.group.position);
  const heIn = wire([new THREE.Vector3(xM2 - 0.2, 0.1, 0.12), new THREE.Vector3(xM2 - 0.1, 0.1, 0.05), new THREE.Vector3(xM2 - 0.07, 0.1, 0.0)], 1.5 * mm, M.peek());
  const yPos = new THREE.Vector3(outW.x + 0.08, outW.y, 0);
  const tee = mesh(new THREE.SphereGeometry(5 * mm, 16, 12), M.steelPolished(), { name: 'Y-piece' });
  tee.position.copy(yPos);
  const arIn = wire([new THREE.Vector3(yPos.x, yPos.y, 0.18), new THREE.Vector3(yPos.x, yPos.y, 0.06), yPos.clone()], 1.5 * mm, M.peek());
  const out = wire([outW, yPos], 1.6 * mm, M.peek());
  const transferOut = new THREE.Vector3(0.72, 0.11, 0);
  const transfer = wire([yPos, new THREE.Vector3(yPos.x + 0.08, 0.1, 0), transferOut], 2.0 * mm, new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, roughness: 0.3, transmission: 0.4, thickness: 0.002, name: 'PTFE/Tygon transfer tube' }));
  gas.add(heIn, tee, arIn, out, transfer);
  if (!fs) {
    const squid = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 24), M.peek(), { name: 'signal smoothing device' });
    squid.rotation.z = Math.PI / 2;
    squid.position.set(0.62, 0.1, 0);
    gas.add(squid);
  }
  group.add(gas);
  parts.push(part(gas, [0.05, 0, 0.12], 'Gas handling', 'He carrier sweeps the aerosol out of the cell (He gives smaller particles and better transport than Ar); Ar make-up is added at a Y-piece before the ICP; an optional smoothing device trades washout speed for a steadier signal at low repetition rates.', { order: 0.75 }));
  features.gas = gas;

  // enclosure
  const encl = mesh(roundedBox(1.25, 0.5, 0.55, 0.015), M.panel(0xf1f2f4), { name: 'enclosure' });
  encl.position.set(0.05, 0.27, 0);
  group.add(encl);
  parts.push(part(encl, [0, 0.55, 0], 'Laser-safety enclosure', 'Class-1 interlocked housing; UV radiation at 193 nm is invisible and hazardous to eyes and skin.', { order: 0, shell: true }));

  const beamPath = [
    new THREE.Vector3(fs ? -0.15 : -0.02, Hb, 0), new THREE.Vector3(xM2, Hb, 0),
    new THREE.Vector3(xM2, 0.17, 0), ablation.clone(),
  ];
  return { group, parts, beamPath, ablation, transferOut, features, cell: cellObj, vendor: V, Hb };
}
