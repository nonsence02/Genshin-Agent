import { describe, expect, it } from "vitest";
import type { GameDataProvider } from "../../src/ingestion/providers/GenshinDbProvider.js";
import {
  GameDataImportService,
  type GameDataImportRepository,
  type RawGameObjectUpsert,
} from "../../src/ingestion/services/GameDataImportService.js";
import { sha256StableJson } from "../../src/ingestion/utils/stableJson.js";

class MockProvider implements GameDataProvider {
  readonly source = "genshin-db";

  getSourceVersion(): string {
    return "test-version";
  }

  listSupportedFolders(): string[] {
    return ["characters", "materials"];
  }

  listNames(folder: string): string[] {
    return this.dumpFolder(folder).map((object) => object.externalKey);
  }

  getObject(folder: string, name: string): unknown {
    return this.dumpFolder(folder).find((object) => object.externalKey === name)?.raw;
  }

  dumpFolder(folder: string): Array<{ externalKey: string; raw: unknown }> {
    if (folder === "characters") {
      return [{ externalKey: "Furina", raw: { name: "Furina", id: 10000089 } }];
    }

    if (folder === "materials") {
      return [{ externalKey: "Lakelight Lily", raw: { name: "Lakelight Lily", category: "Local Specialty" } }];
    }

    return [];
  }
}

class MockRepository implements GameDataImportRepository {
  readonly upserts: RawGameObjectUpsert[] = [];
  completedMetadata: unknown;
  failedMessage: string | undefined;

  async createImportRun(): Promise<{ id: number }> {
    return { id: 42 };
  }

  async completeImportRun(_importRunId: number, metadata: unknown): Promise<void> {
    this.completedMetadata = metadata;
  }

  async failImportRun(_importRunId: number, errorMessage: string): Promise<void> {
    this.failedMessage = errorMessage;
  }

  async upsertRawGameObject(input: RawGameObjectUpsert): Promise<void> {
    this.upserts.push(input);
  }
}

describe("GameDataImportService", () => {
  it("upserts mocked provider objects into the raw repository", async () => {
    const repository = new MockRepository();
    const service = new GameDataImportService(new MockProvider(), repository, () => undefined);

    const result = await service.importAll();

    expect(result.importRunId).toBe(42);
    expect(result.rawObjectCount).toBe(2);
    expect(repository.upserts).toHaveLength(2);
    expect(repository.upserts[0]).toMatchObject({
      importRunId: 42,
      source: "genshin-db",
      sourceVersion: "test-version",
      folder: "characters",
      externalKey: "Furina",
    });
    expect(repository.upserts[0]?.rawHash).toBe(sha256StableJson({ name: "Furina", id: 10000089 }));
    expect(repository.completedMetadata).toEqual(result);
    expect(repository.failedMessage).toBeUndefined();
  });

  it("supports limiting a folder import", async () => {
    const repository = new MockRepository();
    const service = new GameDataImportService(new MockProvider(), repository, () => undefined);

    const result = await service.importAll({ folders: ["characters"], limit: 1 });

    expect(result.rawObjectCount).toBe(1);
    expect(repository.upserts).toHaveLength(1);
    expect(repository.upserts[0]?.folder).toBe("characters");
  });

  // TODO: add PostgreSQL integration coverage once a test database lifecycle is configured.
});
