import { z } from "zod";

import { requestJson, type FetchLike } from "../http/request.js";
import { AppError } from "../errors/app-error.js";
import { releaseSchema, type DiscogsRelease } from "./schemas.js";

export interface DiscogsClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  userAgent: string;
}

export class DiscogsClient {
  readonly #baseUrl: URL;
  readonly #fetch: FetchLike | undefined;
  readonly #timeoutMs: number | undefined;
  readonly #userAgent: string;

  constructor(options: DiscogsClientOptions) {
    this.#baseUrl = new URL(options.baseUrl ?? "https://api.discogs.com");
    this.#fetch = options.fetch;
    this.#timeoutMs = options.timeoutMs;
    this.#userAgent = options.userAgent;
  }

  async getRelease(id: number): Promise<DiscogsRelease> {
    const url = new URL(`/releases/${String(id)}`, this.#baseUrl);
    const requestOptions = {
      ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
      ...(this.#timeoutMs === undefined ? {} : { timeoutMs: this.#timeoutMs }),
    };
    const payload = await requestJson(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.discogs.v2.discogs+json",
          "User-Agent": this.#userAgent,
        },
      },
      requestOptions,
    );

    try {
      return releaseSchema.parse(payload);
    } catch (cause: unknown) {
      if (!(cause instanceof z.ZodError)) {
        throw cause;
      }
      throw new AppError({
        kind: "upstream",
        code: "CRATEFLOW_RESPONSE_SCHEMA_MISMATCH",
        message: "Discogs returned a release in an unsupported format.",
        cause,
      });
    }
  }
}
