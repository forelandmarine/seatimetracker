/**
 * Public API for the CTV Sea Areas Tool.
 *
 *   import { createClassifierFromFiles } from 'ctv-sea-areas-tool';
 *   const c = createClassifierFromFiles();
 *   c.classifyPoint({ lat: 53.63, lon: -0.19 });
 */
export * from './areaClassification.js';
export { PolygonLayer } from './geo.js';
export type { LonLat, GeoJSONFeature, GeoJSONFeatureCollection } from './geo.js';
export { loadLayers, createClassifierFromFiles, resolveDataDir } from './load.js';
