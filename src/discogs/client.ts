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
import {
  collectionAddResponseSchema,
  collectionFoldersResponseSchema,
  collectionItemsResponseSchema,
  collectionValueSchema,
  wantlistItemSchema,
  wantlistResponseSchema,
  type DiscogsCollectionFolder,
  type DiscogsCollectionItem,
  type DiscogsCollectionValue,
  type DiscogsWantlistItem,
} from "./user-schemas.js";

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

export interface CollectionListParameters extends PaginationParameters {
  sort?:
    | "label"
    | "artist"
    | "title"
    | "catno"
    | "format"
    | "rating"
    | "added"
    | "year";
  sort_order?: "asc" | "desc";
}

export interface UserItemUpdate {
  notes?: string;
  rating?: number;
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

  async getCollectionFolders(
    username: string,
  ): Promise<DiscogsCollectionFolder[]> {
    const response = await this.#getParsed(
      new URL(`${this.#userPath(username)}/collection/folders`, this.#baseUrl),
      collectionFoldersResponseSchema,
      "collection folders",
    );
    return response.folders;
  }

  async getCollectionItems(
    username: string,
    folderId: number,
    parameters: CollectionListParameters = {},
  ): Promise<DiscogsCollectionItem[]> {
    const response = await this.#getParsed(
      this.#parametersUrl(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}/releases`,
        parameters,
      ),
      collectionItemsResponseSchema,
      "collection items",
    );
    return response.releases;
  }

  getCollectionItemsAll(
    username: string,
    folderId: number,
    parameters: Omit<CollectionListParameters, "page"> = {},
  ): AsyncGenerator<DiscogsCollectionItem> {
    return this.#iteratePages(
      this.#parametersUrl(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}/releases`,
        parameters,
      ),
      collectionItemsResponseSchema,
      "collection items",
      (response) => response.releases,
    );
  }

  async getCollectionItemsByRelease(
    username: string,
    releaseId: number,
  ): Promise<DiscogsCollectionItem[]> {
    const response = await this.#getParsed(
      new URL(
        `${this.#userPath(username)}/collection/releases/${String(releaseId)}`,
        this.#baseUrl,
      ),
      collectionItemsResponseSchema,
      "collection release instances",
    );
    return response.releases;
  }

  async addToCollection(
    username: string,
    folderId: number,
    releaseId: number,
  ): Promise<{ instance_id: number; resource_url: string }> {
    return await this.#requestParsed(
      new URL(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}/releases/${String(releaseId)}`,
        this.#baseUrl,
      ),
      { method: "POST" },
      collectionAddResponseSchema,
      "a collection mutation",
    );
  }

  async updateCollectionInstance(
    username: string,
    folderId: number,
    releaseId: number,
    instanceId: number,
    update: { folder_id?: number; rating?: number },
  ): Promise<void> {
    await this.#requestParsed(
      new URL(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}/releases/${String(releaseId)}/instances/${String(instanceId)}`,
        this.#baseUrl,
      ),
      this.#jsonRequest("POST", update),
      z.undefined(),
      "a collection update",
    );
  }

  async removeCollectionInstance(
    username: string,
    folderId: number,
    releaseId: number,
    instanceId: number,
  ): Promise<void> {
    await this.#requestParsed(
      new URL(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}/releases/${String(releaseId)}/instances/${String(instanceId)}`,
        this.#baseUrl,
      ),
      { method: "DELETE" },
      z.undefined(),
      "a collection deletion",
    );
  }

  async getCollectionValue(username: string): Promise<DiscogsCollectionValue> {
    return await this.#getParsed(
      new URL(`${this.#userPath(username)}/collection/value`, this.#baseUrl),
      collectionValueSchema,
      "a collection value",
    );
  }

  async getWantlist(
    username: string,
    parameters: PaginationParameters = {},
  ): Promise<DiscogsWantlistItem[]> {
    const response = await this.#getParsed(
      this.#resourceListUrl(`${this.#userPath(username)}/wants`, parameters),
      wantlistResponseSchema,
      "wantlist items",
    );
    return response.wants;
  }

  getWantlistAll(
    username: string,
    parameters: Omit<PaginationParameters, "page"> = {},
  ): AsyncGenerator<DiscogsWantlistItem> {
    return this.#iteratePages(
      this.#resourceListUrl(`${this.#userPath(username)}/wants`, parameters),
      wantlistResponseSchema,
      "wantlist items",
      (response) => response.wants,
    );
  }

  async addToWantlist(
    username: string,
    releaseId: number,
    update: UserItemUpdate,
  ): Promise<DiscogsWantlistItem> {
    return await this.#mutateWantlist("PUT", username, releaseId, update);
  }

  async updateWantlistItem(
    username: string,
    releaseId: number,
    update: UserItemUpdate,
  ): Promise<DiscogsWantlistItem> {
    return await this.#mutateWantlist("POST", username, releaseId, update);
  }

  async removeWantlistItem(username: string, releaseId: number): Promise<void> {
    await this.#requestParsed(
      new URL(
        `${this.#userPath(username)}/wants/${String(releaseId)}`,
        this.#baseUrl,
      ),
      { method: "DELETE" },
      z.undefined(),
      "a wantlist deletion",
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
    return await this.#requestParsed(
      url,
      { method: "GET" },
      schema,
      description,
    );
  }

  async #requestParsed<T>(
    url: URL,
    init: RequestInit,
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
      {
        ...init,
        headers: { ...this.#headers(), ...headersRecord(init.headers) },
      },
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

  async #mutateWantlist(
    method: "PUT" | "POST",
    username: string,
    releaseId: number,
    update: UserItemUpdate,
  ): Promise<DiscogsWantlistItem> {
    const url = this.#parametersUrl(
      `${this.#userPath(username)}/wants/${String(releaseId)}`,
      update,
    );
    return await this.#requestParsed(
      url,
      { method },
      wantlistItemSchema,
      "a wantlist mutation",
    );
  }

  #jsonRequest(method: "POST" | "PUT", value: object): RequestInit {
    return {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
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

  #parametersUrl(pathname: string, parameters: object): URL {
    const url = new URL(pathname, this.#baseUrl);
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === "string" || typeof value === "number") {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  #userPath(username: string): string {
    return `/users/${encodeURIComponent(username)}`;
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

function headersRecord(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (headers === undefined) return {};
  return Object.fromEntries(new Headers(headers).entries());
}
