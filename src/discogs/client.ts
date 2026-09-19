import { z } from "zod";

import {
  requestJson,
  type FetchLike,
  type RequestOptions,
} from "../http/request.js";
import { AppError } from "../errors/app-error.js";
import {
  artistReleasesResponseSchema,
  artistSchema,
  labelReleasesResponseSchema,
  labelSchema,
  masterSchema,
  masterVersionsResponseSchema,
  type DiscogsArtist,
  type DiscogsArtistRelease,
  type DiscogsLabel,
  type DiscogsLabelRelease,
  type DiscogsMaster,
  type DiscogsMasterVersion,
} from "./database-schemas.js";
import {
  identitySchema,
  releaseSchema,
  searchResponseSchema,
  type DiscogsIdentity,
  type DiscogsRelease,
  type DiscogsSearchResponse,
  type DiscogsSearchResult,
} from "./schemas.js";

export interface DiscogsClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  request?: Omit<RequestOptions, "fetch" | "timeoutMs">;
  timeoutMs?: number;
  token?: string;
  userAgent: string;
}

export interface PaginationParameters {
  page?: number;
  per_page?: number;
}

export interface SearchParameters {
  q?: string;
  type?: "release" | "master" | "artist" | "label";
  title?: string;
  release_title?: string;
  credit?: string;
  artist?: string;
  anv?: string;
  label?: string;
  genre?: string;
  style?: string;
  country?: string;
  year?: string;
  format?: string;
  catno?: string;
  barcode?: string;
  track?: string;
  submitter?: string;
  contributor?: string;
  page?: number;
  per_page?: number;
}

export class DiscogsClient {
  readonly #baseUrl: URL;
  readonly #fetch: FetchLike | undefined;
  readonly #timeoutMs: number | undefined;
  readonly #request: Omit<RequestOptions, "fetch" | "timeoutMs">;
  readonly #token: string | undefined;
  readonly #userAgent: string;

  constructor(options: DiscogsClientOptions) {
    this.#baseUrl = new URL(options.baseUrl ?? "https://api.discogs.com");
    this.#fetch = options.fetch;
    this.#timeoutMs = options.timeoutMs;
    this.#request = options.request ?? {};
    this.#token = options.token;
    this.#userAgent = options.userAgent;
  }

  async getRelease(id: number): Promise<DiscogsRelease> {
    return await this.#getParsed(
      new URL(`/releases/${String(id)}`, this.#baseUrl),
      releaseSchema,
      "a release",
    );
  }

  async getMaster(id: number): Promise<DiscogsMaster> {
    return await this.#getParsed(
      new URL(`/masters/${String(id)}`, this.#baseUrl),
      masterSchema,
      "a master release",
    );
  }

