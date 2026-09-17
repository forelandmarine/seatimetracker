/**
 * Flag-gated lazy singleton for the CTV/workboat sea-area classifier.
 *
 * COMMERCIAL PATHWAYS PREP — DARK BY DEFAULT. The classifier (and the ~9MB of
 * GeoJSON it reads) only loads when COMMERCIAL_PATHWAYS_ENABLED === 'true'.
 * Until the flag is flipped, getSeaAreaClassifier() returns null, no data is
 * read, and the live yachting app is completely unaffected.
 *
 * See utils/seaAreas/ (vendored from the CTV Sea Areas Tool) for the classifier.
 */
import { AreaClassifier } from './areaClassification.js';
import { loadLayers } from './load.js';

let classifier: AreaClassifier | null = null;
let initialised = false;

/** Master switch for all commercial-pathway (CTV/workboat) behaviour. */
export function commercialPathwaysEnabled(): boolean {
  return process.env.COMMERCIAL_PATHWAYS_ENABLED === 'true';
}

/**
 * Returns the sea-area classifier, or null when commercial pathways are disabled
 * or the GeoJSON layers could not be loaded. Never throws: a load failure leaves
 * classification unavailable rather than taking down the server.
 */
export function getSeaAreaClassifier(): AreaClassifier | null {
  if (!commercialPathwaysEnabled()) return null;
  if (!initialised) {
    initialised = true;
    try {
      classifier = new AreaClassifier(loadLayers());
    } catch (err) {
      classifier = null;
      console.error('[seaAreas] classifier failed to initialise:', err);
    }
  }
  return classifier;
}
