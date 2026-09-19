import { AppError } from "../errors/app-error.js";

export type AuthPolicy =
  "anonymous_allowed" | "token_optional" | "token_required";
export type TokenSource = "stdin" | "environment" | "keyring" | "prompt";

export interface ResolvedToken {
  token: string;
  source: TokenSource;
}

export interface Keyring {
  get(): Promise<string | undefined>;
  set(token: string): Promise<void>;
  delete(): Promise<boolean>;
}

export interface TokenRequest {
  policy: AuthPolicy;
  tokenStdin: boolean;
  forcePrompt: boolean;
}

export interface TokenResolverOptions {
  env: NodeJS.ProcessEnv;
  input: AsyncIterable<string | Uint8Array>;
  interactive: boolean;
  keyring: Keyring;
  prompt: () => Promise<string>;
}

export class TokenResolver {
  readonly #env: NodeJS.ProcessEnv;
  readonly #input: AsyncIterable<string | Uint8Array>;
  readonly #interactive: boolean;
  readonly #keyring: Keyring;
  readonly #prompt: () => Promise<string>;

  constructor(options: TokenResolverOptions) {
    this.#env = options.env;
    this.#input = options.input;
    this.#interactive = options.interactive;
    this.#keyring = options.keyring;
    this.#prompt = options.prompt;
  }

  async resolve(request: TokenRequest): Promise<ResolvedToken | undefined> {
    if (request.tokenStdin) {
      return {
        token: normalizeToken(await readAll(this.#input), "stdin"),
        source: "stdin",
      };
    }
    const environmentToken = this.#env.DISCOGS_TOKEN;
    if (environmentToken !== undefined) {
      return {
        token: normalizeToken(environmentToken, "environment"),
        source: "environment",
      };
    }
    if (request.forcePrompt) {
      return { token: await this.#promptSecurely(), source: "prompt" };
    }
    try {
      const savedToken = await this.#keyring.get();
      if (savedToken !== undefined) {
        return {
          token: normalizeToken(savedToken, "keyring"),
          source: "keyring",
        };
      }
    } catch {
      if (request.policy === "token_required") {
        return { token: await this.#promptSecurely(), source: "prompt" };
      }
    }
    if (request.policy === "token_required") {
      return { token: await this.#promptSecurely(), source: "prompt" };
    }
    return undefined;
  }

  async #promptSecurely(): Promise<string> {
    if (!this.#interactive) {
      throw new AppError({
        kind: "auth_required",
        code: "CRATEFLOW_AUTH_REQUIRED",
        message: "This command requires a Discogs User Token.",
        remediation:
          "Use --token-stdin, DISCOGS_TOKEN, auth login, or run in an interactive terminal with --token.",
      });
    }
    return normalizeToken(await this.#prompt(), "prompt");
  }
}

function normalizeToken(value: string, source: TokenSource): string {
  const token = value.trim();
  if (token.length === 0) {
    throw new AppError({
      kind: "auth_invalid",
      code: "CRATEFLOW_TOKEN_EMPTY",
      message: `The token read from ${source} was empty.`,
    });
  }
  return token;
}

async function readAll(
  input: AsyncIterable<string | Uint8Array>,
): Promise<string> {
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  for await (const chunk of input) {
    chunks.push(
      typeof chunk === "string"
        ? chunk
        : decoder.decode(chunk, { stream: true }),
    );
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

export function keyringUnavailable(cause: unknown): AppError {
  return new AppError({
    kind: "upstream",
    code: "CRATEFLOW_KEYRING_UNAVAILABLE",
    message: "The operating system credential store is unavailable.",
    remediation: "Use --token-stdin or DISCOGS_TOKEN for a temporary token.",
    cause,
  });
}