  async getMasterVersions(
    id: number,
    parameters: PaginationParameters = {},
  ): Promise<DiscogsMasterVersion[]> {
    const response = await this.#getParsed(
      this.#resourceListUrl(`/masters/${String(id)}/versions`, parameters),
      masterVersionsResponseSchema,
      "master versions",
    );
    return response.versions;
  }

  getMasterVersionsAll(
    id: number,
    parameters: Omit<PaginationParameters, "page"> = {},
  ): AsyncGenerator<DiscogsMasterVersion> {
    return this.#iteratePages(
      this.#resourceListUrl(`/masters/${String(id)}/versions`, parameters),
      masterVersionsResponseSchema,
      "master versions",
      (response) => response.versions,
    );
  }

  async getArtist(id: number): Promise<DiscogsArtist> {
    return await this.#getParsed(
      new URL(`/artists/${String(id)}`, this.#baseUrl),
      artistSchema,
      "an artist",
    );
  }

  async getArtistReleases(
    id: number,
    parameters: PaginationParameters = {},
  ): Promise<DiscogsArtistRelease[]> {
    const response = await this.#getParsed(
      this.#resourceListUrl(`/artists/${String(id)}/releases`, parameters),
      artistReleasesResponseSchema,
      "artist releases",
    );
    return response.releases;
  }

  getArtistReleasesAll(
    id: number,
    parameters: Omit<PaginationParameters, "page"> = {},
  ): AsyncGenerator<DiscogsArtistRelease> {
    return this.#iteratePages(
      this.#resourceListUrl(`/artists/${String(id)}/releases`, parameters),
      artistReleasesResponseSchema,
      "artist releases",
      (response) => response.releases,
    );
  }

  async getLabel(id: number): Promise<DiscogsLabel> {
    return await this.#getParsed(
      new URL(`/labels/${String(id)}`, this.#baseUrl),
      labelSchema,
      "a label",
    );
  }

  async getLabelReleases(
    id: number,
    parameters: PaginationParameters = {},
  ): Promise<DiscogsLabelRelease[]> {
    const response = await this.#getParsed(
      this.#resourceListUrl(`/labels/${String(id)}/releases`, parameters),
      labelReleasesResponseSchema,
      "label releases",
    );
    return response.releases;
  }

  getLabelReleasesAll(
    id: number,
    parameters: Omit<PaginationParameters, "page"> = {},
  ): AsyncGenerator<DiscogsLabelRelease> {
    return this.#iteratePages(
      this.#resourceListUrl(`/labels/${String(id)}/releases`, parameters),
      labelReleasesResponseSchema,
      "label releases",
      (response) => response.releases,
    );
  }

  async getIdentity(): Promise<DiscogsIdentity> {
    return await this.#getParsed(
      new URL("/oauth/identity", this.#baseUrl),
      identitySchema,
      "identity",
    );
  }

  async search(parameters: SearchParameters): Promise<DiscogsSearchResponse> {
    const url = this.#searchUrl(parameters);
    return await this.#getParsed(url, searchResponseSchema, "search results");
  }

  async *searchAll(
    parameters: SearchParameters,
  ): AsyncGenerator<DiscogsSearchResult> {
    let url: URL | undefined = this.#searchUrl(parameters);
    while (url !== undefined) {
      const response = await this.#getParsed(
        url,
        searchResponseSchema,
        "search results",
      );
      yield* response.results;
      url = this.#nextUrl(response.pagination.urls.next);
    }
  }

  async #getParsed<T>(
    url: URL,
    schema: z.ZodType<T>,
    description: string,
  ): Promise<T> {
    const requestOptions: RequestOptions = {
      ...this.#request,
      ...(this.#fetch === undefined ? {} : { fetch: this.#fetch }),
      ...(this.#timeoutMs === undefined ? {} : { timeoutMs: this.#timeoutMs }),
    };
    const payload = await requestJson(
      url,
      { method: "GET", headers: this.#headers() },
      requestOptions,
    );
    try {
      return schema.parse(payload);
    } catch (cause: unknown) {
      if (!(cause instanceof z.ZodError)) throw cause;
      throw new AppError({
        kind: "upstream",
        code: "CRATEFLOW_RESPONSE_SCHEMA_MISMATCH",
        message: `Discogs returned ${description} in an unsupported format.`,
        cause,
      });
    }
  }

  async *#iteratePages<TResponse, TItem>(
    initialUrl: URL,
    schema: z.ZodType<TResponse>,
    description: string,
    items: (response: TResponse) => readonly TItem[],
  ): AsyncGenerator<TItem> {
    let url: URL | undefined = initialUrl;
    while (url !== undefined) {
      const response = await this.#getParsed(url, schema, description);
      yield* items(response);
      const pagination = response as {
        pagination: { urls: { next?: string } };
      };
      url = this.#nextUrl(pagination.pagination.urls.next);
    }
  }

  #headers(): Record<string, string> {
    return {
      Accept: "application/vnd.discogs.v2.discogs+json",
      "User-Agent": this.#userAgent,
      ...(this.#token === undefined
        ? {}
        : { Authorization: `Discogs token=${this.#token}` }),
    };
  }

  #searchUrl(parameters: SearchParameters): URL {
    const url = new URL("/database/search", this.#baseUrl);
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  #resourceListUrl(pathname: string, parameters: PaginationParameters): URL {
    const url = new URL(pathname, this.#baseUrl);
    if (parameters.page !== undefined) {
      url.searchParams.set("page", String(parameters.page));
    }
    if (parameters.per_page !== undefined) {
      url.searchParams.set("per_page", String(parameters.per_page));
    }
    return url;
  }

  #nextUrl(value: string | undefined): URL | undefined {
    if (value === undefined) return undefined;
    const url = new URL(value);
    if (url.origin !== this.#baseUrl.origin) {
      throw new AppError({
        kind: "upstream",
        code: "CRATEFLOW_UNSAFE_PAGINATION_URL",
        message: "Discogs returned a pagination URL for an unexpected host.",
      });
    }
    return url;
  }
}
