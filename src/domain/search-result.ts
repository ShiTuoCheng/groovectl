export interface SearchResult {
  id: number;
  masterId: number | null;
  type: string;
  title: string;
  year: string | null;
  country: string | null;
  formats: string[];
  labels: string[];
  genres: string[];
  styles: string[];
  barcodes: string[];
  catalogNumber: string | null;
  url: string;
  resourceUrl: string;
}
