import type {
  CollectionListParameters,
  DiscogsClient,
} from "../discogs/client.js";
import type { DiscogsCollectionItem } from "../discogs/user-schemas.js";
import type {
  CollectionAddResult,
  CollectionFolder,
  CollectionItem,
  CollectionValue,
  MoneyValue,
} from "../domain/user-resource.js";
import { mapBasicInformation } from "./user-mappers.js";

export class CollectionService {
  readonly #client: DiscogsClient;

  constructor(client: DiscogsClient) {
    this.#client = client;
  }

  async folders(username: string): Promise<CollectionFolder[]> {
    return (await this.#client.getCollectionFolders(username)).map(
      (folder) => ({
        id: folder.id,
        name: folder.name,
        count: folder.count,
        resourceUrl: folder.resource_url,
      }),
    );
  }

  async list(
    username: string,
    folderId: number,
    parameters: CollectionListParameters,
  ): Promise<CollectionItem[]> {
    return (
      await this.#client.getCollectionItems(username, folderId, parameters)
    ).map((item) => this.#mapItem(item));
  }

  async *listAll(
    username: string,
    folderId: number,
    parameters: Omit<CollectionListParameters, "page">,
  ): AsyncGenerator<CollectionItem> {
    for await (const item of this.#client.getCollectionItemsAll(
      username,
      folderId,
      parameters,
    )) {
      yield this.#mapItem(item);
    }
  }

  async contains(
    username: string,
    releaseId: number,
  ): Promise<CollectionItem[]> {
    return (
      await this.#client.getCollectionItemsByRelease(username, releaseId)
    ).map((item) => this.#mapItem(item));
  }

  async add(
    username: string,
    folderId: number,
    releaseId: number,
  ): Promise<CollectionAddResult> {
    const result = await this.#client.addToCollection(
      username,
      folderId,
      releaseId,
    );
    return {
      releaseId,
      folderId,
      instanceId: result.instance_id,
      resourceUrl: result.resource_url,
    };
  }

  async update(
    username: string,
    folderId: number,
    releaseId: number,
    instanceId: number,
    update: { folder_id?: number; rating?: number },
  ): Promise<void> {
    await this.#client.updateCollectionInstance(
      username,
      folderId,
      releaseId,
      instanceId,
      update,
    );
  }

  async remove(
    username: string,
    folderId: number,
    releaseId: number,
    instanceId: number,
  ): Promise<void> {
    await this.#client.removeCollectionInstance(
      username,
      folderId,
      releaseId,
      instanceId,
    );
  }

  async value(username: string): Promise<CollectionValue> {
    const value = await this.#client.getCollectionValue(username);
    return {
      minimum: parseMoney(value.minimum),
      median: parseMoney(value.median),
      maximum: parseMoney(value.maximum),
    };
  }

  #mapItem(item: DiscogsCollectionItem): CollectionItem {
    return {
      ...mapBasicInformation(item.basic_information),
      instanceId: item.instance_id,
      folderId: item.folder_id,
      rating: item.rating,
      dateAdded: item.date_added ?? null,
      notes: item.notes.map((note) => ({
        fieldId: note.field_id,
        value: note.value,
      })),
    };
  }
}

function parseMoney(display: string): MoneyValue {
  const symbols: Record<string, string> = {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
  };
  const symbol = Object.keys(symbols).find((candidate) =>
    display.includes(candidate),
  );
  const normalized = display.replace(/[^0-9.,-]/gu, "").replaceAll(",", "");
  const parsed = Number(normalized);
  return {
    value: Number.isFinite(parsed) ? parsed : null,
    currency: symbol === undefined ? null : (symbols[symbol] ?? null),
    display,
  };
}
