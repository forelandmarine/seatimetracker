import { describe, test, expect } from "bun:test";
import {
  ENTRY_SIGNATURE_LIMIT,
  SIGNATURE_CLEARED,
  cannotSignReason,
  changesSignedFields,
  entrySignatureView,
  entrySnapshot,
  signatureColumns,
  signatureFingerprint,
  signatureIsCurrent,
  validateEntrySignature,
  withCurrentSignatures,
} from "../src/utils/entrySignature";
import { entrySignPage, entrySignPageMessage } from "../src/utils/entrySignPage";
import { planBulkUpdate } from "../src/routes/sea-time-bulk";
import { testimonialPdf } from "../src/routes/workboatTestimonial";
import { buildWorkboatTestimonial } from "../src/utils/workboatTestimonial";

// A real 1x1 PNG, so the PDF test embeds an actual image
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const good = (extra: Record<string, any> = {}) => ({
  confirm: true,
  signer_name: "  Alex Master  ",
  signer_capacity: "master",
  signature_image: PNG,
  ...extra,
});

const entry = (extra: Record<string, any> = {}) => ({
  id: "e1",
  user_id: "u1",
  vessel_id: "v1",
  start_time: new Date("2026-09-01T06:00:00Z"),
  end_time: new Date("2026-09-01T16:00:00Z"),
  service_type: "actual_sea_service",
  status: "confirmed",
  rank: "oow",
  ...extra,
});

const signed = (extra: Record<string, any> = {}) => {
  const e = entry(extra);
  const v = validateEntrySignature(good(), { served_as_master: false });
  if (!v.ok) throw new Error("fixture signature invalid");
  return { ...e, ...signatureColumns(e, v.value, "in_person", new Date("2026-09-02T09:00:00Z")) };
};

