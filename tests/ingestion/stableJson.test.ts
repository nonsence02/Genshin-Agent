import { describe, expect, it } from "vitest";
import { sha256StableJson, stableJsonStringify } from "../../src/ingestion/utils/stableJson.js";

describe("stableJson", () => {
  it("serializes equivalent objects with stable key ordering", () => {
    expect(stableJsonStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableJsonStringify({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("hashes equivalent objects to the same sha256", () => {
    expect(sha256StableJson({ b: 2, a: 1 })).toBe(sha256StableJson({ a: 1, b: 2 }));
  });
});
