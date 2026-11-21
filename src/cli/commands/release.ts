import { Command, InvalidArgumentError, Option } from "commander";

import { DatabaseService } from "../../app/database-service.js";
import {
  marketplaceCurrencies,
  type MarketplaceCurrency,
} from "../../domain/marketplace.js";
import type {
  Release,
  ReleaseCommunityRating,
  ReleaseUserRating,
} from "../../domain/release.js";
import type { MutationResult } from "../../domain/user-resource.js";
import { renderRecord, validateOutputFields } from "../../output/records.js";
import { confirmDestructiveAction } from "../confirmation.js";
import { positiveInteger } from "../create-program.js";
import { fieldsFor, tokenRequestFor } from "../global-options.js";
import type { CliIo } from "../run-cli.js";
import type { CliRuntime } from "../runtime.js";
import {
  addOutputOptions,
  outputFormat,
  type RecordOptions,
} from "./database-common.js";

const releaseColumns = [
  { key: "id", value: (item: Release) => item.id },
  { key: "masterId", value: (item: Release) => item.masterId },
  { key: "title", value: (item: Release) => item.title },
  { key: "artists", value: (item: Release) => item.artists },
  { key: "year", value: (item: Release) => item.year },
  { key: "released", value: (item: Release) => item.released },
  { key: "country", value: (item: Release) => item.country },
  { key: "status", value: (item: Release) => item.status },
  { key: "dataQuality", value: (item: Release) => item.dataQuality },
  { key: "formats", value: (item: Release) => item.formats },
  { key: "labels", value: (item: Release) => item.labels },
  { key: "companies", value: (item: Release) => item.companies },
  { key: "identifiers", value: (item: Release) => item.identifiers },
  { key: "tracklist", value: (item: Release) => item.tracklist },
  { key: "notes", value: (item: Release) => item.notes },
  { key: "genres", value: (item: Release) => item.genres },
  { key: "styles", value: (item: Release) => item.styles },
  { key: "community", value: (item: Release) => item.community },
  { key: "lowestPrice", value: (item: Release) => item.lowestPrice },
  { key: "numForSale", value: (item: Release) => item.numForSale },
  { key: "url", value: (item: Release) => item.url },
  { key: "resourceUrl", value: (item: Release) => item.resourceUrl },
] as const;

const communityRatingColumns = [
  { key: "releaseId", value: (item: ReleaseCommunityRating) => item.releaseId },
  { key: "average", value: (item: ReleaseCommunityRating) => item.average },
  { key: "count", value: (item: ReleaseCommunityRating) => item.count },
] as const;

const userRatingColumns = [
  { key: "releaseId", value: (item: ReleaseUserRating) => item.releaseId },
  { key: "username", value: (item: ReleaseUserRating) => item.username },
  { key: "rating", value: (item: ReleaseUserRating) => item.rating },
] as const;

const ratingMutationColumns = [
  { key: "action", value: (item: MutationResult) => item.action },
  { key: "username", value: (item: MutationResult) => item.username },
  { key: "releaseId", value: (item: MutationResult) => item.releaseId },
  { key: "rating", value: (item: MutationResult) => item.rating },
  { key: "dryRun", value: (item: MutationResult) => item.dryRun },
] as const;

