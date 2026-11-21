import { describe, expect, it, vi } from "vitest";

import { TokenResolver, type Keyring } from "../../src/auth/token-provider.js";

class MemoryKeyring implements Keyring {
  token: string | undefined;
  failGet = false;

  constructor(token?: string) {
    this.token = token;
  }

  async get(): Promise<string | undefined> {
    if (this.failGet) throw new Error("locked");
    return await Promise.resolve(this.token);
  }

  set(token: string): Promise<void> {
    this.token = token;
    return Promise.resolve();
  }

  delete(): Promise<boolean> {
    const found = this.token !== undefined;
    this.token = undefined;
    return Promise.resolve(found);
  }
}

describe("TokenResolver", () => {
  it("uses stdin before environment and keyring", async () => {
    const resolver = createResolver({
      env: { DISCOGS_TOKEN: "env-token" },
      input: inputOf("stdin-token\n"),
      keyring: new MemoryKeyring("saved-token"),
    });
    await expect(
      resolver.resolve({
        policy: "token_required",
        tokenStdin: true,
        forcePrompt: false,
      }),
    ).resolves.toEqual({ token: "stdin-token", source: "stdin" });
  });

  it("uses the environment before a forced prompt", async () => {
    const prompt = vi.fn(async () => await Promise.resolve("prompt-token"));
    const resolver = createResolver({
      env: { DISCOGS_TOKEN: "env-token" },
      prompt,
    });
    await expect(
      resolver.resolve({
        policy: "token_required",
        tokenStdin: false,
        forcePrompt: true,
      }),
    ).resolves.toEqual({ token: "env-token", source: "environment" });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("lets --token override a saved keyring token", async () => {
    const resolver = createResolver({
      keyring: new MemoryKeyring("saved-token"),
      interactive: true,
      prompt: async () => await Promise.resolve("prompt-token"),
    });
    await expect(
      resolver.resolve({
        policy: "token_required",
        tokenStdin: false,
        forcePrompt: true,
      }),
    ).resolves.toEqual({ token: "prompt-token", source: "prompt" });
  });

  it("falls back to a prompt when the keyring is unavailable", async () => {
    const keyring = new MemoryKeyring();
    keyring.failGet = true;
    const resolver = createResolver({
      keyring,
      interactive: true,
      prompt: async () => await Promise.resolve("temporary-token"),
    });
    await expect(
      resolver.resolve({
        policy: "token_required",
        tokenStdin: false,
        forcePrompt: false,
      }),
    ).resolves.toEqual({ token: "temporary-token", source: "prompt" });
  });

  it("returns an auth error instead of waiting in a non-interactive shell", async () => {
    const resolver = createResolver();
    await expect(
      resolver.resolve({
        policy: "token_required",
        tokenStdin: false,
        forcePrompt: false,
      }),
    ).rejects.toMatchObject({
      code: "GROOVECTL_AUTH_REQUIRED",
      kind: "auth_required",
    });
  });

  it("does not require a token for optional commands", async () => {
    const resolver = createResolver();
    await expect(
      resolver.resolve({
        policy: "token_optional",
        tokenStdin: false,
        forcePrompt: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("decodes Uint8Array chunks from stdin and rejects empty tokens", async () => {
    async function* bytes(): AsyncIterable<Uint8Array> {
      yield await Promise.resolve(new TextEncoder().encode("  byte-token\r\n"));
    }
    const resolver = createResolver({ input: bytes() });
    await expect(
      resolver.resolve({
        policy: "token_required",
        tokenStdin: true,
        forcePrompt: false,
      }),
    ).resolves.toEqual({ token: "byte-token", source: "stdin" });

    const empty = createResolver({ env: { DISCOGS_TOKEN: "   " } });
    await expect(
      empty.resolve({
        policy: "token_required",
        tokenStdin: false,
        forcePrompt: false,
      }),
    ).rejects.toMatchObject({
      code: "GROOVECTL_TOKEN_EMPTY",
      kind: "auth_invalid",
    });
  });

  it("returns saved keyring tokens and ignores keyring failures for optional commands", async () => {
    const saved = createResolver({ keyring: new MemoryKeyring("kr-token") });
    await expect(
      saved.resolve({
        policy: "token_optional",
        tokenStdin: false,
        forcePrompt: false,
      }),
    ).resolves.toEqual({ token: "kr-token", source: "keyring" });

    const failingKeyring = new MemoryKeyring();
    failingKeyring.failGet = true;
    const optional = createResolver({ keyring: failingKeyring });
    await expect(
      optional.resolve({
        policy: "token_optional",
        tokenStdin: false,
        forcePrompt: false,
      }),
    ).resolves.toBeUndefined();
  });
});

function createResolver(
  overrides: Partial<{
    env: NodeJS.ProcessEnv;
    input: AsyncIterable<string | Uint8Array>;
    interactive: boolean;
    keyring: MemoryKeyring;
    prompt: () => Promise<string>;
  }> = {},
): TokenResolver {
  return new TokenResolver({
    env: overrides.env ?? {},
    input: overrides.input ?? inputOf(""),
    interactive: overrides.interactive ?? false,
    keyring: overrides.keyring ?? new MemoryKeyring(),
    prompt:
      overrides.prompt ??
      (async () => await Promise.resolve("unexpected-prompt")),
  });
}

async function* inputOf(value: string): AsyncIterable<string> {
  yield await Promise.resolve(value);
}
