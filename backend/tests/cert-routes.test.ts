// Route data checks for the app's certificate routes (constants/certRoutes.ts).
// Run with: npx tsx --test tests/cert-routes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
// The app's constants are CommonJS to this ESM package, so take the named exports off the default.
import routesModule from "../../constants/certRoutes";
import requirementsModule from "../../constants/mcaRequirements";

const { ALL_ROUTES, applyRoute, pickRoute } = routesModule as unknown as typeof import("../../constants/certRoutes");
const { ALL_REQUIREMENTS, getRequirementById } = requirementsModule as unknown as typeof import("../../constants/mcaRequirements");

const MEASURED = ["totalDays", "watchkeepingDays", "totalDaysWithRecordBook", "watchkeepingDaysWithRecordBook", "totalHours", "engineGates", "yachtBars", "workboatRoute", "tugRoute"] as const;

test("every route list belongs to a real certificate", () => {
  for (const id of Object.keys(ALL_ROUTES)) {
    assert.ok(getRequirementById(id), `no requirement with id ${id}`);
  }
});

test("each certificate with routes has at least two, with unique ids", () => {
  for (const [id, routes] of Object.entries(ALL_ROUTES)) {
    assert.ok(routes.length >= 2, `${id} has a single route`);
    const ids = routes.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `${id} repeats a route id`);
    for (const r of routes) assert.match(r.id, /^[a-z0-9-]{1,32}$/, `${id}/${r.id} is not a valid route id`);
  }
});

test("the default route keeps the certificate's own figures", () => {
  for (const [id, routes] of Object.entries(ALL_ROUTES)) {
    const first = routes[0] as any;
    for (const key of MEASURED) assert.equal(first[key], undefined, `${id} default route overrides ${key}`);
    assert.equal(first.startDate, undefined, `${id} default route has a start date`);
  }
});

test("every other route changes something the app measures", () => {
  for (const [id, routes] of Object.entries(ALL_ROUTES)) {
    for (const r of routes.slice(1) as any[]) {
      assert.ok(MEASURED.some((key) => r[key] !== undefined), `${id}/${r.id} changes nothing measured`);
    }
  }
});

test("engine gates only on certificates with an engine route, yacht bars only on MCA", () => {
  for (const [id, routes] of Object.entries(ALL_ROUTES)) {
    const req = getRequirementById(id)!;
    for (const r of routes) {
      if (r.engineGates) assert.ok(req.engineRoute, `${id}/${r.id} has engine gates but the certificate has no engine route`);
      if (r.yachtBars) assert.ok(!/^(uscg|amsa|mnz|samsa)-/.test(id), `${id}/${r.id} has MCA yacht bars`);
    }
  }
});

test("afterStart gates and bars come with a start date", () => {
  for (const [id, routes] of Object.entries(ALL_ROUTES)) {
    for (const r of routes) {
      const marked = [...(r.engineGates ?? []), ...(r.yachtBars ?? [])].some((g) => g.afterStart);
      if (marked) assert.equal(r.startDate?.scope, "marked", `${id}/${r.id} marks gates but its start date scope is not 'marked'`);
    }
  }
});

test("route text has no em or en dashes", () => {
  for (const [id, routes] of Object.entries(ALL_ROUTES)) {
    for (const r of routes) {
      const text = [r.label, r.summary, r.source, r.caveat ?? "", r.startDate?.label ?? ""].join(" ");
      assert.doesNotMatch(text, /[–—]/, `${id}/${r.id} has a dash`);
    }
  }
});

test("applyRoute and pickRoute", () => {
  const eoow = getRequirementById("eoow-sv")!;
  assert.equal(pickRoute("eoow-sv", "nope")?.id, "standard");
  const exp = applyRoute(eoow, pickRoute("eoow-sv", "experienced"))!;
  assert.equal(exp.engineRoute?.gates.length, 4);
  assert.equal(exp.engineRoute?.categorisedWater, eoow.engineRoute?.categorisedWater);
  assert.deepEqual(applyRoute(eoow, pickRoute("eoow-sv", "standard")), eoow);
  assert.ok(ALL_REQUIREMENTS.length > 0);
});

test("a route's own day figure is not replaced by the certificate's record-book figure", () => {
  for (const [id, routes] of Object.entries(ALL_ROUTES)) {
    const req = getRequirementById(id)!;
    for (const r of routes.slice(1)) {
      const applied = applyRoute(req, r)!;
      if (r.totalDays !== undefined) {
        assert.equal(applied.totalDaysWithRecordBook, r.totalDaysWithRecordBook, `${id}/${r.id} keeps the default record-book total`);
      }
    }
  }
});
