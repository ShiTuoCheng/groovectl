export interface Release {
  id: number;
  title: string;
  artists: string[];
  year: number | null;
  country: string | null;
  formats: string[];
  genres: string[];
  styles: string[];
  url: string;
  resourceUrl: string | null;
}
