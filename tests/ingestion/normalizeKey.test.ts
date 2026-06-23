import { describe, expect, it } from "vitest";
import { normalizeSearchText, normalizeStableKey, prefixedStableKey } from "../../src/ingestion/normalizers/normalizeKey.js";

describe("normalizeKey", () => {
  it("creates deterministic ASCII-safe stable keys", () => {
    expect(normalizeStableKey("Furina")).toBe("furina");
    expect(normalizeStableKey("Kaedehara Kazuha")).toBe("kaedehara_kazuha");
    expect(normalizeStableKey("Teachings of Justice")).toBe("teachings_of_justice");
    expect(normalizeStableKey("Tulaytullah's Remembrance")).toBe("tulaytullahs_remembrance");
    expect(normalizeStableKey("  A---B___C  ")).toBe("a_b_c");
  });

  it("adds entity prefixes", () => {
    expect(prefixedStableKey("char", "Furina")).toBe("char_furina");
    expect(prefixedStableKey("mat", "Teachings of Justice")).toBe("mat_teachings_of_justice");
  });

  it("normalizes alias search text with the same rules", () => {
    expect(normalizeSearchText("Kaedehara Kazuha")).toBe("kaedehara_kazuha");
  });
});
