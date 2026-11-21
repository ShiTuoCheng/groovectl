import { z } from "zod";

import {
  requestJson,
  type FetchLike,
  type RequestOptions,
} from "../http/request.js";
import { AppError } from "../errors/app-error.js";
import type {
  MarketplaceCurrency,
  MarketplaceInventorySort,
  MarketplaceListingStatus,
  MarketplaceOrderSort,
} from "../domain/marketplace.js";
import {
  marketplaceCreateListingResponseSchema,
  marketplaceInventoryResponseSchema,
  marketplaceListingSchema,
  marketplaceOrderMessageSchema,
  marketplaceOrderMessagesResponseSchema,
  marketplaceOrderSchema,
  marketplaceOrdersResponseSchema,
  marketplaceOwnedListingSchema,
  marketplacePriceSuggestionsSchema,
  marketplaceStatsSchema,
  moneySchema,
  type DiscogsMarketplaceInventoryListing,
  type DiscogsMarketplaceOrder,
  type DiscogsMarketplaceOrderMessage,
} from "./marketplace-schemas.js";
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
  releaseCommunityRatingSchema,
  releaseSchema,
  releaseUserRatingSchema,
  searchResponseSchema,
  type DiscogsIdentity,
  type DiscogsRelease,
  type DiscogsReleaseCommunityRating,
  type DiscogsReleaseUserRating,
  type DiscogsSearchResponse,
  type DiscogsSearchResult,
} from "./schemas.js";
import {
  collectionAddResponseSchema,
  collectionFieldsResponseSchema,
  collectionFolderSchema,
  collectionFoldersResponseSchema,
  collectionItemsResponseSchema,
  collectionValueSchema,
  userListDetailSchema,
  userListsResponseSchema,
  userProfileSchema,
  wantlistItemSchema,
  wantlistResponseSchema,
  type DiscogsCollectionField,
  type DiscogsCollectionFolder,
  type DiscogsCollectionItem,
  type DiscogsCollectionValue,
  type DiscogsUserListDetail,
  type DiscogsUserListSummary,
  type DiscogsUserProfile,
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

export interface MasterVersionsParameters extends PaginationParameters {
  format?: string;
  label?: string;
  released?: string;
  country?: string;
  sort?: "released" | "title" | "format" | "label" | "catno" | "country";
  sort_order?: "asc" | "desc";
}

export interface ArtistReleasesParameters extends PaginationParameters {
  sort?: "year" | "title" | "format";
  sort_order?: "asc" | "desc";
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

export interface MarketplaceInventoryParameters extends PaginationParameters {
  status?: MarketplaceListingStatus;
  sort?: MarketplaceInventorySort;
  sort_order?: "asc" | "desc";
}

export interface MarketplaceListingWritePayload {
  release_id: number;
  condition: string;
  sleeve_condition?: string;
  price: number;
  comments?: string;
  allow_offers?: boolean;
  status: "For Sale" | "Draft";
  external_id?: string;
  location?: string;
  weight?: number;
  format_quantity?: number;
}

export interface MarketplaceOrdersParameters extends PaginationParameters {
  status?: string;
  created_after?: string;
  created_before?: string;
  archived?: boolean;
  sort?: MarketplaceOrderSort;
  sort_order?: "asc" | "desc";
}

export interface MarketplaceOrderUpdatePayload {
  status?: string;
  shipping?: number;
}

export interface MarketplaceOrderMessagePayload {
  message?: string;
  status?: string;
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

  async getMarketplaceStats(id: number, currency?: MarketplaceCurrency) {
    return await this.#getParsed(
      this.#parametersUrl(`/marketplace/stats/${String(id)}`, {
        curr_abbr: currency,
      }),
      marketplaceStatsSchema,
      "marketplace statistics",
    );
  }

  async getMarketplaceListing(id: number, currency?: MarketplaceCurrency) {
    return await this.#getParsed(
      this.#parametersUrl(`/marketplace/listings/${String(id)}`, {
        curr_abbr: currency,
      }),
      marketplaceListingSchema,
      "a marketplace listing",
    );
  }

  async getMarketplaceListingForEdit(id: number) {
    return await this.#getParsed(
      new URL(`/marketplace/listings/${String(id)}`, this.#baseUrl),
      marketplaceOwnedListingSchema,
      "a marketplace listing",
    );
  }

  async getMarketplaceFee(price: string, currency?: MarketplaceCurrency) {
    const suffix = currency === undefined ? "" : `/${currency}`;
    return await this.#getParsed(
      new URL(
        `/marketplace/fee/${encodeURIComponent(price)}${suffix}`,
        this.#baseUrl,
      ),
      moneySchema,
      "a marketplace fee",
    );
  }

  async getMarketplacePriceSuggestions(releaseId: number) {
    return await this.#getParsed(
      new URL(
        `/marketplace/price_suggestions/${String(releaseId)}`,
        this.#baseUrl,
      ),
      marketplacePriceSuggestionsSchema,
      "marketplace price suggestions",
    );
  }

  async getMarketplaceInventory(
    username: string,
    parameters: MarketplaceInventoryParameters = {},
  ): Promise<DiscogsMarketplaceInventoryListing[]> {
    const response = await this.#getParsed(
      this.#parametersUrl(`${this.#userPath(username)}/inventory`, parameters),
      marketplaceInventoryResponseSchema,
      "marketplace inventory",
    );
    return response.listings;
  }

  getMarketplaceInventoryAll(
    username: string,
    parameters: Omit<MarketplaceInventoryParameters, "page"> = {},
  ): AsyncGenerator<DiscogsMarketplaceInventoryListing> {
    return this.#iteratePages(
      this.#parametersUrl(`${this.#userPath(username)}/inventory`, parameters),
      marketplaceInventoryResponseSchema,
      "marketplace inventory",
      (response) => response.listings,
    );
  }

  async createMarketplaceListing(
    payload: MarketplaceListingWritePayload,
  ): Promise<{ listing_id: number; resource_url: string }> {
    return await this.#requestParsed(
      new URL("/marketplace/listings", this.#baseUrl),
      this.#jsonRequest("POST", payload),
      marketplaceCreateListingResponseSchema,
      "a marketplace listing creation",
    );
  }

  async updateMarketplaceListing(
    listingId: number,
    payload: MarketplaceListingWritePayload,
  ): Promise<void> {
    await this.#requestParsed(
      new URL(`/marketplace/listings/${String(listingId)}`, this.#baseUrl),
      this.#jsonRequest("POST", payload),
      z.undefined(),
      "a marketplace listing update",
    );
  }

  async deleteMarketplaceListing(listingId: number): Promise<void> {
    await this.#requestParsed(
      new URL(`/marketplace/listings/${String(listingId)}`, this.#baseUrl),
      { method: "DELETE" },
      z.undefined(),
      "a marketplace listing deletion",
    );
  }

  async getMarketplaceOrders(
    parameters: MarketplaceOrdersParameters = {},
  ): Promise<DiscogsMarketplaceOrder[]> {
    const response = await this.#getParsed(
      this.#parametersUrl("/marketplace/orders", parameters),
      marketplaceOrdersResponseSchema,
      "marketplace orders",
    );
    return response.orders;
  }

  getMarketplaceOrdersAll(
    parameters: Omit<MarketplaceOrdersParameters, "page"> = {},
  ): AsyncGenerator<DiscogsMarketplaceOrder> {
    return this.#iteratePages(
      this.#parametersUrl("/marketplace/orders", parameters),
      marketplaceOrdersResponseSchema,
      "marketplace orders",
      (response) => response.orders,
    );
  }

  async getMarketplaceOrder(orderId: string): Promise<DiscogsMarketplaceOrder> {
    return await this.#getParsed(
      new URL(
        `/marketplace/orders/${encodeURIComponent(orderId)}`,
        this.#baseUrl,
      ),
      marketplaceOrderSchema,
      "a marketplace order",
    );
  }

  async updateMarketplaceOrder(
    orderId: string,
    payload: MarketplaceOrderUpdatePayload,
  ): Promise<DiscogsMarketplaceOrder> {
    return await this.#requestParsed(
      new URL(
        `/marketplace/orders/${encodeURIComponent(orderId)}`,
        this.#baseUrl,
      ),
      this.#jsonRequest("POST", payload),
      marketplaceOrderSchema,
      "a marketplace order update",
    );
  }

  async getMarketplaceOrderMessages(
    orderId: string,
    parameters: PaginationParameters = {},
  ): Promise<DiscogsMarketplaceOrderMessage[]> {
    const response = await this.#getParsed(
      this.#resourceListUrl(
        `/marketplace/orders/${encodeURIComponent(orderId)}/messages`,
        parameters,
      ),
      marketplaceOrderMessagesResponseSchema,
      "marketplace order messages",
    );
    return response.messages;
  }

  getMarketplaceOrderMessagesAll(
    orderId: string,
    parameters: Omit<PaginationParameters, "page"> = {},
  ): AsyncGenerator<DiscogsMarketplaceOrderMessage> {
    return this.#iteratePages(
      this.#resourceListUrl(
        `/marketplace/orders/${encodeURIComponent(orderId)}/messages`,
        parameters,
      ),
      marketplaceOrderMessagesResponseSchema,
      "marketplace order messages",
      (response) => response.messages,
    );
  }

  async addMarketplaceOrderMessage(
    orderId: string,
    payload: MarketplaceOrderMessagePayload,
  ): Promise<DiscogsMarketplaceOrderMessage> {
    return await this.#requestParsed(
      new URL(
        `/marketplace/orders/${encodeURIComponent(orderId)}/messages`,
        this.#baseUrl,
      ),
      this.#jsonRequest("POST", payload),
      marketplaceOrderMessageSchema,
      "a marketplace order message",
    );
  }

  async getRelease(
    id: number,
    currency?: MarketplaceCurrency,
  ): Promise<DiscogsRelease> {
    return await this.#getParsed(
      this.#parametersUrl(`/releases/${String(id)}`, { curr_abbr: currency }),
      releaseSchema,
      "a release",
    );
  }

  async getReleaseCommunityRating(
    id: number,
  ): Promise<DiscogsReleaseCommunityRating> {
    return await this.#getParsed(
      new URL(`/releases/${String(id)}/rating`, this.#baseUrl),
      releaseCommunityRatingSchema,
      "a release community rating",
    );
  }

  async getReleaseUserRating(
    id: number,
    username: string,
  ): Promise<DiscogsReleaseUserRating> {
    return await this.#getParsed(
      new URL(
        `/releases/${String(id)}/rating/${encodeURIComponent(username)}`,
        this.#baseUrl,
      ),
      releaseUserRatingSchema,
      "a release user rating",
    );
  }

  async setReleaseRating(
    id: number,
    username: string,
    rating: number,
  ): Promise<DiscogsReleaseUserRating> {
    return await this.#requestParsed(
      new URL(
        `/releases/${String(id)}/rating/${encodeURIComponent(username)}`,
        this.#baseUrl,
      ),
      this.#jsonRequest("PUT", { rating }),
      releaseUserRatingSchema,
      "a release rating update",
    );
  }

  async deleteReleaseRating(id: number, username: string): Promise<void> {
    await this.#requestParsed(
      new URL(
        `/releases/${String(id)}/rating/${encodeURIComponent(username)}`,
        this.#baseUrl,
      ),
      { method: "DELETE" },
      z.undefined(),
      "a release rating deletion",
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
    parameters: MasterVersionsParameters = {},
  ): Promise<DiscogsMasterVersion[]> {
    const response = await this.#getParsed(
      this.#parametersUrl(`/masters/${String(id)}/versions`, parameters),
      masterVersionsResponseSchema,
      "master versions",
    );
    return response.versions;
  }

  getMasterVersionsAll(
    id: number,
    parameters: Omit<MasterVersionsParameters, "page"> = {},
  ): AsyncGenerator<DiscogsMasterVersion> {
    return this.#iteratePages(
      this.#parametersUrl(`/masters/${String(id)}/versions`, parameters),
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
    parameters: ArtistReleasesParameters = {},
  ): Promise<DiscogsArtistRelease[]> {
    const response = await this.#getParsed(
      this.#parametersUrl(`/artists/${String(id)}/releases`, parameters),
      artistReleasesResponseSchema,
      "artist releases",
    );
    return response.releases;
  }

  getArtistReleasesAll(
    id: number,
    parameters: Omit<ArtistReleasesParameters, "page"> = {},
  ): AsyncGenerator<DiscogsArtistRelease> {
    return this.#iteratePages(
      this.#parametersUrl(`/artists/${String(id)}/releases`, parameters),
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

  async getCollectionFolder(
    username: string,
    folderId: number,
  ): Promise<DiscogsCollectionFolder> {
    return await this.#getParsed(
      new URL(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}`,
        this.#baseUrl,
      ),
      collectionFolderSchema,
      "a collection folder",
    );
  }

  async createCollectionFolder(
    username: string,
    name: string,
  ): Promise<DiscogsCollectionFolder> {
    return await this.#requestParsed(
      new URL(`${this.#userPath(username)}/collection/folders`, this.#baseUrl),
      this.#jsonRequest("POST", { name }),
      collectionFolderSchema,
      "a collection folder creation",
    );
  }

  async updateCollectionFolder(
    username: string,
    folderId: number,
    name: string,
  ): Promise<DiscogsCollectionFolder> {
    return await this.#requestParsed(
      new URL(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}`,
        this.#baseUrl,
      ),
      this.#jsonRequest("POST", { name }),
      collectionFolderSchema,
      "a collection folder update",
    );
  }

  async deleteCollectionFolder(
    username: string,
    folderId: number,
  ): Promise<void> {
    await this.#requestParsed(
      new URL(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}`,
        this.#baseUrl,
      ),
      { method: "DELETE" },
      z.undefined(),
      "a collection folder deletion",
    );
  }

  async getCollectionFields(
    username: string,
  ): Promise<DiscogsCollectionField[]> {
    const response = await this.#getParsed(
      new URL(`${this.#userPath(username)}/collection/fields`, this.#baseUrl),
      collectionFieldsResponseSchema,
      "collection fields",
    );
    return response.fields;
  }

  async setCollectionInstanceField(
    username: string,
    folderId: number,
    releaseId: number,
    instanceId: number,
    fieldId: number,
    value: string,
  ): Promise<void> {
    await this.#requestParsed(
      new URL(
        `${this.#userPath(username)}/collection/folders/${String(folderId)}/releases/${String(releaseId)}/instances/${String(instanceId)}/fields/${String(fieldId)}`,
        this.#baseUrl,
      ),
      this.#jsonRequest("POST", { value }),
      z.undefined(),
      "a collection field update",
    );
  }

  async getUserProfile(username: string): Promise<DiscogsUserProfile> {
    return await this.#getParsed(
      new URL(this.#userPath(username), this.#baseUrl),
      userProfileSchema,
      "a user profile",
    );
  }

  async getUserLists(
    username: string,
    parameters: PaginationParameters = {},
  ): Promise<DiscogsUserListSummary[]> {
    const response = await this.#getParsed(
      this.#resourceListUrl(`${this.#userPath(username)}/lists`, parameters),
      userListsResponseSchema,
      "user lists",
    );
    return response.lists;
  }

  getUserListsAll(
    username: string,
    parameters: Omit<PaginationParameters, "page"> = {},
  ): AsyncGenerator<DiscogsUserListSummary> {
    return this.#iteratePages(
      this.#resourceListUrl(`${this.#userPath(username)}/lists`, parameters),
      userListsResponseSchema,
      "user lists",
      (response) => response.lists,
    );
  }

  async getList(listId: number): Promise<DiscogsUserListDetail> {
    return await this.#getParsed(
      new URL(`/lists/${String(listId)}`, this.#baseUrl),
      userListDetailSchema,
      "a list",
    );
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

  searchAll(parameters: SearchParameters): AsyncGenerator<DiscogsSearchResult> {
    return this.#iteratePages(
      this.#searchUrl(parameters),
      searchResponseSchema,
      "search results",
      (response) => response.results,
    );
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
        code: "GROOVECTL_RESPONSE_SCHEMA_MISMATCH",
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
    const visited = new Set<string>([initialUrl.href]);
    let url: URL | undefined = initialUrl;
    while (url !== undefined) {
      const response = await this.#getParsed(url, schema, description);
      yield* items(response);
      const pagination = response as {
        pagination: { urls: { next?: string | null | undefined } };
      };
      const next = this.#nextUrl(pagination.pagination.urls.next);
      if (next !== undefined) {
        if (visited.has(next.href)) {
          throw new AppError({
            kind: "upstream",
            code: "GROOVECTL_PAGINATION_INVALID",
            message: "Discogs returned a repeated pagination URL.",
          });
        }
        visited.add(next.href);
      }
      url = next;
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
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  #userPath(username: string): string {
    return `/users/${encodeURIComponent(username)}`;
  }

  #nextUrl(value: string | null | undefined): URL | undefined {
    if (value == null) return undefined;
    const url = new URL(value);
    if (url.origin !== this.#baseUrl.origin) {
      throw new AppError({
        kind: "upstream",
        code: "GROOVECTL_UNSAFE_PAGINATION_URL",
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
