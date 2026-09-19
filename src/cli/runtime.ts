import { NativeKeyring } from "../auth/keyring.js";
import { promptForToken } from "../auth/prompt.js";
import { TokenResolver, type Keyring } from "../auth/token-provider.js";
import { DiscogsClient } from "../discogs/client.js";
import { AppError } from "../errors/app-error.js";
import type { FetchLike } from "../http/request.js";
import { packageVersion } from "../version.js";

export interface RuntimeDependencies {
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  input?: AsyncIterable<string | Uint8Array>;
  interactive?: boolean;
  keyring?: Keyring;
  promptToken?: () => Promise<string>;
}

export class CliRuntime {
  readonly env: NodeJS.ProcessEnv;
  readonly keyring: Keyring;
  readonly tokens: TokenResolver;
  readonly #fetch: FetchLike | undefined;

  constructor(dependencies: RuntimeDependencies = {}) {
    this.env = dependencies.env ?? process.env;
    this.#fetch = dependencies.fetch;
    this.keyring = dependencies.keyring ?? new NativeKeyring();
    this.tokens = new TokenResolver({
      env: this.env,
      input: dependencies.input ?? process.stdin,
      interactive:
        dependencies.interactive ??
        (process.stdin.isTTY && process.stderr.isTTY),
      keyring: this.keyring,
      prompt: dependencies.promptToken ?? promptForToken,
    });
  }

  client(token?: string): DiscogsClient {
    return new DiscogsClient({
      baseUrl: resolveBaseUrl(this.env),
      userAgent: `Crateflow/${packageVersion} (local development)`,
      ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
      ...(token === undefined ? {} : { token }),
    });
  }
}

function resolveBaseUrl(env: NodeJS.ProcessEnv): string {
  const override = env.CRATEFLOW_API_BASE_URL;
  if (override === undefined) {
    return "https://api.discogs.com";
  }
  if (env.NODE_ENV !== "test") {
    throw new AppError({
      kind: "usage",
      code: "CRATEFLOW_UNSAFE_BASE_URL",
      message: "CRATEFLOW_API_BASE_URL is only allowed when NODE_ENV=test.",
    });
  }
  return override;
}
