import { describe, test, expect } from "bun:test";
import fixture from "./fixtures/msn1837-sweep.json";
import { createClassifierFromFiles } from "../src/utils/seaAreas/load";
import { AreaClassifier } from "../src/utils/seaAreas/areaClassification";
import { PolygonLayer, type GeoJSONFeatureCollection } from "../src/utils/seaAreas/geo";

// Known points for every MSN 1837 (M) Amendment 3 Annex 1 area (built from
// scripts/harbour-areas/sweep-spec.mjs). 'none' = not categorised (at sea).
type Row = { area: string; expect: string; season: "summer" | "winter" | "any"; lat: number; lon: number; uncertain?: string };
const rows = fixture as Row[];
const c = createClassifierFromFiles();

describe("MSN 1837 Annex 1 sweep", () => {
  for (const r of rows) {
    const seasons = r.season === "any" ? (["summer", "winter"] as const) : [r.season];
    for (const season of seasons) {
      const name = `${r.area} (${season}) is ${r.expect}`;
      if (r.uncertain) {
        test.todo(`${name}: ${r.uncertain}`);
        continue;
      }
      test(name, () => {
        const res = c.classifyPoint({ lat: r.lat, lon: r.lon }, { season });
        expect(res.areaCategory ?? (res.atSea ? "none" : "unclassified")).toBe(r.expect);
      });
    }
  }
});

describe("the places the 2.5.0 check found", () => {
  const at = (lat: number, lon: number, season: "summer" | "winter" = "summer") => c.classifyPoint({ lat, lon }, { season });

  test("Leith Western Harbour and Imperial Dock are Cat B, not land", () => {
    expect(at(55.98233, -3.19634).areaCategory).toBe("B");
    expect(at(55.979, -3.16639).areaCategory).toBe("B");
  });

  test("Ardrossan marina is Cat C", () => {
    expect(at(55.6405, -4.8175).areaCategory).toBe("C");
  });

  test("Kylesku: Loch a' Chairn Bhain is Cat C", () => {
    expect(at(58.27, -5.1).areaCategory).toBe("C");
  });

  test("Glasgow: the River Clyde is C, the canals and lochs A and B", () => {
    expect(at(55.8563, -4.26416).areaCategory).toBe("C");
    expect(at(55.893, -4.28661).areaCategory).toBe("A");
    expect(at(55.88045, -4.16748).areaCategory).toBe("A");
    expect(at(55.795, -4.035).areaCategory).toBe("B");
  });

  test("Balnakiel Bay is Cat D; the Kyle of Durness south of Eilean Dubh is C", () => {
    expect(at(58.585, -4.77).areaCategory).toBe("D");
    expect(at(58.55405, -4.79315).areaCategory).toBe("C");
  });

  test("Walney Channel is C; Morecambe Bay D stops at the Rossall Point to Humphrey Head line", () => {
    expect(at(54.06, -3.19, "winter").areaCategory).toBe("C");
    expect(at(54.03, -3.15).areaCategory).toBeNull();
  });

  test("the Duddon is tidal but not categorised", () => {
    const r = at(54.22, -3.23);
    expect(r.areaCategory).toBeNull();
    expect(r.isTidal).toBe(true);
  });

  test("inland waters are non-tidal", () => {
    expect(at(55.88045, -4.16748).isTidal).toBe(false);
    expect(at(57.3, -4.45).isTidal).toBe(false); // Loch Ness
  });
});

