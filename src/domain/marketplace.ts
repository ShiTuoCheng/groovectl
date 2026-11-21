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

export const mediaGrades = [
  "P",
  "F",
  "G",
  "G+",
  "VG",
  "VG+",
  "NM",
  "M",
] as const;
export type MediaGrade = (typeof mediaGrades)[number];

export const mediaConditionLabels: Record<MediaGrade, string> = {
  M: "Mint (M)",
  NM: "Near Mint (NM or M-)",
  "VG+": "Very Good Plus (VG+)",
  VG: "Very Good (VG)",
  "G+": "Good Plus (G+)",
  G: "Good (G)",
  F: "Fair (F)",
  P: "Poor (P)",
};

export const sleeveSpecialConditions = [
  "Generic",
  "Not Graded",
  "No Cover",
] as const;
export type SleeveSpecialCondition = (typeof sleeveSpecialConditions)[number];
export type SleeveGrade = MediaGrade | SleeveSpecialCondition;

export const marketplaceListingStatuses = [
  "For Sale",
  "Draft",
  "Expired",
  "Sold",
  "All",
] as const;
export type MarketplaceListingStatus =
  (typeof marketplaceListingStatuses)[number];

export const marketplaceOfferSorts = [
  "price-asc",
  "price-desc",
  "listed-desc",
  "listed-asc",
  "condition-desc",
  "condition-asc",
] as const;
export type MarketplaceOfferSort = (typeof marketplaceOfferSorts)[number];

export const marketplaceInventorySorts = [
  "listed",
  "price",
  "item",
  "artist",
  "label",
  "catno",
  "audio",
  "status",
  "location",
] as const;
export type MarketplaceInventorySort =
  (typeof marketplaceInventorySorts)[number];

export const marketplaceOrderSorts = [
  "id",
  "buyer",
  "created",
  "status",
  "last_activity",
] as const;
export type MarketplaceOrderSort = (typeof marketplaceOrderSorts)[number];

export function normalizeMediaCondition(value: string): string | undefined {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (upper === "M-") return mediaConditionLabels.NM;
  if ((mediaGrades as readonly string[]).includes(upper)) {
    return mediaConditionLabels[upper as MediaGrade];
  }
  const exact = Object.values(mediaConditionLabels).find(
    (label) => label.toLowerCase() === trimmed.toLowerCase(),
  );
  return exact;
}

export function normalizeSleeveCondition(value: string): string | undefined {
  const media = normalizeMediaCondition(value);
  if (media !== undefined) return media;
  const trimmed = value.trim();
  return sleeveSpecialConditions.find(
    (label) => label.toLowerCase() === trimmed.toLowerCase(),
  );
}

export interface MarketplacePriceSuggestion {
  releaseId: number;
  grade: MediaGrade | null;
  condition: string;
  price: Money;
}

export interface MarketplaceInventoryItem {
  id: number;
  status: string;
  price: Money;
  originalPrice: Money | null;
  shippingPrice: Money | null;
  condition: string;
  sleeveCondition: string | null;
  comments: string | null;
  allowOffers: boolean | null;
  postedAt: string | null;
  shipsFrom: string | null;
  seller: { username: string; rating: number | null };
  release: {
    id: number;
    description: string | null;
    artist: string | null;
    title: string | null;
    format: string | null;
    catalogNumber: string | null;
    year: number | null;
  };
  resourceUrl: string;
  marketplaceUrl: string;
}

export interface MarketplaceListingMutationResult {
  action: string;
  listingId?: number;
  releaseId?: number;
  status?: string;
  condition?: string;
  sleeveCondition?: string | null;
  price?: number;
  allowOffers?: boolean;
  comments?: string | null;
  resourceUrl?: string;
  marketplaceUrl?: string;
  dryRun: boolean;
}

export interface MarketplaceOrderItem {
  id: number;
  releaseId: number;
  description: string | null;
  price: Money;
}

export interface MarketplaceOrder {
  id: string;
  status: string;
  nextStatus: string[];
  created: string | null;
  lastActivity: string | null;
  archived: boolean | null;
  buyer: { username: string; id: number | null } | null;
  seller: { username: string; id: number | null } | null;
  items: MarketplaceOrderItem[];
  shipping: (Money & { method: string | null }) | null;
  fee: Money | null;
  total: Money | null;
  shippingAddress: string | null;
  additionalInstructions: string | null;
  resourceUrl: string;
  marketplaceUrl: string;
}

export interface MarketplaceOrderMessage {
  type: string;
  subject: string | null;
  message: string;
  timestamp: string | null;
  from: string | null;
}

/** A website offer, not an API-verified listing or delivered-price quote. */
export interface MarketplaceOffer {
  id: number;
  releaseId: number;
  price: Money;
  condition: string;
  sleeveCondition: string | null;
  comments: string | null;
  shipsFrom: string | null;
  seller: {
    username: string;
    rating: number | null;
    feedbackCount: number | null;
  };
  shippingText: string | null;
  availability: "listed" | "unavailable";
  marketplaceUrl: string;
  source: "web" | "html";
  sourceUrl: string;
  readAt: string;
}
