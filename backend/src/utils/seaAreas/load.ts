/**
 * load.ts — Node convenience loader. Reads the three committed GeoJSON layers
 * from disk and returns a ready AreaClassifier. Kept separate from
 * areaClassification.ts so the core module has no fs / Node dependency and can be
 * bundled into the SeaTime backend or a React Native context unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AreaClassifier, type ClassifierLayers } from './areaClassification.js';
import type { GeoJSONFeatureCollection } from './geo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Marker file that must live in the data dir.
const MARKER = 'tidal-waters.geojson';

/**
 * Resolve the data directory across dev, bundled and vendored layouts.
 *
 * The old `path.resolve(__dirname, '../data')` only works when this file runs
 * unbundled from `src/`. Once esbuild bundles it into e.g. `dist/index.js`,
 * `__dirname` points at the bundle, so `../data` is wrong. Check the plausible
 * locations and pick the first that actually contains the layers.
 */
export function resolveDataDir(): string {
  const candidates = [
    process.env.SEA_AREAS_DATA_DIR, // explicit override (set this in the app if needed)
    path.resolve(__dirname, '../data'), // dev: src/load.ts -> src/../data
    path.resolve(__dirname, 'data'), // bundled: dist/index.js -> dist/data
    path.resolve(__dirname, '../data/seaAreas'), // vendored under src/data/seaAreas
    path.resolve(__dirname, 'data/seaAreas'), // vendored + bundled
    path.resolve(process.cwd(), 'dist/data'),
    path.resolve(process.cwd(), 'src/data'),
    path.resolve(process.cwd(), 'data'),
  ].filter((d): d is string => Boolean(d));

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, MARKER))) return dir;
    } catch {
      /* keep looking */
    }
  }
  throw new Error(
    `Sea-areas data not found (looked for ${MARKER} in: ${candidates.join(', ')}). ` +
      `Set SEA_AREAS_DATA_DIR to the folder holding the GeoJSON layers.`,
  );
}

function readFc(dir: string, file: string): GeoJSONFeatureCollection {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

export function loadLayers(dataDir: string = resolveDataDir()): ClassifierLayers {
  return {
    categorised: readFc(dataDir, 'categorised-waters.geojson'),
    tidal: readFc(dataDir, 'tidal-waters.geojson'),
    land: readFc(dataDir, 'uk-land.geojson'),
    dExtensions: readFc(dataDir, 'cat-d-extensions.geojson'),
  };
}

export function createClassifierFromFiles(dataDir: string = resolveDataDir()): AreaClassifier {
  return new AreaClassifier(loadLayers(dataDir));
}
