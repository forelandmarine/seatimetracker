import { describe, test, expect } from "bun:test";
import { chunkMarkdown, promoteNumberedTitle } from "../scripts/ingest-knowledge";

describe("chunkMarkdown", () => {
  test("keeps the heading path as the section", () => {
    const chunks = chunkMarkdown("# MSN 1858\n\n## Sea service\n\nYard service counts up to 90 days.\n\n### Stand-by\n\nStand-by service counts in full.");
    expect(chunks).toEqual([
      { section: "MSN 1858 > Sea service", content: "Yard service counts up to 90 days." },
      { section: "MSN 1858 > Sea service > Stand-by", content: "Stand-by service counts in full." },
    ]);
  });

  test("a new heading at the same level replaces the old one", () => {
    const chunks = chunkMarkdown("## A\n\none\n\n## B\n\ntwo");
    expect(chunks.map((c) => c.section)).toEqual(["A", "B"]);
  });

  test("long text is split without dropping anything", () => {
    const line = "Seagoing service on yachts of 24 metres load line length and over.";
    const body = "## Rules\n\n" + Array.from({ length: 80 }, () => line).join("\n");
    const chunks = chunkMarkdown(body);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 1800)).toBe(true);
    expect(chunks.map((c) => c.content).join("\n").split("\n").length).toBe(80);
  });
});

describe("numbered section titles", () => {
  test("a bold numbered line becomes the section", () => {
    const chunks = chunkMarkdown("# MSN 1858\n\n**10. Notice of Eligibility (NOE)**\n\nPrior to the issue of your NOE you must submit the fee.");
    expect(chunks).toEqual([{ section: "MSN 1858 > 10. Notice of Eligibility (NOE)", content: "Prior to the issue of your NOE you must submit the fee." }]);
  });
  test("split bold markers and the contents list", () => {
    expect(promoteNumberedTitle("**5.** **Yacht Service Requirements**")).toBe("### 5. Yacht Service Requirements");
    const toc = "**1.** Introduction\n**2.** Certificate Structure";
    expect(promoteNumberedTitle(toc)).toBe(toc);
    expect(promoteNumberedTitle("**10.2** You will be issued with an NOE.")).toBe("**10.2** You will be issued with an NOE.");
  });
});
