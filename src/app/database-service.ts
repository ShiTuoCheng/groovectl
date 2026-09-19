import type {
  DiscogsClient,
  PaginationParameters,
  SearchParameters,
} from "../discogs/client.js";
import type {
  DiscogsArtistRelease,
  DiscogsLabelRelease,
  DiscogsMasterVersion,
} from "../discogs/database-schemas.js";
import type {
  Artist,
  ArtistRelease,
  Label,
  LabelRelease,
  Master,
  MasterVersion,
} from "../domain/database-resource.js";
import type { Release } from "../domain/release.js";
import type { SearchResult } from "../domain/search-result.js";

export class DatabaseService {
  readonly #client: DiscogsClient;

  constructor(client: DiscogsClient) {
    this.#client = client;
  }

  async getRelease(id: number): Promise<Release> {
    const release = await this.#client.getRelease(id);
    return {
      id: release.id,
      title: release.title,
      artists: release.artists.map((artist) => artist.name),
      year: release.year ?? null,
      country: release.country ?? null,
      formats: release.formats.map((format) => {
        const details = format.descriptions?.join(", ");
        return details === undefined
          ? format.name
          : `${format.name} (${details})`;
      }),
      genres: release.genres,
      styles: release.styles,
      url:
        release.uri === undefined
          ? `https://www.discogs.com/release/${String(release.id)}`
          : new URL(release.uri, "https://www.discogs.com").toString(),
      resourceUrl: release.resource_url ?? null,
    };
  }

  async search(parameters: SearchParameters): Promise<SearchResult[]> {
    const response = await this.#client.search(parameters);
    return response.results.map((result) => this.#mapSearchResult(result));
  }

  async getMaster(id: number): Promise<Master> {
    const value = await this.#client.getMaster(id);
    return {
      id: value.id,
      title: value.title,
      artists: value.artists.map((artist) => artist.name),
      year: value.year ?? null,
      genres: value.genres,
      styles: value.styles,
      mainReleaseId: value.main_release,
      url: discogsUrl(value.uri, `master/${String(value.id)}`),
      resourceUrl: value.resource_url,
    };
  }

  async getMasterVersions(
    id: number,
    parameters: PaginationParameters,
  ): Promise<MasterVersion[]> {
    return (await this.#client.getMasterVersions(id, parameters)).map((value) =>
      this.#mapMasterVersion(value),
    );
  }

  async *getMasterVersionsAll(
    id: number,
    parameters: Omit<PaginationParameters, "page">,
  ): AsyncGenerator<MasterVersion> {
    for await (const value of this.#client.getMasterVersionsAll(
      id,
      parameters,
    )) {
      yield this.#mapMasterVersion(value);
    }
  }

  async getArtist(id: number): Promise<Artist> {
    const value = await this.#client.getArtist(id);
    return {
      id: value.id,
      name: value.name,
      realName: value.realname ?? null,
      profile: value.profile ?? null,
      urls: value.urls,
      nameVariations: value.namevariations,
      url: discogsUrl(value.uri, `artist/${String(value.id)}`),
      resourceUrl: value.resource_url,
    };
  }

  async getArtistReleases(
    id: number,
    parameters: PaginationParameters,
  ): Promise<ArtistRelease[]> {
    return (await this.#client.getArtistReleases(id, parameters)).map((value) =>
      this.#mapArtistRelease(value),
    );
  }

  async *getArtistReleasesAll(
    id: number,
    parameters: Omit<PaginationParameters, "page">,
  ): AsyncGenerator<ArtistRelease> {
    for await (const value of this.#client.getArtistReleasesAll(
      id,
      parameters,
    )) {
      yield this.#mapArtistRelease(value);
    }
  }

  async getLabel(id: number): Promise<Label> {
    const value = await this.#client.getLabel(id);
    return {
      id: value.id,
      name: value.name,
      profile: value.profile ?? null,
      contactInfo: value.contact_info ?? null,
      urls: value.urls,
      parentLabel: value.parent_label ?? null,
      url: discogsUrl(value.uri, `label/${String(value.id)}`),
      resourceUrl: value.resource_url,
    };
  }

  async getLabelReleases(
    id: number,
    parameters: PaginationParameters,
  ): Promise<LabelRelease[]> {
    return (await this.#client.getLabelReleases(id, parameters)).map((value) =>
      this.#mapLabelRelease(value),
    );
  }

  async *getLabelReleasesAll(
    id: number,
    parameters: Omit<PaginationParameters, "page">,
  ): AsyncGenerator<LabelRelease> {
    for await (const value of this.#client.getLabelReleasesAll(
      id,
      parameters,
    )) {
      yield this.#mapLabelRelease(value);
    }
  }

  async *searchAll(parameters: SearchParameters): AsyncGenerator<SearchResult> {
    for await (const result of this.#client.searchAll(parameters)) {
      yield this.#mapSearchResult(result);
    }
  }

  #mapSearchResult(result: {
    id: number;
    type: string;
    title: string;
    year?: string | undefined;
    country?: string | undefined;
    format: string[];
    label: string[];
    genre: string[];
    style: string[];
    catno?: string | undefined;
    uri?: string | undefined;
    resource_url: string;
  }): SearchResult {
    return {
      id: result.id,
      type: result.type,
      title: result.title,
      year: result.year ?? null,
      country: result.country ?? null,
      formats: result.format,
      labels: result.label,
      genres: result.genre,
      styles: result.style,
      catalogNumber: result.catno ?? null,
      url:
        result.uri === undefined
          ? `https://www.discogs.com/${result.type}/${String(result.id)}`
          : new URL(result.uri, "https://www.discogs.com").toString(),
      resourceUrl: result.resource_url,
    };
  }

  #mapMasterVersion(value: DiscogsMasterVersion): MasterVersion {
    return {
      id: value.id,
      title: value.title,
      label: value.label ?? null,
      country: value.country ?? null,
      released: value.released ?? null,
      formats: value.major_formats,
      format: value.format ?? null,
      catalogNumber: value.catno ?? null,
      status: value.status ?? null,
      url: `https://www.discogs.com/release/${String(value.id)}`,
      resourceUrl: value.resource_url,
    };
  }

  #mapArtistRelease(value: DiscogsArtistRelease): ArtistRelease {
    return {
      id: value.id,
      title: value.title,
      type: value.type,
      artist: value.artist,
      role: value.role,
      year: value.year ?? null,
      mainReleaseId: value.main_release ?? null,
      url: `https://www.discogs.com/${value.type}/${String(value.id)}`,
      resourceUrl: value.resource_url,
    };
  }

  #mapLabelRelease(value: DiscogsLabelRelease): LabelRelease {
    return {
      id: value.id,
      title: value.title,
      artist: value.artist,
      year: value.year ?? null,
      format: value.format ?? null,
      catalogNumber: value.catno ?? null,
      status: value.status ?? null,
      url: `https://www.discogs.com/release/${String(value.id)}`,
      resourceUrl: value.resource_url,
    };
  }
}

function discogsUrl(uri: string, fallback: string): string {
  return new URL(uri || fallback, "https://www.discogs.com").toString();
}
