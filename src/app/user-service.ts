import type { DiscogsClient, PaginationParameters } from "../discogs/client.js";
import type { DiscogsUserListSummary } from "../discogs/user-schemas.js";
import type {
  UserListDetail,
  UserListSummary,
  UserProfile,
} from "../domain/user-resource.js";

export class UserService {
  readonly #client: DiscogsClient;

  constructor(client: DiscogsClient) {
    this.#client = client;
  }

  async getProfile(username: string): Promise<UserProfile> {
    const value = await this.#client.getUserProfile(username);
    return {
      id: value.id,
      username: value.username,
      name: value.name ?? null,
      profile: value.profile ?? null,
      location: value.location ?? null,
      homePage: value.home_page ?? null,
      registered: value.registered ?? null,
      numCollection: value.num_collection ?? null,
      numWantlist: value.num_wantlist ?? null,
      numForSale: value.num_for_sale ?? null,
      numLists: value.num_lists ?? null,
      releasesContributed: value.releases_contributed ?? null,
      releasesRated: value.releases_rated ?? null,
      ratingAverage: value.rating_avg ?? null,
      currency: value.curr_abbr ?? null,
      buyerRating: value.buyer_rating ?? null,
      buyerNumRatings: value.buyer_num_ratings ?? null,
      sellerRating: value.seller_rating ?? null,
      sellerNumRatings: value.seller_num_ratings ?? null,
      url:
        value.uri === undefined || value.uri === ""
          ? `https://www.discogs.com/user/${encodeURIComponent(value.username)}`
          : new URL(value.uri, "https://www.discogs.com").toString(),
      resourceUrl: value.resource_url,
    };
  }

  async getLists(
    username: string,
    parameters: PaginationParameters,
  ): Promise<UserListSummary[]> {
    return (await this.#client.getUserLists(username, parameters)).map((item) =>
      this.#mapSummary(item),
    );
  }

  async *getListsAll(
    username: string,
    parameters: Omit<PaginationParameters, "page">,
  ): AsyncGenerator<UserListSummary> {
    for await (const item of this.#client.getUserListsAll(
      username,
      parameters,
    )) {
      yield this.#mapSummary(item);
    }
  }

  async getList(listId: number): Promise<UserListDetail> {
    const value = await this.#client.getList(listId);
    return {
      ...this.#mapSummary(value),
      items: value.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.display_title ?? item.title ?? "",
        comment: item.comment ?? null,
        url:
          item.uri === undefined || item.uri === ""
            ? `https://www.discogs.com/${item.type}/${String(item.id)}`
            : new URL(item.uri, "https://www.discogs.com").toString(),
        resourceUrl: item.resource_url ?? null,
      })),
    };
  }

  #mapSummary(value: DiscogsUserListSummary): UserListSummary {
    return {
      id: value.id,
      name: value.name,
      description: value.description ?? null,
      public: value.public ?? null,
      dateAdded: value.date_added ?? null,
      dateChanged: value.date_changed ?? null,
      url:
        value.uri === undefined || value.uri === ""
          ? `https://www.discogs.com/lists/${String(value.id)}`
          : new URL(value.uri, "https://www.discogs.com").toString(),
      resourceUrl: value.resource_url,
    };
  }
}
