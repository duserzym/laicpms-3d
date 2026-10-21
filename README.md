# LA-ICP-MS 3D

Interactive, explodable three.js models of **Thermo Scientific iCAP RQ (single quad) and iCAP TQ (triple quad) ICP-MS** coupled to **193 nm ArF excimer** and **femtosecond** laser-ablation systems. Small physics modules compute the quadrupole stability, the collision-cell energy filtering, ablation, washout and U–Pb data reduction, so these are not drawn by hand.

> **Status:** private repository for review. The GitHub Pages workflow is **manual only** (`workflow_dispatch`), because a Pages site is public even when the repo is private.

| Scene | What it shows |
|---|---|
| **iCAP RQ vs TQ ICP-MS** | Torch and RF coil, plasma, sampler and skimmer cones, extraction lens, 90° deflection lens (RAPID), Q1 on the TQ only, QCell flatapole cell, Q3 and a dual-mode SEM, with pumps and cabinet. Mode-dependent ion paths: SQ-STD, SQ-KED, and the TQ mass-shift modes (As→AsO⁺, Se→SeO⁺, Ti with NH₃, Sr→SrO⁺ with N₂O, P→PO⁺, S→SO⁺). |
| **Quadrupole physics** | Floquet-integrated Mathieu stability region (apex q ≈ 0.706, a ≈ 0.237), scan line 2U/V, resolution and transmitted window, Monte-Carlo peak shape, and 3-D ion trajectories (RK4) between the rods for stable and unstable masses. |
| **Collision / reaction cell** | Monte-Carlo kinetic-energy discrimination in He: elastic-collision energy loss, Poisson collision numbers from pressure and cross-section, exit-energy distributions vs the barrier, and transmission trade-off. Also a table of TQ reaction chemistry with provenance tags. |
| **193 nm excimer LA system** | ArF laser, attenuator, homogeniser, aperture imaging, dichroic mirror, objective, two-volume cell (HelEx II / TwoVol / S155 presets), stage, He + Ar gas handling and a smoothing device. Fluence, depth per pulse, crater growth (shown as a magnified cut-away), single-pulse response, pulse trains, washout and down-hole fractionation. |
| **Femtosecond LA vs 193 nm** | Yb 1030 nm laser and harmonic generator (515/343/257/206 nm). Photon energy and multiphoton order, heat-diffusion length (fs vs ns), particle-size distributions, ns melt-rim vs clean fs crater, and a comparison table. |
| **Coupled LA–ICP-MS & U–Pb** | Aerosol transport to the plasma, a time-resolved signal with sequential (peak-hopping) sampling and Poisson counts, gas blank, ablation and washout windows, down-hole drift, and ²⁰⁶Pb/²³⁸U standard–sample bracketing against 91500 or Plešovice. |

