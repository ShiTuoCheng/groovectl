import { NativeKeyring } from "../auth/keyring.js";
import { promptForConfirmation, promptForToken } from "../auth/prompt.js";
import { TokenResolver, type Keyring } from "../auth/token-provider.js";
import { DiscogsClient } from "../discogs/client.js";
import { configFilePath } from "../config/paths.js";
import { ConfigStore } from "../config/store.js";
import { AppError } from "../errors/app-error.js";
import { RateLimitGate } from "../http/rate-limit.js";
import type { FetchLike } from "../http/request.js";
import { packageVersion } from "../version.js";
import { timeoutFor, type GlobalOptions } from "./global-options.js";
import type { Command } from "commander";
import type { OutputFormat } from "../output/renderer.js";

export interface RuntimeDependencies {
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  input?: AsyncIterable<string | Uint8Array>;
  interactive?: boolean;
  keyring?: Keyring;
  promptToken?: () => Promise<string>;
  confirm?: (message: string) => Promise<boolean>;
}

export class CliRuntime {
  readonly env: NodeJS.ProcessEnv;
  readonly keyring: Keyring;
  readonly tokens: TokenResolver;
  readonly interactive: boolean;
  readonly confirm: (message: string) => Promise<boolean>;
  readonly config: ConfigStore;
  readonly #rateLimit = new RateLimitGate();
  readonly #fetch: FetchLike | undefined;

  constructor(dependencies: RuntimeDependencies = {}) {
    this.env = dependencies.env ?? process.env;
    this.#fetch = dependencies.fetch;
    this.keyring = dependencies.keyring ?? new NativeKeyring();
    this.interactive =
      dependencies.interactive ?? (process.stdin.isTTY && process.stderr.isTTY);
    this.confirm = dependencies.confirm ?? promptForConfirmation;
    this.config = new ConfigStore(configFilePath(this.env));
    this.tokens = new TokenResolver({
      env: this.env,
      input: dependencies.input ?? process.stdin,
      interactive: this.interactive,
      keyring: this.keyring,
      prompt: dependencies.promptToken ?? promptForToken,
    });
  }

  client(token?: string, timeoutMs?: number): DiscogsClient {
    return new DiscogsClient({
      baseUrl: resolveBaseUrl(this.env),
      userAgent: `Crateflow/${packageVersion} (local development)`,
      ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
      ...(token === undefined ? {} : { token }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  }

  async clientFor(command: Command, token?: string): Promise<DiscogsClient> {
    const config = await this.config.read();
    const verbose = command.optsWithGlobals<GlobalOptions>().verbose === true;
    return new DiscogsClient({
      baseUrl: resolveBaseUrl(this.env),
      userAgent: `Crateflow/${packageVersion} (local development)`,
      ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
      ...(token === undefined ? {} : { token }),
      timeoutMs: timeoutFor(command) ?? config.timeoutMs,
      request: {
        maxRateLimitWaitMs: config.maxRateLimitWaitMs,
        beforeRequest: async () => await this.#rateLimit.wait(),
        onRateLimit: (state) => this.#rateLimit.update(state),
        ...(verbose
          ? {
              onDiagnostic: (message: string) =>
                process.stderr.write(`[crateflow] ${message}\n`),
            }
          : {}),
      },
    });
  }

  async formatFor(
    command: Command,
    requested: OutputFormat,
    json: boolean | undefined,
    optionName = "format",
  ): Promise<OutputFormat> {
    if (json === true) return "json";
    if (command.getOptionValueSource(optionName) === "default") {
      return (await this.config.read()).format;
    }
    return requested;
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
