// Pulsed laser beam visual (additive tube along a polyline). Toggled with the global
// "Beams" switch (userData.beam) and pulsed in update() at a visual repetition rate.
import * as THREE from 'three';
import { PolylineCurve } from './beam.js';

export class LaserBeam extends THREE.Group {
  constructor(points, { color = 0x9b5cff, radius = 0.0025, rep = 5, opacity = 0.75 } = {}) {
    super();
    this.userData.beam = true;
    this.curve = new PolylineCurve(points);
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const segs = Math.max(16, points.length * 12);
    this.add(new THREE.Mesh(new THREE.TubeGeometry(this.curve, segs, radius, 10, false), this.mat));
    this.add(new THREE.Mesh(new THREE.TubeGeometry(this.curve, segs, radius * 0.35, 6, false), this.coreMat));
    this.children.forEach((c) => (c.renderOrder = 10));
    this.rep = rep;
    this.base = opacity;
    this.t = 0;
    this.onPulse = null;
  }
  setColor(c) { this.mat.color.set(c); }
  update(dt) {
    if (!this.rep) { this.mat.opacity = this.base; return; }
    const period = 1 / Math.min(this.rep, 8); // visual pulse rate capped for readability
    const prev = this.t % period;
    this.t += dt;
    const ph = this.t % period;
    if (ph < prev && this.onPulse) this.onPulse();
    const flash = Math.exp(-ph / 0.04);
    this.mat.opacity = 0.12 + this.base * flash;
    this.coreMat.opacity = 0.05 + 0.6 * flash;
  }
}

/** nm → approximate display colour (UV shown as violet; IR as deep red). */
export function wavelengthColor(nm) {
  if (nm < 380) return 0x9b5cff;
  if (nm < 440) return 0x7a3cff;
  if (nm < 490) return 0x3c7dff;
  if (nm < 560) return 0x2fe06a;
  if (nm < 590) return 0xf6e04b;
  if (nm < 640) return 0xff8a2a;
  if (nm < 750) return 0xff3b30;
  return 0xb0183a;
}
