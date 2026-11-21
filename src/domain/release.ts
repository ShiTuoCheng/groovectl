export interface ReleaseLabel {
  name: string;
  catalogNumber: string | null;
}

export interface ReleaseCompany {
  name: string;
  entityType: string | null;
  catalogNumber: string | null;
}

export interface ReleaseIdentifier {
  type: string;
  value: string;
  description: string | null;
}

export interface ReleaseTrack {
  position: string;
  title: string;
  duration: string | null;
  type: string | null;
}

export interface ReleaseCommunityStats {
  have: number;
  want: number;
  ratingAverage: number | null;
  ratingCount: number;
}

export interface Release {
  id: number;
  masterId: number | null;
  title: string;
  artists: string[];
  year: number | null;
  released: string | null;
  country: string | null;
  status: string | null;
  dataQuality: string | null;
  formats: string[];
  labels: ReleaseLabel[];
  companies: ReleaseCompany[];
  identifiers: ReleaseIdentifier[];
  tracklist: ReleaseTrack[];
  notes: string | null;
  genres: string[];
  styles: string[];
  community: ReleaseCommunityStats | null;
  lowestPrice: number | null;
  numForSale: number | null;
  url: string;
  resourceUrl: string | null;
}

export interface ReleaseCommunityRating {
  releaseId: number;
  average: number;
  count: number;
}

export interface ReleaseUserRating {
  releaseId: number;
  username: string;
  rating: number;
}
