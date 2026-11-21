import type {
  DiscogsClient,
  MarketplaceInventoryParameters,
  MarketplaceListingWritePayload,
  MarketplaceOrderMessagePayload,
  MarketplaceOrderUpdatePayload,
  MarketplaceOrdersParameters,
  PaginationParameters,
} from "../discogs/client.js";
import type {
  DiscogsMarketplaceInventoryListing,
  DiscogsMarketplaceOrder,
  DiscogsMarketplaceOrderMessage,
} from "../discogs/marketplace-schemas.js";
import { AppError } from "../errors/app-error.js";
import {
  mediaConditionLabels,
  mediaGrades,
  type MarketplaceCurrency,
  type MarketplaceFee,
  type MarketplaceInventoryItem,
  type MarketplaceListing,
  type MarketplaceListingMutationResult,
  type MarketplaceOrder,
  type MarketplaceOrderMessage,
  type MarketplacePriceSuggestion,
  type MarketplaceStats,
  type MediaGrade,
} from "../domain/marketplace.js";

export interface MarketplaceListingUpdatePatch {
  condition?: string;
  sleeveCondition?: string;
  price?: number;
  status?: "For Sale" | "Draft";
  comments?: string;
  allowOffers?: boolean;
  externalId?: string;
  location?: string;
  weight?: number;
  formatQuantity?: number;
}

const gradeOrder: readonly MediaGrade[] = [...mediaGrades].reverse();

export class MarketplaceService {
  constructor(private readonly client: DiscogsClient) {}

  async getStats(
    id: number,
    currency?: MarketplaceCurrency,
  ): Promise<MarketplaceStats> {
    const value = await this.client.getMarketplaceStats(id, currency);
    return {
      releaseId: id,
      lowestPrice: value.lowest_price,
      numForSale: value.num_for_sale,
      blockedFromSale: value.blocked_from_sale,
      resourceUrl: `https://api.discogs.com/marketplace/stats/${String(id)}`,
      marketplaceUrl: `https://www.discogs.com/sell/release/${String(id)}`,
    };
  }

  async getPriceSuggestions(
    releaseId: number,
  ): Promise<MarketplacePriceSuggestion[]> {
    const suggestions =
      await this.client.getMarketplacePriceSuggestions(releaseId);
    const labelToGrade = new Map<string, MediaGrade>(
      gradeOrder.map((grade) => [mediaConditionLabels[grade], grade]),
    );
    const rows: MarketplacePriceSuggestion[] = Object.entries(suggestions).map(
      ([condition, price]) => ({
        releaseId,
        grade: labelToGrade.get(condition) ?? null,
        condition,
        price,
      }),
    );
    rows.sort((left, right) => {
      const leftRank =
        left.grade === null
          ? Number.MAX_SAFE_INTEGER
          : gradeOrder.indexOf(left.grade);
      const rightRank =
        right.grade === null
          ? Number.MAX_SAFE_INTEGER
          : gradeOrder.indexOf(right.grade);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.condition.localeCompare(right.condition);
    });
    return rows;
  }

  async getListing(
    id: number,
    currency?: MarketplaceCurrency,
  ): Promise<MarketplaceListing> {
    const value = await this.client.getMarketplaceListing(id, currency);
    return {
      id: value.id,
      status: value.status,
      price: value.price,
      originalPrice:
        value.original_price == null
          ? null
          : {
              value: value.original_price.value,
              currency: value.original_price.curr_abbr,
            },
      shippingPrice: value.shipping_price ?? null,
      condition: value.condition,
      sleeveCondition: value.sleeve_condition ?? null,
      comments: value.comments ?? null,
      postedAt: value.posted ?? null,
      shipsFrom: value.ships_from ?? null,
      seller: {
        username: value.seller.username,
        rating: value.seller.stats?.rating ?? null,
      },
      release: {
        id: value.release.id,
        description: value.release.description ?? null,
      },
      resourceUrl: nonEmptyUrl(
        value.resource_url,
        `https://api.discogs.com/marketplace/listings/${String(value.id)}`,
      ),
      marketplaceUrl: discogsMarketplaceUrl(
        value.uri,
        `https://www.discogs.com/sell/item/${String(value.id)}`,
      ),
    };
  }

