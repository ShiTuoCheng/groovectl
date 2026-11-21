import { z } from "zod";

const releaseLabelSchema = z.object({
  id: z.number().int().nonnegative().optional(),
  name: z.string(),
  catno: z.string().nullish(),
  entity_type_name: z.string().nullish(),
});

const releaseIdentifierSchema = z.object({
  type: z.string(),
  value: z.string(),
  description: z.string().nullish(),
});

const releaseTrackSchema = z.object({
  position: z
    .string()
    .nullish()
    .transform((value) => value ?? ""),
  title: z.string(),
  duration: z.string().nullish(),
  type_: z.string().nullish(),
});

const releaseCommunitySchema = z.object({
  have: z.number().int().nonnegative().default(0),
  want: z.number().int().nonnegative().default(0),
  rating: z
    .object({
      count: z.number().int().nonnegative().default(0),
      average: z.number().nonnegative().nullable().optional(),
    })
    .nullish(),
});

export const releaseSchema = z.object({
  id: z.number().int().positive(),
  master_id: z.number().int().nonnegative().nullable().optional(),
  title: z.string(),
  year: z.number().int().nullable().optional(),
  released: z.string().nullable().optional(),
  released_formatted: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  data_quality: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lowest_price: z.number().nonnegative().nullable().optional(),
  num_for_sale: z.number().int().nonnegative().nullable().optional(),
  uri: z.string().optional(),
  resource_url: z.url().optional(),
  artists: z
    .array(
      z.object({
        name: z.string(),
      }),
    )
    .default([]),
  formats: z
    .array(
      z.object({
        name: z.string(),
        qty: z.string().optional(),
        text: z.string().nullish(),
        descriptions: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  labels: z.array(releaseLabelSchema).default([]),
  companies: z.array(releaseLabelSchema).default([]),
  identifiers: z.array(releaseIdentifierSchema).default([]),
  tracklist: z.array(releaseTrackSchema).default([]),
  community: releaseCommunitySchema.nullish(),
  genres: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
});

export type DiscogsRelease = z.infer<typeof releaseSchema>;

export const releaseCommunityRatingSchema = z.object({
  release_id: z.number().int().positive(),
  rating: z.object({
    count: z.number().int().nonnegative(),
    average: z.number().nonnegative(),
  }),
});

export type DiscogsReleaseCommunityRating = z.infer<
  typeof releaseCommunityRatingSchema
>;

export const releaseUserRatingSchema = z.object({
  username: z.string(),
  release_id: z.number().int().positive(),
  rating: z.number().int().min(0).max(5),
});

export type DiscogsReleaseUserRating = z.infer<typeof releaseUserRatingSchema>;

export const identitySchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  resource_url: z.url(),
  consumer_name: z.string().optional(),
});

export type DiscogsIdentity = z.infer<typeof identitySchema>;

export const paginationSchema = z.object({
  page: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
  per_page: z.number().int().positive(),
  items: z.number().int().nonnegative(),
  urls: z
    .object({
      first: z.url().nullish(),
      prev: z.url().nullish(),
      next: z.url().nullish(),
      last: z.url().nullish(),
    })
    .default({}),
});

export const searchResultSchema = z.object({
  id: z.number().int().positive(),
  master_id: z.number().int().nonnegative().nullable().optional(),
  type: z.string(),
  title: z.string(),
  year: z.string().optional(),
  country: z.string().optional(),
  format: z.array(z.string()).default([]),
  label: z.array(z.string()).default([]),
  genre: z.array(z.string()).default([]),
  style: z.array(z.string()).default([]),
  barcode: z.array(z.string()).default([]),
  catno: z.string().optional(),
  uri: z.string().optional(),
  resource_url: z.url(),
});

export const searchResponseSchema = z.object({
  pagination: paginationSchema,
  results: z.array(searchResultSchema),
});

export type DiscogsSearchResponse = z.infer<typeof searchResponseSchema>;
export type DiscogsSearchResult = z.infer<typeof searchResultSchema>;
