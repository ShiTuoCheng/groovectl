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
