import type { AsyncEntry } from "@napi-rs/keyring";

import type { Keyring } from "./token-provider.js";
import { keyringUnavailable } from "./token-provider.js";

export class NativeKeyring implements Keyring {
  #entry: AsyncEntry | undefined;

  async #getEntry(): Promise<AsyncEntry> {
    if (this.#entry === undefined) {
      const { AsyncEntry } = await import("@napi-rs/keyring");
      // Keep the original namespace so renaming the CLI preserves saved tokens.
      this.#entry = new AsyncEntry(
        "crateflow",
        "default",
        process.platform === "linux"
          ? { linux: { store: "secret-service" } }
          : undefined,
      );
    }
    return this.#entry;
  }

  async get(): Promise<string | undefined> {
    try {
      return await (await this.#getEntry()).getPassword();
    } catch (cause: unknown) {
      throw keyringUnavailable(cause);
    }
  }

  async set(token: string): Promise<void> {
    try {
      await (await this.#getEntry()).setPassword(token);
    } catch (cause: unknown) {
      throw keyringUnavailable(cause);
    }
  }

  async delete(): Promise<boolean> {
    try {
      return await (await this.#getEntry()).deletePassword();
    } catch (cause: unknown) {
      throw keyringUnavailable(cause);
    }
  }
}
