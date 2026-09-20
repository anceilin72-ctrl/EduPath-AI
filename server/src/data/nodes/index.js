/**
 * The merged node catalog.
 *
 * Each domain file is authored independently so that a team can split the work,
 * but they are merged into a single graph here. Prerequisites may cross domain
 * boundaries freely — `domain` is a browsing label, not a partition.
 */

import technologyNodes from './technology.js';
import businessNodes from './business.js';
import creativeNodes from './creative.js';
import healthcareNodes from './healthcare.js';
import governmentNodes from './government.js';
import educationNodes from './education.js';

export const nodesByDomain = {
  technology: technologyNodes,
  business: businessNodes,
  creative: creativeNodes,
  healthcare: healthcareNodes,
  government: governmentNodes,
  education: educationNodes,
};

/** Every node in the catalog, in domain-file order. */
export const allNodes = [
  ...technologyNodes,
  ...businessNodes,
  ...creativeNodes,
  ...healthcareNodes,
  ...governmentNodes,
  ...educationNodes,
];

export default allNodes;
