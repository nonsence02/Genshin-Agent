// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerPage } from "../../apps/web/src/pages/PlannerPage.js";

describe("PlannerPage player state integration", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a backend unavailable message when health check fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    render(<PlannerPage />);

    expect(await screen.findByText("Backend: offline")).toBeInTheDocument();
    expect(screen.getByText("Backend is not running. Start it with npm run dev or set VITE_API_BASE_URL.")).toBeInTheDocument();
  });

  it("loads character state and populates current planner fields", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.endsWith("/health")) {
        return jsonResponse({ status: "ok" });
      }
      if (href.includes("/player/default/characters/char_furina/state")) {
        return jsonResponse({
          character: { id: 37, stableKey: "char_furina", key: "furina", name: "Furina" },
          level: 80,
          ascension: 5,
          constellation: 1,
          talents: { normal: 2, skill: 9, burst: 10 },
          equippedArtifacts: [],
          sources: {
            level: "hoyolab_profile",
            ascension: "inventory-kamera-good",
            "talents.normal": "hoyolab_profile",
            "talents.skill": "hoyolab_profile",
            "talents.burst": "hoyolab_profile",
          },
          conflicts: [],
          warnings: [],
        });
      }
      return jsonResponse({});
    });

    render(<PlannerPage />);

    fireEvent.click((await screen.findAllByText("Load character state"))[0]);

    await waitFor(() => expect(screen.getByLabelText("Current level")).toHaveValue(80));
    expect(screen.getByLabelText("Current ascension phase")).toHaveValue(5);
    expect(screen.getByLabelText("Current normal")).toHaveValue(2);
    expect(screen.getByLabelText("Current skill")).toHaveValue(9);
    expect(screen.getByLabelText("Current burst")).toHaveValue(10);
    expect(screen.getByText("ascension source: inventory-kamera-good")).toBeInTheDocument();
  });

  it("renders upload panel and reports missing files before upload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ status: "ok" }));

    render(<PlannerPage />);

    expect(await screen.findByText("Update player data")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Preview"));

    expect(screen.getByText("Select at least one JSON source file.")).toBeInTheDocument();
  });

  it("renders player source preview summary", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.endsWith("/health")) {
        return jsonResponse({ status: "ok" });
      }
      if (href.includes("/import/source-files/preview")) {
        return jsonResponse(uploadResponse({ dryRun: true }));
      }
      return jsonResponse({});
    });

    render(<PlannerPage />);

    const goodInput = await screen.findByLabelText("GOOD / good.json");
    fireEvent.change(goodInput, { target: { files: [new File(["{}"], "good.json", { type: "application/json" })] } });
    fireEvent.click(screen.getByText("Preview"));

    expect(await screen.findByText("Preview complete")).toBeInTheDocument();
    expect(screen.getByText("materials: 1 parsed, 1 resolved, 0 unresolved")).toBeInTheDocument();
    expect(screen.queryByText(/raw-private-content/)).not.toBeInTheDocument();
  });

  it("renders import summary and refreshes character state", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.endsWith("/health")) {
        return jsonResponse({ status: "ok" });
      }
      if (href.includes("/import/source-files") && !href.includes("preview")) {
        return jsonResponse(uploadResponse({ dryRun: false }));
      }
      if (href.includes("/player/default/characters/char_furina/state")) {
        return jsonResponse({
          character: { id: 37, stableKey: "char_furina", key: "furina", name: "Furina" },
          level: 82,
          ascension: 5,
          constellation: 2,
          talents: { normal: 2, skill: 9, burst: 10 },
          equippedArtifacts: [],
          sources: { level: "hoyolab_profile", ascension: "inventory-kamera-good" },
          conflicts: [],
          warnings: [],
        });
      }
      return jsonResponse({});
    });

    render(<PlannerPage />);

    const hoyolabInput = await screen.findByLabelText("hoyolab_profile.json");
    fireEvent.change(hoyolabInput, { target: { files: [new File(["{}"], "hoyolab_profile.json", { type: "application/json" })] } });
    fireEvent.click(screen.getByText("Import"));

    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    expect(screen.getByText("state: 2 characters, 1 weapons, 3 artifacts")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Current level")).toHaveValue(82));
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function uploadResponse({ dryRun }: { dryRun: boolean }) {
  return {
    player: { id: dryRun ? 0 : 1, stableKey: "default" },
    dryRun,
    files: [{ field: "good", originalName: "good.json", size: 2, accepted: true, warnings: [] }],
    importSummary: {
      sourceFilesProcessed: ["good.json"],
      materialsParsed: 1,
      materialsResolved: 1,
      materialsUnresolved: 0,
      weaponsParsed: 1,
      weaponsResolved: 1,
      weaponsUnresolved: 0,
      hoyolabCharactersParsed: 1,
      hoyolabCharactersResolved: 1,
      hoyolabCharactersUnresolved: 0,
    },
    playerStateSummary: dryRun ? undefined : { characters: 2, weapons: 1, artifacts: 3 },
    warnings: [],
  };
}
