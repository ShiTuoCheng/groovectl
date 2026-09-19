export interface SearchResult {
  id: number;
  type: string;
  title: string;
  year: string | null;
  country: string | null;
  formats: string[];
  labels: string[];
  genres: string[];
  styles: string[];
  catalogNumber: string | null;
  url: string;
  resourceUrl: string;
}
