import { describe, test, expect } from "bun:test";
import { cleanComment, cleanReasons, MAX_COMMENT_LENGTH } from "../src/utils/feedback";

describe("cleanReasons", () => {
  test("keeps known reasons once, in canonical order", () => {
    expect(cleanReasons(["other", "too_expensive", "other", "made_up", 3])).toEqual(["too_expensive", "other"]);
  });
  test("non-arrays give nothing", () => {
    expect(cleanReasons("too_expensive")).toEqual([]);
    expect(cleanReasons(undefined)).toEqual([]);
  });
});

describe("cleanComment", () => {
  test("trims and drops empty", () => {
    expect(cleanComment("  too pricey  ")).toBe("too pricey");
    expect(cleanComment("   ")).toBeNull();
    expect(cleanComment(42)).toBeNull();
  });
  test("caps the length", () => {
    expect(cleanComment("x".repeat(MAX_COMMENT_LENGTH + 50))!.length).toBe(MAX_COMMENT_LENGTH);
  });
});