  async getInventory(
    username: string,
    parameters: MarketplaceInventoryParameters = {},
  ): Promise<MarketplaceInventoryItem[]> {
    return (
      await this.client.getMarketplaceInventory(username, parameters)
    ).map((item) => this.#mapInventoryItem(item, username));
  }

  async *getInventoryAll(
    username: string,
    parameters: Omit<MarketplaceInventoryParameters, "page"> = {},
  ): AsyncGenerator<MarketplaceInventoryItem> {
    for await (const item of this.client.getMarketplaceInventoryAll(
      username,
      parameters,
    )) {
      yield this.#mapInventoryItem(item, username);
    }
  }

  async createListing(
    payload: MarketplaceListingWritePayload,
  ): Promise<MarketplaceListingMutationResult> {
    const created = await this.client.createMarketplaceListing(payload);
    return {
      action: "marketplace.listing.create",
      listingId: created.listing_id,
      releaseId: payload.release_id,
      status: payload.status,
      condition: payload.condition,
      sleeveCondition: payload.sleeve_condition ?? null,
      price: payload.price,
      ...(payload.allow_offers === undefined
        ? {}
        : { allowOffers: payload.allow_offers }),
      ...(payload.comments === undefined ? {} : { comments: payload.comments }),
      resourceUrl: created.resource_url,
      marketplaceUrl: `https://www.discogs.com/sell/item/${String(created.listing_id)}`,
      dryRun: false,
    };
  }

  async prepareListingUpdate(
    listingId: number,
    patch: MarketplaceListingUpdatePatch,
  ): Promise<MarketplaceListingWritePayload> {
    const existing = await this.client.getMarketplaceListingForEdit(listingId);
    let status: "For Sale" | "Draft";
    if (patch.status !== undefined) {
      status = patch.status;
    } else if (existing.status === "Draft" || existing.status === "For Sale") {
      status = existing.status;
    } else {
      throw new AppError({
        kind: "usage",
        code: "GROOVECTL_LISTING_STATUS_REQUIRED",
        message: `Listing ${String(listingId)} currently has status "${existing.status}".`,
        remediation:
          'Pass --status "Draft" or --status "For Sale" explicitly if you intend to change its status.',
      });
    }
    const sleeve =
      patch.sleeveCondition ?? existing.sleeve_condition ?? undefined;
    const comments = patch.comments ?? existing.comments ?? undefined;
    const allowOffers = patch.allowOffers ?? existing.allow_offers ?? undefined;
    const externalId = patch.externalId ?? existing.external_id ?? undefined;
    const location = patch.location ?? existing.location ?? undefined;
    const weight = patch.weight ?? existing.weight ?? undefined;
    const formatQuantity =
      patch.formatQuantity ??
      (existing.format_quantity != null && existing.format_quantity > 0
        ? existing.format_quantity
        : undefined);
    return {
      release_id: existing.release.id,
      condition: patch.condition ?? existing.condition,
      price:
        patch.price ?? existing.original_price?.value ?? existing.price.value,
      status,
      ...(sleeve === undefined ? {} : { sleeve_condition: sleeve }),
      ...(comments === undefined ? {} : { comments }),
      ...(allowOffers === undefined ? {} : { allow_offers: allowOffers }),
      ...(externalId === undefined ? {} : { external_id: externalId }),
      ...(location === undefined ? {} : { location }),
      ...(weight === undefined ? {} : { weight }),
      ...(formatQuantity === undefined
        ? {}
        : { format_quantity: formatQuantity }),
    };
  }

  async updateListing(
    listingId: number,
    payload: MarketplaceListingWritePayload,
  ): Promise<void> {
    await this.client.updateMarketplaceListing(listingId, payload);
  }

  async deleteListing(listingId: number): Promise<void> {
    await this.client.deleteMarketplaceListing(listingId);
  }

  async getOrders(
    parameters: MarketplaceOrdersParameters = {},
  ): Promise<MarketplaceOrder[]> {
    return (await this.client.getMarketplaceOrders(parameters)).map((order) =>
      this.#mapOrder(order),
    );
  }

  async *getOrdersAll(
    parameters: Omit<MarketplaceOrdersParameters, "page"> = {},
  ): AsyncGenerator<MarketplaceOrder> {
    for await (const order of this.client.getMarketplaceOrdersAll(parameters)) {
      yield this.#mapOrder(order);
    }
  }

  async getOrder(orderId: string): Promise<MarketplaceOrder> {
    return this.#mapOrder(await this.client.getMarketplaceOrder(orderId));
  }

  async updateOrder(
    orderId: string,
    payload: MarketplaceOrderUpdatePayload,
  ): Promise<MarketplaceOrder> {
    return this.#mapOrder(
      await this.client.updateMarketplaceOrder(orderId, payload),
    );
  }

