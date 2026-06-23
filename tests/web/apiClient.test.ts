import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPlayerSourceUploadFormData, createPlannerApiClient, PlannerApiError } from "../../apps/web/src/api/client.js";

describe("planner API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds GET requests with encoded material keys", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    const client = createPlannerApiClient("http://api.test");

    await client.getMaterialSources("mat philosophy");

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/knowledge/materials/mat%20philosophy/sources", {
      method: "GET",
      headers: undefined,
      body: undefined,
    });
  });

  it("builds POST requests with JSON body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    const client = createPlannerApiClient("http://api.test");
    const payload = {
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
    };

    await client.getCharacterRequirements(payload);

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/planner/character/requirements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  it("throws readable API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { code: "VALIDATION_ERROR", message: "targetLevel must be valid" } }, 400),
    );
    const client = createPlannerApiClient("http://api.test");

    await expect(client.getLevelCosts(20, 91)).rejects.toMatchObject({
      name: "PlannerApiError",
      status: 400,
      code: "VALIDATION_ERROR",
      message: "targetLevel must be valid",
    } satisfies Partial<PlannerApiError>);
  });

  it("builds manual override upsert requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    const client = createPlannerApiClient("http://api.test");

    await client.upsertInventoryOverride("default", "mat_heros_wit", {
      mode: "absolute",
      quantity: 40,
      reason: "manual correction",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/player/default/inventory/overrides/mat_heros_wit", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "absolute", quantity: 40, reason: "manual correction" }),
    });
  });

  it("builds player character state requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    const client = createPlannerApiClient("http://api.test");

    await client.getCharacterState("default user", "char furina");

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/player/default%20user/characters/char%20furina/state", {
      method: "GET",
      headers: undefined,
      body: undefined,
    });
  });

  it("builds player source upload FormData", () => {
    const formData = buildPlayerSourceUploadFormData({
      good: new File(["{}"], "good.json", { type: "application/json" }),
      weapons: new File(["{}"], "weapons.json", { type: "application/json" }),
    });

    expect(formData.get("good")).toBeInstanceOf(File);
    expect(formData.get("weapons")).toBeInstanceOf(File);
    expect(formData.get("hoyolab")).toBeNull();
  });

  it("builds multipart preview requests without JSON headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    const client = createPlannerApiClient("http://api.test");

    await client.previewPlayerSourceFiles("default user", { good: new File(["{}"], "good.json", { type: "application/json" }) });

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/player/default%20user/import/source-files/preview", {
      method: "POST",
      headers: undefined,
      body: expect.any(FormData),
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
