import type {
  ArtistReleasesParameters,
  DiscogsClient,
  MasterVersionsParameters,
  PaginationParameters,
  SearchParameters,
} from "../discogs/client.js";
import type {
  DiscogsArtistRelease,
  DiscogsLabelRelease,
  DiscogsMasterVersion,
} from "../discogs/database-schemas.js";
import type { DiscogsSearchResult } from "../discogs/schemas.js";
import type {
  Artist,
  ArtistRelease,
  Label,
  LabelRelease,
  Master,
  MasterVersion,
} from "../domain/database-resource.js";
import type { MarketplaceCurrency } from "../domain/marketplace.js";
import type {
  Release,
  ReleaseCommunityRating,
  ReleaseUserRating,
} from "../domain/release.js";
import type { SearchResult } from "../domain/search-result.js";

export class DatabaseService {
  readonly #client: DiscogsClient;

  constructor(client: DiscogsClient) {
    this.#client = client;
  }

  async getRelease(
    id: number,
    currency?: MarketplaceCurrency,
  ): Promise<Release> {
    const release = await this.#client.getRelease(id, currency);
    return {
      id: release.id,
      masterId:
        release.master_id == null || release.master_id === 0
          ? null
          : release.master_id,
      title: release.title,
      artists: release.artists.map((artist) => artist.name),
      year: release.year ?? null,
      released: release.released_formatted || release.released || null,
      country: release.country ?? null,
      status: release.status ?? null,
      dataQuality: release.data_quality ?? null,
      formats: release.formats.map((format) => {
        const prefix =
          format.qty !== undefined && format.qty !== "" && format.qty !== "1"
            ? `${format.qty}x `
            : "";
        const extras = [
          ...(format.descriptions ?? []),
          ...(format.text != null && format.text.trim().length > 0
            ? [format.text.trim()]
            : []),
        ];
        return extras.length === 0
          ? `${prefix}${format.name}`
          : `${prefix}${format.name} (${extras.join(", ")})`;
      }),
      labels: release.labels.map((label) => ({
        name: label.name,
        catalogNumber:
          label.catno != null && label.catno.length > 0 ? label.catno : null,
      })),
      companies: release.companies.map((company) => ({
        name: company.name,
        entityType: company.entity_type_name ?? null,
        catalogNumber:
          company.catno != null && company.catno.length > 0
            ? company.catno
            : null,
      })),
      identifiers: release.identifiers.map((identifier) => ({
        type: identifier.type,
        value: identifier.value,
        description: identifier.description ?? null,
      })),
      tracklist: release.tracklist.map((track) => ({
        position: track.position,
        title: track.title,
        duration:
          track.duration != null && track.duration.length > 0
            ? track.duration
            : null,
        type: track.type_ ?? null,
      })),
      notes: release.notes ?? null,
      genres: release.genres,
      styles: release.styles,
      community:
        release.community == null
          ? null
          : {
              have: release.community.have,
              want: release.community.want,
              ratingAverage: release.community.rating?.average ?? null,
              ratingCount: release.community.rating?.count ?? 0,
            },
      lowestPrice: release.lowest_price ?? null,
      numForSale: release.num_for_sale ?? null,
      url: discogsUrl(release.uri ?? "", `release/${String(release.id)}`),
      resourceUrl: release.resource_url ?? null,
    };
  }

  async getReleaseCommunityRating(id: number): Promise<ReleaseCommunityRating> {
    const value = await this.#client.getReleaseCommunityRating(id);
    return {
      releaseId: value.release_id,
      average: value.rating.average,
      count: value.rating.count,
    };
  }

  async getReleaseUserRating(
    id: number,
    username: string,
  ): Promise<ReleaseUserRating> {
    const value = await this.#client.getReleaseUserRating(id, username);
    return {
      releaseId: value.release_id,
      username: value.username,
      rating: value.rating,
    };
  }

  async setReleaseRating(
    id: number,
    username: string,
    rating: number,
  ): Promise<ReleaseUserRating> {
    const value = await this.#client.setReleaseRating(id, username, rating);
    return {
      releaseId: value.release_id,
      username: value.username,
      rating: value.rating,
    };
  }

  async deleteReleaseRating(id: number, username: string): Promise<void> {
    await this.#client.deleteReleaseRating(id, username);
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
    parameters: MasterVersionsParameters,
  ): Promise<MasterVersion[]> {
    return (await this.#client.getMasterVersions(id, parameters)).map((value) =>
      this.#mapMasterVersion(value),
    );
  }

  async *getMasterVersionsAll(
    id: number,
    parameters: Omit<MasterVersionsParameters, "page">,
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
    parameters: ArtistReleasesParameters,
  ): Promise<ArtistRelease[]> {
    return (await this.#client.getArtistReleases(id, parameters)).map((value) =>
      this.#mapArtistRelease(value),
    );
  }

  async *getArtistReleasesAll(
    id: number,
    parameters: Omit<ArtistReleasesParameters, "page">,
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

  #mapSearchResult(result: DiscogsSearchResult): SearchResult {
    return {
      id: result.id,
      masterId:
        result.master_id == null || result.master_id === 0
          ? null
          : result.master_id,
      type: result.type,
      title: result.title,
      year: result.year ?? null,
      country: result.country ?? null,
      formats: result.format,
      labels: result.label,
      genres: result.genre,
      styles: result.style,
      barcodes: result.barcode,
      catalogNumber: result.catno ?? null,
      url: discogsUrl(result.uri ?? "", `${result.type}/${String(result.id)}`),
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
      have: value.stats?.community?.in_collection ?? null,
      want: value.stats?.community?.in_wantlist ?? null,
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
