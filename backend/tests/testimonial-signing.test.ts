import { describe, test, expect } from "bun:test";
import { buildWorkboatTestimonial, testimonialSnapshot, validateSignature } from "../src/utils/workboatTestimonial";
import { escapeHtml, signPage, signPageMessage } from "../src/utils/testimonialSignPage";

const SIG = "data:image/png;base64,iVBORw0KGgo=";

const good = (extra: Record<string, any> = {}) => ({
  confirm: true,
  signer_name: "  Alex Master  ",
  signer_position: "master",
  signer_coc_no: "CoC 123",
  signature_image: SIG,
  conduct: "Very good",
  ...extra,
});

const snapshot = () => {
  const t = buildWorkboatTestimonial([
    {
      start_time: "2026-03-01T06:00:00Z",
      end_time: "2026-03-01T16:00:00Z",
      status: "confirmed",
      service_type: "watchkeeping_service",
      rank: "oow",
      vessel: { length_metres: "26", is_workboat: true },
    },
  ])!;
  return testimonialSnapshot(
    t,
    { name: "WINDCAT <42>", length_m: "26", gross_tons: "98", official_number: "920145", type: "Workboat" },
    { name: "Sam \"Sea\" Example", date_of_birth: "12/03/1990", discharge_book: "R1" },
  );
};

describe("testimonial signature validation (MGN 496 Annex C Part 3, 5.3)", () => {
  test("accepts a Master's signature with a CoC number and trims text", () => {
    const r = validateSignature(good(), { served_as_master: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.signer_name).toBe("Alex Master");
      expect(r.value.conduct).toBe("Very good");
      expect(r.value.ability).toBeNull();
    }
  });

  test("needs the confirmation box", () => {
    const r = validateSignature(good({ confirm: false }), { served_as_master: false });
    expect(r.ok).toBe(false);
  });

  test("a Master must give a CoC number", () => {
    const r = validateSignature(good({ signer_coc_no: "" }), { served_as_master: false });
    expect(r).toEqual({ ok: false, error: "Please give your CoC number." });
  });

  test("a responsible person must give an organisation", () => {
    const r = validateSignature(good({ signer_position: "responsible_person", signer_coc_no: null }), { served_as_master: false });
    expect(r).toEqual({ ok: false, error: "Please give your organisation." });
  });

  test("when the seafarer served as Master, a Master cannot sign (5.3)", () => {
    const r = validateSignature(good(), { served_as_master: true });
    expect(r.ok).toBe(false);
    const ok = validateSignature(good({ signer_position: "responsible_person", signer_organisation: "CTV Ltd" }), { served_as_master: true });
    expect(ok.ok).toBe(true);
  });

  test("rejects a missing, non-PNG or oversized signature", () => {
    expect(validateSignature(good({ signature_image: "" }), { served_as_master: false }).ok).toBe(false);
    expect(validateSignature(good({ signature_image: "data:image/svg+xml;base64,AAAA" }), { served_as_master: false }).ok).toBe(false);
    expect(validateSignature(good({ signature_image: SIG + "A".repeat(300_000) }), { served_as_master: false }).ok).toBe(false);
  });

  test("rejects an unknown position", () => {
    expect(validateSignature(good({ signer_position: "owner" }), { served_as_master: false }).ok).toBe(false);
  });

  test("caps long text at 2000 characters", () => {
    const r = validateSignature(good({ duties: "x".repeat(5000) }), { served_as_master: false });
    expect(r.ok && r.value.duties!.length).toBe(2000);
  });
});

describe("signing page", () => {
  test("escapes everything from the record", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    const html = signPage(snapshot(), "/public/testimonial/abc");
    expect(html).toContain("WINDCAT &lt;42&gt;");
    expect(html).toContain("Sam &quot;Sea&quot; Example");
    expect(html).not.toContain("WINDCAT <42>");
  });

  test("shows the Part 1 figures, NIL where there are none", () => {
    const html = signPage(snapshot(), "/public/testimonial/abc");
    expect(html).toContain("0 months 1 day");
    expect(html).toContain("1 days");
    expect(html).toContain("<dt>Leave of absence</dt><dd>NIL</dd>");
    expect(html).toContain('"/public/testimonial/abc"');
  });

  test("offers only Responsible person when the seafarer served as Master", () => {
    const s = { ...snapshot(), served_as_master: true };
    const html = signPage(s, "/x");
    expect(html).not.toContain('value="master"');
    expect(html).toContain("MGN 496 5.3");
  });

  test("message pages", () => {
    expect(signPageMessage("expired")).toContain("expired");
    expect(signPageMessage("signed", new Date("2026-11-05T10:00:00Z"))).toContain("05/11/2026");
  });
});
