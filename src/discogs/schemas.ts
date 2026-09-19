import { z } from "zod";

export const releaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.number().int().nullable().optional(),
  country: z.string().nullable().optional(),
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
        descriptions: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  genres: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
});

export type DiscogsRelease = z.infer<typeof releaseSchema>;

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
      first: z.url().optional(),
      prev: z.url().optional(),
      next: z.url().optional(),
      last: z.url().optional(),
    })
    .default({}),
});

export const searchResultSchema = z.object({
  id: z.number().int().positive(),
  type: z.string(),
  title: z.string(),
  year: z.string().optional(),
  country: z.string().optional(),
  format: z.array(z.string()).default([]),
  label: z.array(z.string()).default([]),
  genre: z.array(z.string()).default([]),
  style: z.array(z.string()).default([]),
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
