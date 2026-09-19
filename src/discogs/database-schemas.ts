import { z } from "zod";

import { paginationSchema } from "./schemas.js";

const artistCreditSchema = z.object({ name: z.string() });

export const masterSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.number().int().optional(),
  main_release: z.number().int().positive(),
  resource_url: z.url(),
  uri: z.string(),
  artists: z.array(artistCreditSchema).default([]),
  genres: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
});

export const masterVersionSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  label: z.string().optional(),
  country: z.string().optional(),
  released: z.string().optional(),
  major_formats: z.array(z.string()).default([]),
  format: z.string().optional(),
  catno: z.string().optional(),
  status: z.string().optional(),
  resource_url: z.url(),
});

export const masterVersionsResponseSchema = z.object({
  pagination: paginationSchema,
  versions: z.array(masterVersionSchema),
});

export const artistSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  realname: z.string().optional(),
  profile: z.string().optional(),
  resource_url: z.url(),
  uri: z.string(),
  urls: z.array(z.url()).default([]),
  namevariations: z.array(z.string()).default([]),
});

export const artistReleaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  type: z.string(),
  main_release: z.number().int().positive().optional(),
  artist: z.string(),
  role: z.string(),
  resource_url: z.url(),
  year: z.number().int().optional(),
});

export const artistReleasesResponseSchema = z.object({
  pagination: paginationSchema,
  releases: z.array(artistReleaseSchema),
});

export const labelSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  profile: z.string().optional(),
  contact_info: z.string().optional(),
  resource_url: z.url(),
  uri: z.string(),
  urls: z.array(z.url()).default([]),
  parent_label: z
    .object({ id: z.number().int().positive(), name: z.string() })
    .nullable()
    .optional(),
});

export const labelReleaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  artist: z.string(),
  year: z.number().int().optional(),
  format: z.string().optional(),
  catno: z.string().optional(),
  status: z.string().optional(),
  resource_url: z.url(),
});

export const labelReleasesResponseSchema = z.object({
  pagination: paginationSchema,
  releases: z.array(labelReleaseSchema),
});

export type DiscogsMaster = z.infer<typeof masterSchema>;
export type DiscogsMasterVersion = z.infer<typeof masterVersionSchema>;
export type DiscogsArtist = z.infer<typeof artistSchema>;
export type DiscogsArtistRelease = z.infer<typeof artistReleaseSchema>;
export type DiscogsLabel = z.infer<typeof labelSchema>;
export type DiscogsLabelRelease = z.infer<typeof labelReleaseSchema>;
