import { AsyncEntry } from "@napi-rs/keyring";

import type { Keyring } from "./token-provider.js";
import { keyringUnavailable } from "./token-provider.js";

export class NativeKeyring implements Keyring {
  readonly #entry: AsyncEntry;

  constructor() {
    try {
      this.#entry = new AsyncEntry(
        "crateflow",
        "default",
        process.platform === "linux"
          ? { linux: { store: "secret-service" } }
          : undefined,
      );
    } catch (cause: unknown) {
      throw keyringUnavailable(cause);
    }
  }

  async get(): Promise<string | undefined> {
    try {
      return await this.#entry.getPassword();
    } catch (cause: unknown) {
      throw keyringUnavailable(cause);
    }
  }

  async set(token: string): Promise<void> {
    try {
      await this.#entry.setPassword(token);
    } catch (cause: unknown) {
      throw keyringUnavailable(cause);
    }
  }

  async delete(): Promise<boolean> {
    try {
      return await this.#entry.deletePassword();
    } catch (cause: unknown) {
      throw keyringUnavailable(cause);
    }
  }
}
