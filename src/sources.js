// Cited sources (shown in panels and README).
export const SRC = {
  thermoTQ: { label: 'Thermo: iCAP TQ introduction & applications (Lofthouse, 2017)', url: 'https://www.pragolab.cz/files/download/TSDD_2017/04_iCAP%20TQ%20introduction%20and%20applications%20Simon%20Lofthouse.pdf' },
  thermoTQspec: { label: 'Thermo iCAP TQ product specification (summary)', url: 'https://labrulez.com/en-us/all/paper/27438' },
  thermoTQpage: { label: 'Thermo iCAP TQ product page', url: 'https://www.thermofisher.com/icaptq' },
  thermoRQ: { label: 'Thermo iCAP RQ product page', url: 'https://thermofisher.cn/order/catalog/product/cn/en/BRE731416' },
  thermoTQe: { label: 'Thermo iCAP TQe brochure (BR74040)', url: 'https://assets.thermofisher.com/TFS-Assets/CMD/brochures/br-74040-icap-tqe-icp-ms-br74040-en.pdf' },
  tcd: { label: 'Trinity College Dublin: Analyte Excite (ATLEX 300si, HelEx)', url: 'https://www.tcd.ie/Geology/research/facilities/geochemfacility/geochronology/excimerlaser.php' },
  anu: { label: 'ANU RSES: 193 nm systems with HelEx cells', url: 'https://earthsciences.anu.edu.au/research/facilities/icp-ms-research-facility-elemental-isotopic-and-laser-analysis/193-nm-laser-ablation-systems' },
  montana: { label: 'Montana State: ESL NWR193 specifications', url: 'https://nano.montana.edu/tools/tools_moreinfo_site_section/esl-nwr-193.html' },
  tubingen: { label: 'Univ. Tübingen: Applied Spectra RESOlution SE (S155)', url: 'https://uni-tuebingen.de/en/283953' },
  nwrfemto: { label: 'NWRFemto product listing (PHAROS source, TwoVol)', url: 'https://www.directindustry.com/prod/new-wave-research/product-24449-520269.html' },
  nwrfemtoDb: { label: 'speciation.net: NWRFemto (1 kHz, 266/sub-200 nm, ≤7 J cm⁻²)', url: 'https://speciation.net/Appl/Techniques/technique.html?id=3107' },
  pharos: { label: 'Light Conversion: PHAROS harmonic generators', url: 'https://lightcon.com/product/harmonic-generator-for-pharos/' },
  portsmouth: { label: 'Univ. Portsmouth: J200 Tandem femtosecond LA-LIBS', url: 'https://researchportal.port.ac.uk/en/equipments/applied-spectra-j200-tandem-femtosecond-la-libs/' },
  hogmalm2017: { label: 'Hogmalm et al. (2017) Goldschmidt abstract: N₂O for Rb–Sr', url: 'https://goldschmidtabstracts.info/2017/4444.pdf' },
  hogmalmJAAS: { label: 'Hogmalm et al. (2017) JAAS 32: in-situ Rb–Sr by LA-ICP-MS/MS', url: 'https://pubs.rsc.org/en/content/articlelanding/2017/ja/c6ja00362a' },
};
export const srcList = (...keys) => keys.map((k) => SRC[k]).filter(Boolean);
