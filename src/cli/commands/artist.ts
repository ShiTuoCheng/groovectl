import { Command } from "commander";

import { DatabaseService } from "../../app/database-service.js";
import type { Artist, ArtistRelease } from "../../domain/database-resource.js";
import { renderRecord, renderRecords } from "../../output/records.js";
import { positiveInteger } from "../create-program.js";
import { fieldsFor, tokenRequestFor } from "../global-options.js";
import type { CliRuntime } from "../runtime.js";
import type { CliIo } from "../run-cli.js";
import {
  addListOptions,
  addOutputOptions,
  asAsync,
  outputFormat,
  type ListOptions,
  type RecordOptions,
  validateListOptions,
} from "./database-common.js";

const artistColumns = [
  { key: "id", value: (item: Artist) => item.id },
  { key: "name", value: (item: Artist) => item.name },
  { key: "realName", value: (item: Artist) => item.realName },
  { key: "nameVariations", value: (item: Artist) => item.nameVariations },
  { key: "urls", value: (item: Artist) => item.urls },
  { key: "profile", value: (item: Artist) => item.profile },
  { key: "url", value: (item: Artist) => item.url },
] as const;

const releaseColumns = [
  { key: "type", value: (item: ArtistRelease) => item.type },
  { key: "id", value: (item: ArtistRelease) => item.id },
  { key: "title", value: (item: ArtistRelease) => item.title },
  { key: "artist", value: (item: ArtistRelease) => item.artist },
  { key: "role", value: (item: ArtistRelease) => item.role },
  { key: "year", value: (item: ArtistRelease) => item.year },
] as const;

export function createArtistCommand(io: CliIo, runtime: CliRuntime): Command {
  const artist = new Command("artist").description("Read Discogs artists.");

  addOutputOptions(
    artist
      .command("get")
      .description("Get an artist by ID.")
      .argument("<id>", "Discogs artist ID", positiveInteger),
  ).action(async (id: number, options: RecordOptions, command: Command) => {
    const token = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_optional"),
    );
    const result = await new DatabaseService(
      await runtime.clientFor(command, token?.token),
    ).getArtist(id);
    renderRecord(
      result,
      await runtime.formatFor(command, outputFormat(options), options.json),
      artistColumns,
      io.stdout,
      fieldsFor(command),
    );
  });

  addListOptions(
    artist
      .command("releases")
      .description("List an artist's releases.")
      .argument("<id>", "Discogs artist ID", positiveInteger),
  ).action(async (id: number, options: ListOptions, command: Command) => {
    validateListOptions(options);
    const token = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_optional"),
    );
    const service = new DatabaseService(
      await runtime.clientFor(command, token?.token),
    );
    const values =
      options.all === true
        ? service.getArtistReleasesAll(id, { per_page: options.perPage })
        : asAsync(
            await service.getArtistReleases(id, {
              per_page: options.perPage,
              ...(options.page === undefined ? {} : { page: options.page }),
            }),
          );
    await renderRecords(
      values,
      await runtime.formatFor(command, outputFormat(options), options.json),
      releaseColumns,
      io.stdout,
      fieldsFor(command),
    );
  });

  return artist;
}
