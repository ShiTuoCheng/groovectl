export interface BasicReleaseInformation {
  id: number;
  title: string;
  artists: string[];
  year: number | null;
  formats: string[];
  labels: string[];
  catalogNumbers: string[];
  url: string;
  resourceUrl: string;
  thumbnailUrl: string | null;
  coverImageUrl: string | null;
}

export interface CollectionFolder {
  id: number;
  name: string;
  count: number;
  resourceUrl: string;
}

export interface CollectionNote {
  fieldId: number;
  value: string;
}

export interface CollectionItem extends BasicReleaseInformation {
  instanceId: number;
  folderId: number;
  rating: number;
  dateAdded: string | null;
  notes: CollectionNote[];
}

export interface CollectionAddResult {
  releaseId: number;
  folderId: number;
  instanceId: number;
  resourceUrl: string;
}

export interface MoneyValue {
  value: number | null;
  currency: string | null;
  display: string;
}

export interface CollectionValue {
  minimum: MoneyValue;
  median: MoneyValue;
  maximum: MoneyValue;
}

export interface WantlistItem extends BasicReleaseInformation {
  rating: number;
  notes: string | null;
}

export interface CollectionField {
  id: number;
  name: string;
  type: string;
  position: number;
  public: boolean | null;
  lines: number | null;
  options: string[];
}

export interface UserProfile {
  id: number;
  username: string;
  name: string | null;
  profile: string | null;
  location: string | null;
  homePage: string | null;
  registered: string | null;
  numCollection: number | null;
  numWantlist: number | null;
  numForSale: number | null;
  numLists: number | null;
  releasesContributed: number | null;
  releasesRated: number | null;
  ratingAverage: number | null;
  currency: string | null;
  buyerRating: number | null;
  buyerNumRatings: number | null;
  sellerRating: number | null;
  sellerNumRatings: number | null;
  url: string;
  resourceUrl: string;
}

export interface UserListSummary {
  id: number;
  name: string;
  description: string | null;
  public: boolean | null;
  dateAdded: string | null;
  dateChanged: string | null;
  url: string;
  resourceUrl: string;
}

export interface UserListItem {
  id: number;
  type: string;
  title: string;
  comment: string | null;
  url: string;
  resourceUrl: string | null;
}

export interface UserListDetail extends UserListSummary {
  items: UserListItem[];
}

export interface MutationResult {
  action: string;
  username: string;
  releaseId?: number;
  folderId?: number;
  folderName?: string;
  instanceId?: number;
  fieldId?: number;
  value?: string;
  rating?: number;
  notes?: string;
  dryRun: boolean;
}
