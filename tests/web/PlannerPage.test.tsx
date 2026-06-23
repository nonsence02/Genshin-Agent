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
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
