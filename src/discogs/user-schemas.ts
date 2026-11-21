import { z } from "zod";

import { paginationSchema } from "./schemas.js";

const artistCreditSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string(),
  resource_url: z.url().optional(),
});

const formatSchema = z.object({
  name: z.string(),
  qty: z.string().optional(),
  descriptions: z.array(z.string()).default([]),
});

const labelCreditSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string(),
  catno: z.string().optional(),
  resource_url: z.url().optional(),
});

export const basicInformationSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.number().int().nullable().optional(),
  resource_url: z.url(),
  thumb: z.url().optional().or(z.literal("")),
  cover_image: z.url().optional().or(z.literal("")),
  artists: z.array(artistCreditSchema).default([]),
  formats: z.array(formatSchema).default([]),
  labels: z.array(labelCreditSchema).default([]),
});

export const collectionFolderSchema = z.object({
  id: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  name: z.string(),
  resource_url: z.url(),
});

export const collectionFoldersResponseSchema = z.object({
  folders: z.array(collectionFolderSchema),
});

export const collectionNoteSchema = z.object({
  field_id: z.number().int().nonnegative(),
  value: z.string(),
});

export const collectionItemSchema = z.object({
  id: z.number().int().positive(),
  instance_id: z.number().int().positive(),
  folder_id: z.number().int().nonnegative(),
  rating: z.number().int().min(0).max(5).default(0),
  date_added: z.string().optional(),
  notes: z.array(collectionNoteSchema).default([]),
  basic_information: basicInformationSchema,
});

export const collectionItemsResponseSchema = z.object({
  pagination: paginationSchema,
  releases: z.array(collectionItemSchema),
});

export const collectionAddResponseSchema = z.object({
  instance_id: z.number().int().positive(),
  resource_url: z.url(),
});

export const collectionValueSchema = z.object({
  minimum: z.string(),
  median: z.string(),
  maximum: z.string(),
});

export const wantlistItemSchema = z.object({
  id: z.number().int().positive(),
  rating: z.number().int().min(0).max(5).default(0),
  notes: z.string().optional(),
  resource_url: z.url(),
  basic_information: basicInformationSchema,
});

export const wantlistResponseSchema = z.object({
  pagination: paginationSchema,
  wants: z.array(wantlistItemSchema),
});

export const collectionFieldSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  type: z.string(),
  position: z.number().int().nonnegative(),
  public: z.boolean().nullish(),
  lines: z.number().int().nonnegative().nullish(),
  options: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
});

export const collectionFieldsResponseSchema = z.object({
  fields: z.array(collectionFieldSchema),
});

export const userProfileSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  resource_url: z.url(),
  uri: z.string().optional(),
  name: z.string().nullish(),
  profile: z.string().nullish(),
  home_page: z.string().nullish(),
  location: z.string().nullish(),
  registered: z.string().nullish(),
  num_collection: z.number().int().nonnegative().nullish(),
  num_wantlist: z.number().int().nonnegative().nullish(),
  num_for_sale: z.number().int().nonnegative().nullish(),
  num_lists: z.number().int().nonnegative().nullish(),
  releases_contributed: z.number().int().nonnegative().nullish(),
  releases_rated: z.number().int().nonnegative().nullish(),
  rating_avg: z.number().nonnegative().nullish(),
  curr_abbr: z.string().nullish(),
  buyer_rating: z.number().nonnegative().nullish(),
  buyer_num_ratings: z.number().int().nonnegative().nullish(),
  seller_rating: z.number().nonnegative().nullish(),
  seller_num_ratings: z.number().int().nonnegative().nullish(),
});

export const userListSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullish(),
  uri: z.string().optional(),
  resource_url: z.url(),
  date_added: z.string().nullish(),
  date_changed: z.string().nullish(),
  public: z.boolean().optional(),
});

export const userListsResponseSchema = z.object({
  pagination: paginationSchema,
  lists: z.array(userListSummarySchema),
});

export const userListItemSchema = z.object({
  id: z.number().int().positive(),
  type: z.string(),
  display_title: z.string().optional(),
  title: z.string().optional(),
  uri: z.string().optional(),
  resource_url: z.url().optional(),
  comment: z.string().nullish(),
});

export const userListDetailSchema = userListSummarySchema.extend({
  items: z.array(userListItemSchema).default([]),
});

export type DiscogsBasicInformation = z.infer<typeof basicInformationSchema>;
export type DiscogsCollectionFolder = z.infer<typeof collectionFolderSchema>;
export type DiscogsCollectionItem = z.infer<typeof collectionItemSchema>;
export type DiscogsCollectionValue = z.infer<typeof collectionValueSchema>;
export type DiscogsCollectionField = z.infer<typeof collectionFieldSchema>;
export type DiscogsWantlistItem = z.infer<typeof wantlistItemSchema>;
export type DiscogsUserProfile = z.infer<typeof userProfileSchema>;
export type DiscogsUserListSummary = z.infer<typeof userListSummarySchema>;
export type DiscogsUserListDetail = z.infer<typeof userListDetailSchema>;
