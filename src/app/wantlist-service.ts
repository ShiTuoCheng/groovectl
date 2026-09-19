import type {
  DiscogsClient,
  PaginationParameters,
  UserItemUpdate,
} from "../discogs/client.js";
import type { DiscogsWantlistItem } from "../discogs/user-schemas.js";
import type { WantlistItem } from "../domain/user-resource.js";
import { mapBasicInformation } from "./user-mappers.js";

export class WantlistService {
  readonly #client: DiscogsClient;

  constructor(client: DiscogsClient) {
    this.#client = client;
  }

  async list(
    username: string,
    parameters: PaginationParameters,
  ): Promise<WantlistItem[]> {
    return (await this.#client.getWantlist(username, parameters)).map((item) =>
      this.#mapItem(item),
    );
  }

  async *listAll(
    username: string,
    parameters: Omit<PaginationParameters, "page">,
  ): AsyncGenerator<WantlistItem> {
    for await (const item of this.#client.getWantlistAll(
      username,
      parameters,
    )) {
      yield this.#mapItem(item);
    }
  }

  async add(
    username: string,
    releaseId: number,
    update: UserItemUpdate,
  ): Promise<WantlistItem> {
    return this.#mapItem(
      await this.#client.addToWantlist(username, releaseId, update),
    );
  }

  async update(
    username: string,
    releaseId: number,
    update: UserItemUpdate,
  ): Promise<WantlistItem> {
    return this.#mapItem(
      await this.#client.updateWantlistItem(username, releaseId, update),
    );
  }

  async remove(username: string, releaseId: number): Promise<void> {
    await this.#client.removeWantlistItem(username, releaseId);
  }

  #mapItem(item: DiscogsWantlistItem): WantlistItem {
    return {
      ...mapBasicInformation(item.basic_information),
      rating: item.rating,
      notes: item.notes ?? null,
    };
  }
}
