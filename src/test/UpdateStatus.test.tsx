import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Update } from "@tauri-apps/plugin-updater";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateStatus } from "../components/UpdateStatus";
import { themes } from "../themes";

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

const theme = themes.dark;

function createUpdate(
  overrides: Partial<Update> = {},
): Update {
  return {
    available: true,
    body: "",
    currentVersion: "0.5.4",
    date: "2026-03-30T00:00:00.000Z",
    rawJson: {} as Record<string, unknown>,
    version: "0.5.5",
    download: vi.fn().mockResolvedValue(undefined),
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Update;
}

describe("UpdateStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when there is no update", () => {
    const { container } = render(<UpdateStatus availableUpdate={null} theme={theme} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders an install button when an update is available", () => {
    render(<UpdateStatus availableUpdate={createUpdate()} theme={theme} />);
    expect(screen.getByRole("button", { name: /update available: v0.5.5/i })).toBeInTheDocument();
  });

  it("shows an error and clears it when a new update arrives", async () => {
    const failingUpdate = createUpdate({
      version: "0.5.5",
      downloadAndInstall: vi.fn().mockRejectedValue(new Error("network down")),
    });
    const { rerender } = render(<UpdateStatus availableUpdate={failingUpdate} theme={theme} />);

    fireEvent.click(screen.getByRole("button", { name: /update available: v0.5.5/i }));

    expect(await screen.findByText("Update failed")).toBeInTheDocument();

    rerender(<UpdateStatus availableUpdate={createUpdate({ version: "0.5.6" })} theme={theme} />);

    await waitFor(() => {
      expect(screen.queryByText("Update failed")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /update available: v0.5.6/i })).toBeInTheDocument();
  });
});
