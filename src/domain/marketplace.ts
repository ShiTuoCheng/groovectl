export const marketplaceCurrencies = [
  "USD",
  "GBP",
  "EUR",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "MXN",
  "BRL",
  "NZD",
  "SEK",
  "ZAR",
] as const;

export type MarketplaceCurrency = (typeof marketplaceCurrencies)[number];

export interface Money {
  value: number;
  currency: string;
}

export interface MarketplaceStats {
  releaseId: number;
  lowestPrice: Money | null;
  numForSale: number | null;
  blockedFromSale: boolean;
  resourceUrl: string;
  marketplaceUrl: string;
}

export interface MarketplaceListing {
  id: number;
  status: string;
  price: Money;
  originalPrice: Money | null;
  shippingPrice: Money | null;
  condition: string;
  sleeveCondition: string | null;
  comments: string | null;
  postedAt: string | null;
  shipsFrom: string | null;
  seller: { username: string; rating: number | null };
  release: { id: number; description: string | null };
  resourceUrl: string;
  marketplaceUrl: string;
}

export interface MarketplaceFee {
  price: Money;
  fee: Money;
}
