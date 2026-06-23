/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerPage } from "../../apps/web/src/pages/PlannerPage.js";

describe("PlannerPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the planner form without crashing", () => {
    render(<PlannerPage />);

    expect(screen.getByRole("heading", { name: "Genshin-Agent Planner" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("char_furina")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build plan" })).toBeInTheDocument();
  });

  it("renders an error state for backend failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));
    render(<PlannerPage />);

    fireEvent.click(screen.getByRole("button", { name: "Build plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("BACKEND_UNAVAILABLE");
  });

  it("renders plan sections from the API response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(planResponse()));
    render(<PlannerPage />);

    fireEvent.click(screen.getByRole("button", { name: "Build plan" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Daily resin schedule" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Missing materials" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Crafting actions" })).toBeInTheDocument();
    expect(screen.getByText("Whopperflower Nectar x219 -> Shimmering Nectar x73")).toBeInTheDocument();
    expect(screen.getByText("Raw JSON")).toBeInTheDocument();
  });

  it("renders diff-only materials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(planResponse().inventoryDiff));
    render(<PlannerPage />);

    fireEvent.click(screen.getByRole("button", { name: "Get diff only" }));

    expect(await screen.findByText("Satisfied materials")).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function planResponse() {
  const inventoryDiff = {
    player: { id: 1, stableKey: "default" },
    character: { id: 37, stableKey: "char_furina", name: "Furina" },
    inventorySnapshot: { id: 2, source: "inventory-kamera-good", createdAt: "2026-06-23T00:00:00.000Z" },
    goal: {
      currentLevel: 20,
      targetLevel: 90,
      currentTalents: { normal: 1, skill: 1, burst: 1 },
      targetTalents: { normal: 1, skill: 9, burst: 10 },
    },
    summary: {
      totalMaterials: 2,
      satisfiedMaterials: 1,
      missingMaterials: 1,
      totalRequiredQuantity: 104,
      totalOwnedQuantityForRequiredMaterials: 75,
    },
    materials: [
      {
        materialId: 663,
        stableKey: "mat_shimmering_nectar",
        name: "Shimmering Nectar",
        required: 74,
        owned: 74,
        directOwned: 1,
        effectiveOwned: 74,
        missing: 0,
        status: "satisfied",
        sources: ["ascension"],
      },
      {
        materialId: 228,
        stableKey: "mat_energy_nectar",
        name: "Energy Nectar",
        required: 30,
        owned: 1,
        missing: 29,
        status: "missing",
        sources: ["ascension"],
      },
    ],
    craftingActions: [
      {
        ruleId: "tier:mat_whopperflower_nectar->mat_shimmering_nectar",
        type: "tier_upgrade",
        inputMaterialName: "Whopperflower Nectar",
        inputQuantity: 219,
        outputMaterialName: "Shimmering Nectar",
        outputQuantity: 73,
        warnings: [],
      },
    ],
    conversionActions: [],
    warnings: ["Manual inventory overrides are future work."],
  };

  return {
    goal: { ...inventoryDiff.goal, playerKey: "default", characterKey: "char_furina" },
    inventoryDiff,
    sourceGroups: [],
    schedule: [
      {
        date: "2026-06-23",
        dayOfWeek: "tuesday",
        resinBudget: 180,
        plannedResin: 20,
        tasks: [
          {
            taskType: "placeholder",
            materialKey: "mat_philosophies_of_justice",
            materialName: "Philosophies of Justice",
            sourceType: "domain",
            sourceName: "Pale Forgotten Glory",
            materials: [{ materialKey: "mat_philosophies_of_justice", materialName: "Philosophies of Justice", missing: 60, role: "primary" }],
            runs: null,
            resin: 20,
            warnings: [],
          },
        ],
      },
    ],
    openWorldTasks: [
      {
        materialKey: "mat_energy_nectar",
        materialName: "Energy Nectar",
        missing: 29,
        sourceType: "enemy",
        sourceName: "Cryo Whopperflower",
        warnings: [],
      },
    ],
    unknownTasks: [],
    summary: {
      totalMissingMaterials: 1,
      totalEstimatedResin: null,
      scheduledEstimatedResin: 20,
      unscheduledResinTasks: 0,
      openWorldTasks: 1,
      unknownTasks: 0,
    },
    warnings: ["Manual inventory overrides are future work."],
  };
}