Global controls are the same as in [tims-3d](https://github.com/duserzym/tims-3d): Explode (<kbd>E</kbd>), X-ray (<kbd>X</kbd>), labels (<kbd>L</kbd>), beams (<kbd>B</kbd>), glow and PNG export. Click any part for a physics note. Deep links work, e.g. `#scene=icpms&variant=RQ`.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # physics unit tests (vitest)
npm run build        # static site in dist/
npm run screenshots  # headless smoke test + PNGs of every scene (Playwright)
```

## Layout

```
src/core/        shared app shell (identical to tims-3d) + laserbeam.js
src/physics/     quadrupole (Mathieu), cell (KED, TQ chemistry), ablation (fluence, crater, washout,
                 fs vs ns), signal (time-resolved LA signal, U–Pb bracketing), constants, rng
src/components/  icpms, laser (LA workstation + two-volume cell), vacuum, sem, parts
src/scenes/      one module per scene
tests/           vitest physics tests
```

## Scientific notes and honesty

- **Stated vs assumed.** Each scene marks values as *source* (stated in a cited document) or *assumed*. Thermo does not publish the quadrupole rod radius r₀, rod lengths or RF frequency. The values used (r₀ = 4.4 mm, 20 cm, 2.5 MHz) are typical, not vendor specs.
- **Quadrupole**: ideal hyperbolic field, solved with the Mathieu equation; no fringe fields, space charge or rod imperfections.
- **KED**: hard-sphere elastic collisions with isotropic centre-of-mass scattering. The cross-sections are illustrative relative values.
- **Ablation**: logarithmic ablation law with illustrative threshold and absorption constants per material; a two-tank-plus-plug-flow washout model; linear down-hole drift. Calibrate these against your own crater depths and washout curves.
- **fs vs ns**: heat diffusion length 2√(D·t). The particle-size distributions and fractionation index are illustrative shapes.
- **U–Pb**: no common-Pb correction and no ²⁰⁷Pb/²³⁵U or concordia treatment. The sensitivity is assumed.
- **Reaction chemistry**: As/Se with O₂ and Ti with NH₃ are stated in Thermo's iCAP TQ material. Sr→SrO⁺ with N₂O (Rb inert) is from Hogmalm et al. (2017). N₂O is not one of the four standard iCAP TQ cell gases. P→PO⁺ and S→SO⁺ are widely used but are flagged for checking.

## Licence, trademarks and attribution

- **Code**: MIT (see `LICENSE`).
- **Bundled dependency**: three.js (MIT). Its licence text ships with the site as `THIRD_PARTY_LICENSES.txt`.
- **Trademarks**: Thermo Scientific, iCAP, QCell, RAPID (Thermo Fisher Scientific); Analyte, HelEx (Teledyne Photon Machines); NWR193, NWRFemto, TwoVol, TrueLine (Elemental Scientific Lasers); RESOlution, J200 (Applied Spectra); S155 (Laurin Technic); PHAROS (Light Conversion); ATLEX (ATL Lasertechnik). These names belong to their owners and are used only to identify the systems modelled. No logos or vendor artwork are reproduced. This project is independent and not affiliated with or endorsed by any of these companies.
- **Sources** are cited in the app and restated in our own words; no text, figures or images are copied.

## Sources

- Thermo Fisher: [iCAP TQ introduction & applications (Lofthouse, 2017)](https://www.pragolab.cz/files/download/TSDD_2017/04_iCAP%20TQ%20introduction%20and%20applications%20Simon%20Lofthouse.pdf); [iCAP TQ specification summary](https://labrulez.com/en-us/all/paper/27438); [iCAP TQ page](https://www.thermofisher.com/icaptq); [iCAP RQ page](https://thermofisher.cn/order/catalog/product/cn/en/BRE731416); [iCAP TQe brochure](https://assets.thermofisher.com/TFS-Assets/CMD/brochures/br-74040-icap-tqe-icp-ms-br74040-en.pdf)
- 193 nm systems: [TCD Analyte Excite](https://www.tcd.ie/Geology/research/facilities/geochemfacility/geochronology/excimerlaser.php); [ANU HelEx systems](https://earthsciences.anu.edu.au/research/facilities/icp-ms-research-facility-elemental-isotopic-and-laser-analysis/193-nm-laser-ablation-systems); [Montana State NWR193](https://nano.montana.edu/tools/tools_moreinfo_site_section/esl-nwr-193.html); [Tübingen RESOlution SE](https://uni-tuebingen.de/en/283953)
- fs systems: [NWRFemto listing](https://www.directindustry.com/prod/new-wave-research/product-24449-520269.html); [speciation.net NWRFemto](https://speciation.net/Appl/Techniques/technique.html?id=3107); [PHAROS harmonic generators](https://lightcon.com/product/harmonic-generator-for-pharos/); [Portsmouth J200 Tandem](https://researchportal.port.ac.uk/en/equipments/applied-spectra-j200-tandem-femtosecond-la-libs/)
- Rb–Sr by ICP-MS/MS: [Hogmalm et al. 2017 (Goldschmidt)](https://goldschmidtabstracts.info/2017/4444.pdf); [Hogmalm et al. 2017 JAAS](https://pubs.rsc.org/en/content/articlelanding/2017/ja/c6ja00362a)
- Reference zircons: Wiedenbeck et al. (1995) *Geostand. Newsl.* 19, 1 (91500); Sláma et al. (2008) *Chem. Geol.* 249, 1 (Plešovice). Decay constants: Jaffey et al. (1971); ²³⁸U/²³⁵U = 137.818 (Hiess et al. 2012).