export function createReleaseCommand(io: CliIo, runtime: CliRuntime): Command {
  const release = new Command("release").description(
    "Read Discogs releases and manage release ratings.",
  );

  addOutputOptions(
    release
      .command("get")
      .description(
        "Get full pressing details for a release (labels, catno, identifiers/matrix, tracklist, notes, community stats).",
      )
      .argument("<id>", "Discogs release ID", positiveInteger),
  )
    .addOption(
      new Option(
        "--currency <code>",
        "Currency for the release's lowestPrice summary.",
      ).choices([...marketplaceCurrencies]),
    )
    .action(
      async (
        id: number,
        options: RecordOptions & { currency?: MarketplaceCurrency },
        command: Command,
      ) => {
        const requestedFormat = outputFormat(options, command);
        const fields = fieldsFor(command);
        validateOutputFields(releaseColumns, fields);
        const format = await runtime.formatFor(
          command,
          requestedFormat,
          options.json,
        );
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_optional"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const service = new DatabaseService(client);
        const result = await service.getRelease(id, options.currency);
        renderRecord(result, format, releaseColumns, io.stdout, fields);
      },
    );

  const ratingCmd = release
    .command("rating")
    .description("Read or manage Discogs release ratings.");

  addOutputOptions(
    ratingCmd
      .command("get")
      .description(
        "Get a release's community rating, or your own rating with --mine.",
      )
      .argument("<id>", "Discogs release ID", positiveInteger),
  )
    .option("--mine", "Read the authenticated user's own rating instead.")
    .action(
      async (
        id: number,
        options: RecordOptions & { mine?: boolean },
        command: Command,
      ) => {
        const requestedFormat = outputFormat(options, command);
        const fields = fieldsFor(command);
        const mine = options.mine === true;
        validateOutputFields(
          mine ? userRatingColumns : communityRatingColumns,
          fields,
        );
        const format = await runtime.formatFor(
          command,
          requestedFormat,
          options.json,
        );
        if (mine) {
          const resolved = await runtime.tokens.resolve(
            tokenRequestFor(command, "token_required"),
          );
          const client = await runtime.clientFor(command, resolved?.token);
          const identity = await client.getIdentity();
          const result = await new DatabaseService(client).getReleaseUserRating(
            id,
            identity.username,
          );
          renderRecord(result, format, userRatingColumns, io.stdout, fields);
          return;
        }
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_optional"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const result = await new DatabaseService(
          client,
        ).getReleaseCommunityRating(id);
        renderRecord(result, format, communityRatingColumns, io.stdout, fields);
      },
    );

  addOutputOptions(
    ratingCmd
      .command("set")
      .description("Set the authenticated user's rating (1–5) for a release.")
      .argument("<id>", "Discogs release ID", positiveInteger)
      .argument("<rating>", "Rating from 1 to 5", oneToFiveRating),
  )
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        id: number,
        value: number,
        options: RecordOptions & { dryRun?: boolean },
        command: Command,
      ) => {
        const requestedFormat = outputFormat(options, command);
        const fields = fieldsFor(command);
        const dryRun = options.dryRun === true;
        validateOutputFields(
          dryRun ? ratingMutationColumns : userRatingColumns,
          fields,
        );
        const format = await runtime.formatFor(
          command,
          requestedFormat,
          options.json,
        );
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const identity = await client.getIdentity();
        if (dryRun) {
          renderRecord(
            {
              action: "release.rating.set",
              username: identity.username,
              releaseId: id,
              rating: value,
              dryRun: true,
            },
            format,
            ratingMutationColumns,
            io.stdout,
            fields,
          );
          return;
        }
        const result = await new DatabaseService(client).setReleaseRating(
          id,
          identity.username,
          value,
        );
        renderRecord(result, format, userRatingColumns, io.stdout, fields);
      },
    );

  addOutputOptions(
    ratingCmd
      .command("remove")
      .description("Delete the authenticated user's rating for a release.")
      .argument("<id>", "Discogs release ID", positiveInteger),
  )
    .option("--yes", "Skip the confirmation prompt.")
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        id: number,
        options: RecordOptions & { yes?: boolean; dryRun?: boolean },
        command: Command,
      ) => {
        const requestedFormat = outputFormat(options, command);
        const fields = fieldsFor(command);
        validateOutputFields(ratingMutationColumns, fields);
        const format = await runtime.formatFor(
          command,
          requestedFormat,
          options.json,
        );
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const identity = await client.getIdentity();
        const mutation: MutationResult = {
          action: "release.rating.remove",
          username: identity.username,
          releaseId: id,
          dryRun: options.dryRun === true,
        };
        if (options.dryRun !== true) {
          await confirmDestructiveAction(
            runtime,
            options.yes === true,
            `Remove your rating for release ${String(id)}?`,
          );
          await new DatabaseService(client).deleteReleaseRating(
            id,
            identity.username,
          );
        }
        renderRecord(
          mutation,
          format,
          ratingMutationColumns,
          io.stdout,
          fields,
        );
      },
    );

  return release;
}

function oneToFiveRating(value: string): number {
  const parsed = positiveInteger(value);
  if (parsed > 5) {
    throw new InvalidArgumentError("expected a rating from 1 to 5");
  }
  return parsed;
}
