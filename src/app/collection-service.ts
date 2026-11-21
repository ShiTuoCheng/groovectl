import type {
  CollectionListParameters,
  DiscogsClient,
} from "../discogs/client.js";
import type { DiscogsCollectionItem } from "../discogs/user-schemas.js";
import type {
  CollectionAddResult,
  CollectionField,
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
    return (await this.#client.getCollectionFolders(username)).map((folder) =>
      this.#mapFolder(folder),
    );
  }

  async getFolder(
    username: string,
    folderId: number,
  ): Promise<CollectionFolder> {
    return this.#mapFolder(
      await this.#client.getCollectionFolder(username, folderId),
    );
  }

  async createFolder(
    username: string,
    name: string,
  ): Promise<CollectionFolder> {
    return this.#mapFolder(
      await this.#client.createCollectionFolder(username, name),
    );
  }

  async renameFolder(
    username: string,
    folderId: number,
    name: string,
  ): Promise<CollectionFolder> {
    return this.#mapFolder(
      await this.#client.updateCollectionFolder(username, folderId, name),
    );
  }

  async deleteFolder(username: string, folderId: number): Promise<void> {
    await this.#client.deleteCollectionFolder(username, folderId);
  }

  async fields(username: string): Promise<CollectionField[]> {
    return (await this.#client.getCollectionFields(username)).map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      position: field.position,
      public: field.public ?? null,
      lines: field.lines ?? null,
      options: field.options,
    }));
  }

  async setField(
    username: string,
    folderId: number,
    releaseId: number,
    instanceId: number,
    fieldId: number,
    value: string,
  ): Promise<void> {
    await this.#client.setCollectionInstanceField(
      username,
      folderId,
      releaseId,
      instanceId,
      fieldId,
      value,
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

  #mapFolder(folder: {
    id: number;
    name: string;
    count: number;
    resource_url: string;
  }): CollectionFolder {
    return {
      id: folder.id,
      name: folder.name,
      count: folder.count,
      resourceUrl: folder.resource_url,
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

const currencyTokens: ReadonlyArray<readonly [string, string]> = [
  ["CA$", "CAD"],
  ["AU$", "AUD"],
  ["A$", "AUD"],
  ["NZ$", "NZD"],
  ["MX$", "MXN"],
  ["R$", "BRL"],
  ["US$", "USD"],
  ["CHF", "CHF"],
  ["SEK", "SEK"],
  ["ZAR", "ZAR"],
  ["CAD", "CAD"],
  ["AUD", "AUD"],
  ["NZD", "NZD"],
  ["MXN", "MXN"],
  ["BRL", "BRL"],
  ["USD", "USD"],
  ["EUR", "EUR"],
  ["GBP", "GBP"],
  ["JPY", "JPY"],
  ["€", "EUR"],
  ["£", "GBP"],
  ["¥", "JPY"],
];

function parseMoney(display: string): MoneyValue {
  const matched = currencyTokens.find(([token]) =>
    display.includes(token),
  )?.[1];
  const currency = matched ?? (/(?<![A-Za-z])\$/u.test(display) ? "USD" : null);
  const normalized = display.replace(/[^0-9.,-]/gu, "").replaceAll(",", "");
  const parsed = /^-?\d+(?:\.\d+)?$/u.test(normalized)
    ? Number(normalized)
    : Number.NaN;
  return {
    value: Number.isFinite(parsed) ? parsed : null,
    currency,
    display,
  };
}
