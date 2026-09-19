import type { DiscogsBasicInformation } from "../discogs/user-schemas.js";
import type { BasicReleaseInformation } from "../domain/user-resource.js";

export function mapBasicInformation(
  value: DiscogsBasicInformation,
): BasicReleaseInformation {
  return {
    id: value.id,
    title: value.title,
    artists: value.artists.map((artist) => artist.name),
    year: value.year ?? null,
    formats: value.formats.map((format) => {
      const details = format.descriptions.join(", ");
      return details.length === 0 ? format.name : `${format.name} (${details})`;
    }),
    labels: value.labels.map((label) => label.name),
    catalogNumbers: value.labels.flatMap((label) =>
      label.catno === undefined ? [] : [label.catno],
    ),
    url: `https://www.discogs.com/release/${String(value.id)}`,
    resourceUrl: value.resource_url,
    thumbnailUrl:
      value.thumb === undefined || value.thumb === "" ? null : value.thumb,
    coverImageUrl:
      value.cover_image === undefined || value.cover_image === ""
        ? null
        : value.cover_image,
  };
}
