// Scene registry (order = navigation order).
import icpms from './icpms.js';
import quadrupole from './quadrupole.js';
import cell from './cell.js';
import excimer from './excimer.js';
import femto from './femto.js';
import coupled from './coupled.js';

export const SCENES = [icpms, quadrupole, cell, excimer, femto, coupled];
