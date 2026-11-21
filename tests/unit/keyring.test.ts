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
    await expect(keyring.set("tok")).rejects.toMatchObject({
      code: "GROOVECTL_KEYRING_UNAVAILABLE",
    });
    await expect(keyring.delete()).rejects.toMatchObject({
      code: "GROOVECTL_KEYRING_UNAVAILABLE",
    });
  });

  it("delegates get, set, and delete to the native AsyncEntry once initialized", async () => {
    const getPassword = vi.fn(() => Promise.resolve("saved-token"));
    const setPassword = vi.fn(() => Promise.resolve());
    const deletePassword = vi.fn(() => Promise.resolve(true));
    vi.mocked(AsyncEntry).mockImplementation(function () {
      return {
        getPassword,
        setPassword,
        deletePassword,
      } as unknown as AsyncEntry;
    });
    const keyring = new NativeKeyring();
    await expect(keyring.set("saved-token")).resolves.toBeUndefined();
    await expect(keyring.get()).resolves.toBe("saved-token");
    await expect(keyring.delete()).resolves.toBe(true);
    expect(AsyncEntry).toHaveBeenCalledTimes(1);
  });
});
