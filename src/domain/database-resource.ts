export interface Master {
  id: number;
  title: string;
  artists: string[];
  year: number | null;
  genres: string[];
  styles: string[];
  mainReleaseId: number;
  url: string;
  resourceUrl: string;
}

export interface MasterVersion {
  id: number;
  title: string;
  label: string | null;
  country: string | null;
  released: string | null;
  formats: string[];
  format: string | null;
  catalogNumber: string | null;
  status: string | null;
  url: string;
  resourceUrl: string;
}

export interface Artist {
  id: number;
  name: string;
  realName: string | null;
  profile: string | null;
  urls: string[];
  nameVariations: string[];
  url: string;
  resourceUrl: string;
}

export interface ArtistRelease {
  id: number;
  title: string;
  type: string;
  artist: string;
  role: string;
  year: number | null;
  mainReleaseId: number | null;
  url: string;
  resourceUrl: string;
}

export interface Label {
  id: number;
  name: string;
  profile: string | null;
  contactInfo: string | null;
  urls: string[];
  parentLabel: { id: number; name: string } | null;
  url: string;
  resourceUrl: string;
}

export interface LabelRelease {
  id: number;
  title: string;
  artist: string;
  year: number | null;
  format: string | null;
  catalogNumber: string | null;
  status: string | null;
  url: string;
  resourceUrl: string;
}
