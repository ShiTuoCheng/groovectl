import { z } from "zod";

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
  shipping_price: moneySchema.nullish(),
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