describe("override precedence", () => {
  const sq = (lon0: number, lat0: number, d: number) => [[[lon0, lat0], [lon0 + d, lat0], [lon0 + d, lat0 + d], [lon0, lat0 + d], [lon0, lat0]]];
  const fc = (features: { coords: number[][][]; props: Record<string, unknown> }[]): GeoJSONFeatureCollection => ({
    type: "FeatureCollection",
    features: features.map((f) => ({ type: "Feature", properties: f.props, geometry: { type: "Polygon", coordinates: f.coords } })),
  });
  const empty = fc([]);
  const land = fc([{ coords: sq(10, 10, 1), props: {} }]); // far away
  const wfd = fc([{ coords: sq(0, 50, 1), props: { category: "C", wfd_water_body: "W" } }]);
  const tidal = fc([{ coords: sq(0, 50, 1), props: { name: "W" } }]);

  test("the smallest in-season override wins where they overlap", () => {
    const k = new AreaClassifier({
      categorised: wfd, tidal, land,
      overrides: fc([
        { coords: sq(0, 50, 1), props: { category: "C", season: "all" } },
        { coords: sq(0.4, 50.4, 0.1), props: { category: "B", season: "all", tidal: false } },
        { coords: sq(0.3, 50.3, 0.3), props: { category: "D", season: "winter" } },
      ]),
    });
    expect(k.categorisedWatersForPoint({ lat: 50.45, lon: 0.45 })).toBe("B");
    expect(k.categorisedWatersForPoint({ lat: 50.35, lon: 0.35 }, { season: "winter" })).toBe("D");
    expect(k.categorisedWatersForPoint({ lat: 50.35, lon: 0.35 }, { season: "summer" })).toBe("C");
    expect(k.classifyPoint({ lat: 50.45, lon: 0.45 }).isTidal).toBe(false);
  });

  test("a 'none' override masks the WFD category and keeps it tidal", () => {
    const k = new AreaClassifier({ categorised: wfd, tidal, land, overrides: fc([{ coords: sq(0, 50, 0.5), props: { category: "none", season: "all", masks_wfd: "W" } }]) });
    const r = k.classifyPoint({ lat: 50.2, lon: 0.2 });
    expect(r.areaCategory).toBeNull();
    expect(r.isTidal).toBe(true);
    expect(k.categorisedWatersForPoint({ lat: 50.8, lon: 0.8 })).toBe("C");
  });

  test("distance to categorised water skips inland overrides and wholly masked WFD bodies", () => {
    const k = new AreaClassifier({
      categorised: wfd, tidal, land,
      overrides: fc([
        { coords: sq(0, 50, 1), props: { category: "none", season: "all", masks_wfd: "W" } },
        { coords: sq(2, 50, 0.1), props: { category: "A", season: "all", tidal: false } },
        { coords: sq(3, 50, 0.1), props: { category: "C", season: "all" } },
      ]),
      dExtensions: empty,
    });
    const d = k.distanceFromCategorisedNm({ lat: 50.05, lon: 2.5 });
    expect(d).toBeGreaterThan(15); // to the harbour at 3E, about 19 nm; not the canal at 2.1E or the masked body
    expect(d).toBeLessThan(25);
  });
});

describe("spatial index", () => {
  test("grid lookups give the same answers as a plain scan", () => {
    // A ring with many vertices (indexed) and a hole, against a brute-force ray cast.
    const n = 400;
    const outer = Array.from({ length: n + 1 }, (_, i) => {
      const a = (i % n) * (2 * Math.PI / n);
      const r = 1 + 0.3 * Math.sin(7 * a);
      return [r * Math.cos(a), 55 + r * Math.sin(a)];
    });
    const hole = [[-0.2, 54.8], [0.2, 54.8], [0.2, 55.2], [-0.2, 55.2], [-0.2, 54.8]];
    const layer = new PolygonLayer({ type: "FeatureCollection", features: [{ type: "Feature", properties: { id: 1 }, geometry: { type: "Polygon", coordinates: [outer, hole] } }] });
    const inRing = (x: number, y: number, ring: number[][]) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 3000; i++) {
      const x = -1.5 + rnd() * 3;
      const y = 53.5 + rnd() * 3;
      expect(layer.contains({ lon: x, lat: y })).toBe(inRing(x, y, outer) && !inRing(x, y, hole));
    }
  });

  test("classifying a year of fixes stays fast", () => {
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pts = Array.from({ length: 5000 }, () => ({ lat: 50 + rnd() * 9, lon: -7 + rnd() * 9 }));
    const t = performance.now();
    for (const p of pts) c.classifyPoint(p);
    expect(performance.now() - t).toBeLessThan(1500); // about 0.02 ms a fix on a laptop
  });
});