  async getOrderMessages(
    orderId: string,
    parameters: PaginationParameters = {},
  ): Promise<MarketplaceOrderMessage[]> {
    return (
      await this.client.getMarketplaceOrderMessages(orderId, parameters)
    ).map((message) => this.#mapOrderMessage(message));
  }

  async *getOrderMessagesAll(
    orderId: string,
    parameters: Omit<PaginationParameters, "page"> = {},
  ): AsyncGenerator<MarketplaceOrderMessage> {
    for await (const message of this.client.getMarketplaceOrderMessagesAll(
      orderId,
      parameters,
    )) {
      yield this.#mapOrderMessage(message);
    }
  }

  async addOrderMessage(
    orderId: string,
    payload: MarketplaceOrderMessagePayload,
  ): Promise<MarketplaceOrderMessage> {
    return this.#mapOrderMessage(
      await this.client.addMarketplaceOrderMessage(orderId, payload),
    );
  }

  async getFee(
    price: string,
    currency?: MarketplaceCurrency,
  ): Promise<MarketplaceFee> {
    const fee = await this.client.getMarketplaceFee(price, currency);
    return { price: { value: Number(price), currency: fee.currency }, fee };
  }

  #mapInventoryItem(
    value: DiscogsMarketplaceInventoryListing,
    fallbackUsername: string,
  ): MarketplaceInventoryItem {
    return {
      id: value.id,
      status: value.status,
      price: value.price,
      originalPrice:
        value.original_price == null
          ? null
          : {
              value: value.original_price.value,
              currency: value.original_price.curr_abbr,
            },
      shippingPrice: value.shipping_price ?? null,
      condition: value.condition,
      sleeveCondition: value.sleeve_condition ?? null,
      comments: value.comments ?? null,
      allowOffers: value.allow_offers ?? null,
      postedAt: value.posted ?? null,
      shipsFrom: value.ships_from ?? null,
      seller: {
        username: value.seller?.username ?? fallbackUsername,
        rating: value.seller?.stats?.rating ?? null,
      },
      release: {
        id: value.release.id,
        description: value.release.description ?? null,
        artist: value.release.artist ?? null,
        title: value.release.title ?? null,
        format: value.release.format ?? null,
        catalogNumber: value.release.catalog_number ?? null,
        year: value.release.year ?? null,
      },
      resourceUrl: nonEmptyUrl(
        value.resource_url,
        `https://api.discogs.com/marketplace/listings/${String(value.id)}`,
      ),
      marketplaceUrl: discogsMarketplaceUrl(
        value.uri,
        `https://www.discogs.com/sell/item/${String(value.id)}`,
      ),
    };
  }

  #mapOrder(order: DiscogsMarketplaceOrder): MarketplaceOrder {
    return {
      id: order.id,
      status: order.status,
      nextStatus: order.next_status,
      created: order.created ?? null,
      lastActivity: order.last_activity ?? null,
      archived: order.archived ?? null,
      buyer:
        order.buyer == null
          ? null
          : { username: order.buyer.username, id: order.buyer.id ?? null },
      seller:
        order.seller == null
          ? null
          : { username: order.seller.username, id: order.seller.id ?? null },
      items: order.items.map((item) => ({
        id: item.id,
        releaseId: item.release.id,
        description: item.release.description ?? null,
        price: item.price,
      })),
      shipping:
        order.shipping == null
          ? null
          : {
              value: order.shipping.value,
              currency: order.shipping.currency,
              method: order.shipping.method ?? null,
            },
      fee: order.fee ?? null,
      total: order.total ?? null,
      shippingAddress: order.shipping_address ?? null,
      additionalInstructions: order.additional_instructions ?? null,
      resourceUrl: nonEmptyUrl(
        order.resource_url,
        `https://api.discogs.com/marketplace/orders/${encodeURIComponent(order.id)}`,
      ),
      marketplaceUrl: discogsMarketplaceUrl(
        order.uri,
        `https://www.discogs.com/sell/order/${encodeURIComponent(order.id)}`,
      ),
    };
  }

  #mapOrderMessage(
    message: DiscogsMarketplaceOrderMessage,
  ): MarketplaceOrderMessage {
    return {
      type: message.type,
      subject: message.subject ?? null,
      message: message.message,
      timestamp: message.timestamp ?? null,
      from: message.from?.username ?? null,
    };
  }
}

function nonEmptyUrl(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim().length > 0 ? value : fallback;
}

function discogsMarketplaceUrl(
  uri: string | undefined,
  fallback: string,
): string {
  if (uri === undefined || uri.trim().length === 0) return fallback;
  try {
    return new URL(uri, "https://www.discogs.com").toString();
  } catch {
    return fallback;
  }
}
