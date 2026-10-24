import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncEntry } from "@napi-rs/keyring";
import { NativeKeyring } from "../../src/auth/keyring.js";

vi.mock("@napi-rs/keyring", () => ({ AsyncEntry: vi.fn() }));

beforeEach(() => {
  vi.mocked(AsyncEntry).mockReset();
});

describe("NativeKeyring", () => {
  it("does not initialize the native credential store just to construct the CLI", () => {
    vi.mocked(AsyncEntry).mockImplementation(function () {
      throw new Error("No session bus");
    });
    expect(() => new NativeKeyring()).not.toThrow();
    expect(AsyncEntry).not.toHaveBeenCalled();
  });

  it("returns a stable error only when the unavailable store is accessed", async () => {
    vi.mocked(AsyncEntry).mockImplementation(function () {
      throw new Error("No session bus");
    });
    const keyring = new NativeKeyring();
    await expect(keyring.get()).rejects.toMatchObject({
      code: "GROOVECTL_KEYRING_UNAVAILABLE",
    });
  });
});
