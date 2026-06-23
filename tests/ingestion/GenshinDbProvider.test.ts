import { describe, expect, it } from "vitest";
import { GenshinDbProvider } from "../../src/ingestion/providers/GenshinDbProvider.js";

describe("GenshinDbProvider", () => {
  const provider = new GenshinDbProvider(undefined, () => undefined);

  it("lists characters and materials when genshin-db exposes them", () => {
    const folders = provider.listSupportedFolders();

    expect(folders).toContain("characters");
    expect(folders).toContain("materials");
    expect(provider.listNames("characters").length).toBeGreaterThan(0);
    expect(provider.listNames("materials").length).toBeGreaterThan(0);
  });

  it("dumps folder objects with an external key and raw payload", () => {
    const [first] = provider.dumpFolder("characters");

    expect(first).toBeDefined();
    expect(first.externalKey).toEqual(expect.any(String));
    expect(first.raw).toEqual(expect.any(Object));
  });
});
