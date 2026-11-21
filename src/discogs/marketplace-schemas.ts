import { z } from "zod";

import { paginationSchema } from "./schemas.js";

export const moneySchema = z.object({
  value: z.number().nonnegative(),
  currency: z.string().min(1),
});

export const marketplaceStatsSchema = z.object({
  lowest_price: moneySchema.nullable(),
  num_for_sale: z.number().int().nonnegative().nullable(),
  blocked_from_sale: z.boolean(),
});

const sellerRatingSchema = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d+(?:\.\d+)?$/u)
      .transform(Number),
  ])
  .pipe(z.number().min(0).max(100));

const shippingPriceSchema = z
  .union([
    moneySchema,
    z
      .object({})
      .strict()
      .transform(() => null),
  ])
  .nullish();

// Zod objects strip unlisted fields, including authenticated owner-only data.
export const marketplaceListingSchema = z.object({
  id: z.number().int().positive(),
  status: z.string(),
  price: moneySchema,
  original_price: z
    .object({
      value: z.number().nonnegative(),
      curr_abbr: z.string().min(1),
    })
    .nullish(),
  // Live anonymous responses may use {} when no shipping quote is available.
  shipping_price: shippingPriceSchema,
  condition: z.string(),
  sleeve_condition: z.string().nullish(),
  comments: z.string().nullish(),
  posted: z.string().nullish(),
  ships_from: z.string().nullish(),
  seller: z.object({
    username: z.string(),
    stats: z.object({ rating: sellerRatingSchema.nullish() }).nullish(),
  }),
  release: z.object({
    id: z.number().int().positive(),
    description: z.string().nullish(),
  }),
  resource_url: z.string().optional(),
  uri: z.string().optional(),
});

export const marketplaceOwnedListingSchema = marketplaceListingSchema.extend({
  allow_offers: z.boolean().nullish(),
  external_id: z.string().nullish(),
  location: z.string().nullish(),
  weight: z.number().nonnegative().nullish(),
  format_quantity: z.number().int().nonnegative().nullish(),
});

export const marketplacePriceSuggestionsSchema = z.record(
  z.string(),
  moneySchema,
);

export const marketplaceInventoryListingSchema = z.object({
  id: z.number().int().positive(),
  status: z.string(),
  price: moneySchema,
  original_price: z
    .object({
      value: z.number().nonnegative(),
      curr_abbr: z.string().min(1),
    })
    .nullish(),
  shipping_price: shippingPriceSchema,
  condition: z.string(),
  sleeve_condition: z.string().nullish(),
  comments: z.string().nullish(),
  allow_offers: z.boolean().nullish(),
  posted: z.string().nullish(),
  ships_from: z.string().nullish(),
  seller: z
    .object({
      username: z.string(),
      stats: z.object({ rating: sellerRatingSchema.nullish() }).nullish(),
    })
    .nullish(),
  release: z.object({
    id: z.number().int().positive(),
    description: z.string().nullish(),
    artist: z.string().nullish(),
    title: z.string().nullish(),
    format: z.string().nullish(),
    catalog_number: z.string().nullish(),
    year: z.number().int().nullish(),
  }),
  resource_url: z.string().optional(),
  uri: z.string().optional(),
});

export const marketplaceInventoryResponseSchema = z.object({
  pagination: paginationSchema,
  listings: z.array(marketplaceInventoryListingSchema),
});

export const marketplaceCreateListingResponseSchema = z.object({
  listing_id: z.number().int().positive(),
  resource_url: z.string(),
});

const orderActorSchema = z.object({
  id: z.number().int().positive().nullish(),
  username: z.string(),
});

const orderShippingSchema = z.object({
  value: z.number().nonnegative(),
  currency: z.string().min(1),
  method: z.string().nullish(),
});

const emptyOrNullOrderShippingSchema = z
  .union([
    z.object({}).strict(),
    z.object({
      value: z.null(),
      currency: z.string().nullish(),
      method: z.string().nullish(),
    }),
  ])
  .transform(() => null);

const orderItemSchema = z.object({
  id: z.number().int().positive(),
  release: z.object({
    id: z.number().int().positive(),
    description: z.string().nullish(),
  }),
  price: moneySchema,
});

export const marketplaceOrderSchema = z.object({
  id: z.string().min(1),
  resource_url: z.string().optional(),
  uri: z.string().optional(),
  status: z.string(),
  next_status: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  created: z.string().nullish(),
  last_activity: z.string().nullish(),
  archived: z.boolean().nullish(),
  buyer: orderActorSchema.nullish(),
  seller: orderActorSchema.nullish(),
  items: z
    .array(orderItemSchema)
    .nullish()
    .transform((value) => value ?? []),
  shipping: z
    .union([orderShippingSchema, emptyOrNullOrderShippingSchema])
    .nullish(),
  fee: moneySchema.nullish(),
  total: moneySchema.nullish(),
  shipping_address: z.string().nullish(),
  additional_instructions: z.string().nullish(),
});

export const marketplaceOrdersResponseSchema = z.object({
  pagination: paginationSchema,
  orders: z.array(marketplaceOrderSchema),
});

export const marketplaceOrderMessageSchema = z.object({
  type: z
    .string()
    .nullish()
    .transform((value) => value ?? "message"),
  subject: z.string().nullish(),
  message: z
    .string()
    .nullish()
    .transform((value) => value ?? ""),
  timestamp: z.string().nullish(),
  from: z.object({ username: z.string() }).nullish(),
});

export const marketplaceOrderMessagesResponseSchema = z.object({
  pagination: paginationSchema,
  messages: z.array(marketplaceOrderMessageSchema),
});

export type DiscogsMarketplaceInventoryListing = z.infer<
  typeof marketplaceInventoryListingSchema
>;
export type DiscogsMarketplaceOrder = z.infer<typeof marketplaceOrderSchema>;
export type DiscogsMarketplaceOrderMessage = z.infer<
  typeof marketplaceOrderMessageSchema
>;
