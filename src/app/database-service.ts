import type { DiscogsClient } from "../discogs/client.js";
import type { Release } from "../domain/release.js";

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
}
