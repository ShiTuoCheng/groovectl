import { NativeKeyring } from "../auth/keyring.js";
import { promptForConfirmation, promptForToken } from "../auth/prompt.js";
import { TokenResolver, type Keyring } from "../auth/token-provider.js";
import { DiscogsClient } from "../discogs/client.js";
import { MarketplaceOffers } from "../app/marketplace-offers.js";
import { configFilePath } from "../config/paths.js";
import { ConfigStore } from "../config/store.js";
import { AppError } from "../errors/app-error.js";
import { RateLimitGate } from "../http/rate-limit.js";
import type { FetchLike } from "../http/request.js";
import type { OutputFormat, WritableOutput } from "../output/records.js";
import { packageVersion } from "../version.js";
import type { ErrorFormat, GlobalOptions } from "./global-options.js";
import { timeoutFor } from "./global-options.js";
import type { Command } from "commander";

const userAgent = `Groovectl/${packageVersion} (+https://github.com/ShiTuoCheng/groovectl)`;

export interface RuntimeDependencies {
  env?: NodeJS.ProcessEnv;
  errorFormat?: ErrorFormat;
  fetch?: FetchLike;
  input?: AsyncIterable<string | Uint8Array>;
  interactive?: boolean;
  keyring?: Keyring;
  promptToken?: () => Promise<string>;
  confirm?: (message: string) => Promise<boolean>;
  stderr?: WritableOutput;
}

export class CliRuntime {
  readonly env: NodeJS.ProcessEnv;
  readonly errorFormat: ErrorFormat;
  readonly keyring: Keyring;
  readonly tokens: TokenResolver;
  readonly interactive: boolean;
  readonly confirm: (message: string) => Promise<boolean>;
  readonly config: ConfigStore;
  readonly #rateLimit = new RateLimitGate();
  readonly #fetch: FetchLike | undefined;
  readonly #stderr: WritableOutput;

  constructor(dependencies: RuntimeDependencies = {}) {
    this.env = dependencies.env ?? process.env;
    this.errorFormat = dependencies.errorFormat ?? "text";
    this.#fetch = dependencies.fetch;
    this.#stderr = dependencies.stderr ?? process.stderr;
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

  async clientFor(command: Command, token?: string): Promise<DiscogsClient> {
    const config = await this.config.read();
    const verbose = command.optsWithGlobals<GlobalOptions>().verbose === true;
    return new DiscogsClient({
      baseUrl: resolveBaseUrl(this.env),
      userAgent,
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
                this.#stderr.write(`[groovectl] ${message}\n`),
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

  async marketplaceOffersFor(command: Command): Promise<MarketplaceOffers> {
    const config = await this.config.read();
    const verbose = command.optsWithGlobals<GlobalOptions>().verbose === true;
    return new MarketplaceOffers(
      this.#fetch,
      timeoutFor(command) ?? config.timeoutMs,
      verbose
        ? (message: string) => this.#stderr.write(`[groovectl] ${message}\n`)
        : undefined,
    );
  }
}

function resolveBaseUrl(env: NodeJS.ProcessEnv): string {
  const override = env.GROOVECTL_API_BASE_URL ?? env.CRATEFLOW_API_BASE_URL;
  if (override === undefined) {
    return "https://api.discogs.com";
  }
  if (env.NODE_ENV !== "test") {
    throw new AppError({
      kind: "usage",
      code: "GROOVECTL_UNSAFE_BASE_URL",
      message: "API base URL overrides are only allowed when NODE_ENV=test.",
    });
  }
  return override;
}
