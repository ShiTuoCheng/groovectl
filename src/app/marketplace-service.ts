import type { DiscogsClient } from "../discogs/client.js";
import type {
  MarketplaceCurrency,
  MarketplaceFee,
  MarketplaceListing,
  MarketplaceStats,
} from "../domain/marketplace.js";

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
      resourceUrl:
        value.resource_url ??
        `https://api.discogs.com/marketplace/listings/${String(value.id)}`,
      marketplaceUrl:
        value.uri ?? `https://www.discogs.com/sell/item/${String(value.id)}`,
    };
  }

  async getFee(
    price: string,
    currency?: MarketplaceCurrency,
  ): Promise<MarketplaceFee> {
    const fee = await this.client.getMarketplaceFee(price, currency);
    return { price: { value: Number(price), currency: fee.currency }, fee };
  }
}