describe("entry signature validation", () => {
  test("accepts a Master's signature and trims the name", () => {
    const r = validateEntrySignature(good(), { served_as_master: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.signer_name).toBe("Alex Master");
      expect(r.value.signer_capacity).toBe("master");
    }
  });

  test("needs the confirm box, a name and a capacity", () => {
    expect(validateEntrySignature(good({ confirm: false }), { served_as_master: false }).ok).toBe(false);
    expect(validateEntrySignature(good({ signer_name: "   " }), { served_as_master: false }).ok).toBe(false);
    expect(validateEntrySignature(good({ signer_capacity: "mate" }), { served_as_master: false }).ok).toBe(false);
    expect(validateEntrySignature(null, { served_as_master: false }).ok).toBe(false);
  });

  test("MGN 496 5.3: a Master's own entry is signed by a responsible person", () => {
    const r = validateEntrySignature(good(), { served_as_master: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("5.3");
    expect(validateEntrySignature(good({ signer_capacity: "responsible_person" }), { served_as_master: true }).ok).toBe(true);
  });

  test("only takes a PNG data URL within the size limit", () => {
    const bad = (signature_image: any) => validateEntrySignature(good({ signature_image }), { served_as_master: false }).ok;
    expect(bad("")).toBe(false);
    expect(bad(undefined)).toBe(false);
    expect(bad("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(bad("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(bad("data:image/png;base64,<script>")).toBe(false);
    expect(bad("data:image/png;base64," + "A".repeat(ENTRY_SIGNATURE_LIMIT))).toBe(false);
    expect(bad(PNG)).toBe(true);
  });

  test("only finished pending or confirmed entries can be signed", () => {
    expect(cannotSignReason(entry())).toBeNull();
    expect(cannotSignReason(entry({ status: "pending" }))).toBeNull();
    expect(cannotSignReason(entry({ end_time: null }))).toContain("not finished");
    expect(cannotSignReason(entry({ status: "rejected" }))).toContain("Only");
    expect(cannotSignReason(entry({ status: "checking" }))).toContain("Only");
  });

  test("a declared day (end time left blank, sea_days stored) can be signed", () => {
    expect(cannotSignReason(entry({ end_time: null, sea_days: 1 }))).toBeNull();
    expect(cannotSignReason(entry({ end_time: null, sea_days: 3 }))).toBeNull();
  });

  test("open passages and shifts with no end time are still refused", () => {
    // AIS detection still running: pending with no end time
    expect(cannotSignReason(entry({ status: "pending", end_time: null, sea_days: null }))).toContain("not finished");
    expect(cannotSignReason(entry({ status: "pending", end_time: null, sea_days: 1 }))).toContain("not finished");
    // Open shift
    expect(cannotSignReason(entry({ status: "active", end_time: null, sea_days: 1 }))).toContain("not finished");
    // No end time and no day count
    expect(cannotSignReason(entry({ end_time: null, sea_days: 0 }))).toContain("not finished");
  });
});

describe("a signature covers the vessel, times and service type", () => {
  test("a fresh signature is current and shows signer, capacity and date", () => {
    const e = signed();
    expect(signatureIsCurrent(e)).toBe(true);
    expect(entrySignatureView(e)).toEqual({
      signer_name: "Alex Master",
      signer_capacity: "master",
      signed_at: "2026-09-02T09:00:00.000Z",
      method: "in_person",
    });
  });

  test("editing times, vessel or service type is a signed-field change; notes or rank are not", () => {
    const e = entry();
    expect(changesSignedFields(e, { service_type: "standby_service" })).toBe(true);
    expect(changesSignedFields(e, { end_time: new Date("2026-09-01T17:00:00Z") })).toBe(true);
    expect(changesSignedFields(e, { start_time: new Date("2026-09-01T05:00:00Z") })).toBe(true);
    expect(changesSignedFields(e, { vessel_id: "v2" })).toBe(true);
    expect(changesSignedFields(e, { service_type: "actual_sea_service" })).toBe(false);
    expect(changesSignedFields(e, { notes: "x", rank: "master" } as any)).toBe(false);
    // An unset service type is sea service
    expect(changesSignedFields(entry({ service_type: null }), { service_type: "actual_sea_service" })).toBe(false);
  });

  test("a declared day's signature covers its day count; a timed entry's fingerprint is unchanged", () => {
    const day = signed({ end_time: null, sea_days: 1 });
    expect(signatureIsCurrent(day)).toBe(true);
    expect(signatureIsCurrent({ ...day, sea_days: 2 })).toBe(false);
    expect(changesSignedFields(day, { sea_days: 2 })).toBe(true);
    expect(changesSignedFields(day, { sea_days: 1 })).toBe(false);
    // Timed entries: sea_days is derived, not signed, so recounting it keeps the signature
    expect(signatureFingerprint(entry())).toBe("v1|2026-09-01T06:00:00.000Z|2026-09-01T16:00:00.000Z|actual_sea_service");
    expect(changesSignedFields(entry({ sea_days: 1 }), { sea_days: 0 })).toBe(false);
  });

  test("a signature stops counting once the entry is changed by any route", () => {
    expect(signatureIsCurrent({ ...signed(), service_type: "yard_service" })).toBe(false);
    expect(signatureIsCurrent({ ...signed(), end_time: new Date("2026-09-01T18:00:00Z") })).toBe(false);
    expect(signatureIsCurrent({ ...signed(), vessel_id: "v2" })).toBe(false);
    expect(entrySignatureView({ ...signed(), vessel_id: "v2" })).toBeNull();
  });

  test("clearing removes every signature column", () => {
    const e = { ...signed(), ...SIGNATURE_CLEARED };
    expect(e.signature_image).toBeNull();
    expect(e.signature_signer_name).toBeNull();
    expect(e.signature_fingerprint).toBeNull();
    expect(entrySignatureView(e)).toBeNull();
  });

  test("bulk confirm keeps a signature when it changes nothing signed, and drops it when the service type changes", () => {
    const e = signed({ status: "pending" });
    const keep = planBulkUpdate(e, "u1", "confirm", undefined, () => 1);
    if ("error" in keep) throw new Error(keep.error);
    expect(signatureIsCurrent({ ...e, ...keep.update } as any)).toBe(true);
    const change = planBulkUpdate(e, "u1", "confirm", "standby_service", () => 1);
    if ("error" in change) throw new Error(change.error);
    expect(signatureIsCurrent({ ...e, ...change.update } as any)).toBe(false);
  });

  test("withCurrentSignatures strips stale and incomplete signatures only", () => {
    const [ok, stale, legacy, none] = withCurrentSignatures([
      signed(),
      { ...signed(), service_type: "standby_service" },
      entry({ signature_image: PNG }),
      entry(),
    ] as any[]);
    expect(ok.signature_image).toBe(PNG);
    expect(stale.signature_image).toBeNull();
    expect(legacy.signature_image).toBeNull();
    expect(none.signature_image).toBeUndefined();
  });

  test("the fingerprint is stable across Date and ISO string inputs", () => {
    expect(signatureFingerprint(entry())).toBe(
      signatureFingerprint(entry({ start_time: "2026-09-01T06:00:00Z", end_time: "2026-09-01T16:00:00.000Z" })),
    );
  });
});

describe("entry signing link page", () => {
  const snap = entrySnapshot(entry({ from_port: "Grimsby", to_port: "Hornsea <2>" }), "WINDCAT <42>", "Sam \"Sea\" Example");

  test("the snapshot carries what the signer is shown", () => {
    expect(snap.hours).toBe(10);
    expect(snap.service_type).toBe("Sea service");
    expect(snap.capacity).toBe("OOW");
    expect(snap.served_as_master).toBe(false);
    expect(entrySnapshot(entry({ rank: "master" }), "V", "S").served_as_master).toBe(true);
  });

  test("escapes the seafarer's text and shows the entry in UTC", () => {
    const html = entrySignPage(snap, "/public/entry-signature/abc");
    expect(html).toContain("WINDCAT &lt;42&gt;");
    expect(html).toContain("Sam &quot;Sea&quot; Example");
    expect(html).toContain("Hornsea &lt;2&gt;");
    expect(html).toContain("01/09/2026 06:00 UTC");
    expect(html).not.toContain("WINDCAT <42>");
    expect(html).not.toContain(String.fromCharCode(0x2014)); // no em dashes
  });

  test("a Master's own entry offers only the responsible person capacity", () => {
    const html = entrySignPage({ ...snap, served_as_master: true }, "/x");
    expect(html).not.toContain('value="master"');
    expect(html).toContain("MGN 496 5.3");
  });

  test("a declared single day shows its date, not a broken range", () => {
    const day = entrySnapshot(entry({ start_time: new Date("2026-09-03T00:00:00Z"), end_time: null, sea_days: 1 }), "V", "S");
    expect(day.end_time).toBeNull();
    expect(day.hours).toBeNull();
    expect(day.sea_days).toBe(1);
    const html = entrySignPage(day, "/x");
    expect(html).toContain("<dt>Date</dt><dd>03/09/2026</dd>");
    expect(html).toContain("<dt>Sea days</dt><dd>1</dd>");
    expect(html).not.toContain("<dt>To</dt>");
    expect(html).not.toContain("Invalid");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("1970");
  });

  test("a declared multi-day entry shows the date range", () => {
    const days = entrySnapshot(entry({ start_time: new Date("2026-09-30T00:00:00Z"), end_time: null, sea_days: 3 }), "V", "S");
    const html = entrySignPage(days, "/x");
    expect(html).toContain("30/09/2026 to 02/10/2026");
    expect(html).toContain("<dt>Sea days</dt><dd>3</dd>");
  });

  test("a timed entry's snapshot has no day count", () => {
    expect(snap.sea_days).toBeNull();
    expect(snap.end_time).toBe("2026-09-01T16:00:00.000Z");
  });

  test("the messages cover a changed entry", () => {
    expect(entrySignPageMessage("changed")).toContain("changed this entry");
  });
});

describe("the Annex C testimonial still embeds entry signatures", () => {
  const pdfText = async (entries: any[]) => {
    const t = buildWorkboatTestimonial(entries)!;
    const doc = testimonialPdf(
      [{ vessel: { id: "v1", vessel_name: "WINDCAT 42" }, t }],
      { name: "Sam Example", dateOfBirth: "", dischargeBook: "" },
      { warn: () => {} },
    );
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise((r) => doc.on("end", r));
    doc.end();
    await done;
    const pdf = Buffer.concat(chunks).toString("latin1");
    return { t, images: pdf.split("/Subtype /Image").length - 1 };
  };
  const workboat = { length_metres: "26", is_workboat: true };

  test("a current signature is counted and embedded as an image; a stale one is neither", async () => {
    const unsigned = await pdfText([{ ...entry(), vessel: workboat }]);
    const [current] = withCurrentSignatures([{ ...signed(), vessel: workboat }]);
    const withSig = await pdfText([current]);
    expect(withSig.t.signed_entries).toBe(1);
    expect(withSig.images).toBeGreaterThan(unsigned.images);

    const [stale] = withCurrentSignatures([{ ...signed(), service_type: "watchkeeping_service", vessel: workboat }]);
    const edited = await pdfText([stale]);
    expect(edited.t.signed_entries).toBe(0);
    expect(edited.images).toBe(unsigned.images);
  });
});
