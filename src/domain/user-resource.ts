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

export interface MutationResult {
  action: string;
  username: string;
  releaseId: number;
  folderId?: number;
  instanceId?: number;
  rating?: number;
  notes?: string;
  dryRun: boolean;
}
