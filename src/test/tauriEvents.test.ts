import { listen } from "@tauri-apps/api/event";
import { describe, expect, it, vi } from "vitest";
import { listenSafely } from "../tauriEvents";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const listenMock = vi.mocked(listen);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("listenSafely", () => {
  it("calls the unlisten callback when disposed before registration resolves", async () => {
    const unlisten = vi.fn();
    const registration = deferred<() => void>();
    listenMock.mockReturnValueOnce(registration.promise);

    const dispose = listenSafely("menu-action", vi.fn());
    dispose();
    registration.resolve(unlisten);
    await registration.promise;

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("calls the unlisten callback immediately when disposed after registration resolves", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);

    const dispose = listenSafely("menu-action", vi.fn());
    await Promise.resolve();
    dispose();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
