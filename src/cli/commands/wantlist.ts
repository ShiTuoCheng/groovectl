import { Command, InvalidArgumentError } from "commander";

import { WantlistService } from "../../app/wantlist-service.js";
import type {
  MutationResult,
  WantlistItem,
} from "../../domain/user-resource.js";
import { AppError } from "../../errors/app-error.js";
import {
  renderRecord,
  renderRecords,
  validateOutputFields,
} from "../../output/records.js";
import { positiveInteger, rating } from "../create-program.js";
import { confirmDestructiveAction } from "../confirmation.js";
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

const itemColumns = [
  { key: "id", value: (item: WantlistItem) => item.id },
  { key: "title", value: (item: WantlistItem) => item.title },
  { key: "artists", value: (item: WantlistItem) => item.artists },
  { key: "year", value: (item: WantlistItem) => item.year },
  { key: "formats", value: (item: WantlistItem) => item.formats },
  { key: "labels", value: (item: WantlistItem) => item.labels },
  {
    key: "catalogNumbers",
    value: (item: WantlistItem) => item.catalogNumbers,
  },
  { key: "rating", value: (item: WantlistItem) => item.rating },
  { key: "notes", value: (item: WantlistItem) => item.notes },
] as const;
const mutationColumns = [
  { key: "action", value: (item: MutationResult) => item.action },
  { key: "username", value: (item: MutationResult) => item.username },
  { key: "releaseId", value: (item: MutationResult) => item.releaseId },
  { key: "rating", value: (item: MutationResult) => item.rating },
  { key: "notes", value: (item: MutationResult) => item.notes },
  { key: "dryRun", value: (item: MutationResult) => item.dryRun },
] as const;

export function createWantlistCommand(io: CliIo, runtime: CliRuntime): Command {
  const wantlist = new Command("wantlist").description(
    "Read and manage the authenticated user's Discogs wantlist.",
  );

  addListOptions(
    wantlist.command("list").description("List wantlist releases."),
  )
    .option(
      "--query <text>",
      "Filter read items locally by title, artist, label, catalog number, or notes.",
      nonEmptyQuery,
    )
    .action(
      async (options: ListOptions & { query?: string }, command: Command) => {
        validateListOptions(options, command);
        const fields = fieldsFor(command);
        validateOutputFields(itemColumns, fields);
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const { service, username } = await context(runtime, command);
        const rawValues =
          options.all === true
            ? service.listAll(username, { per_page: options.perPage })
            : asAsync(
                await service.list(username, {
                  per_page: options.perPage,
                  ...(options.page === undefined ? {} : { page: options.page }),
                }),
              );
        const values =
          options.query === undefined
            ? rawValues
            : filterWantlistItems(rawValues, options.query);
        await renderRecords(
          values,
          format,
          itemColumns,
          io.stdout,
          fields,
          options.limit,
        );
      },
    );

  addOutputOptions(
    wantlist
      .command("add")
      .description("Add a release to the wantlist.")
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  )
    .option("--rating <rating>", "Rating from 0 to 5", rating)
    .option("--notes <text>", "Wantlist notes")
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        releaseId: number,
        options: RecordOptions & {
          rating?: number;
          notes?: string;
          dryRun?: boolean;
        },
        command: Command,
      ) => {
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(
          options.dryRun === true ? mutationColumns : itemColumns,
          fields,
        );
        const { service, username } = await context(runtime, command);
        if (options.dryRun === true) {
          renderRecord(
            result("wantlist.add", username, releaseId, options),
            format,
            mutationColumns,
            io.stdout,
            fields,
          );
          return;
        }
        renderRecord(
          await service.add(username, releaseId, update(options)),
          format,
          itemColumns,
          io.stdout,
          fields,
        );
      },
    );

  addOutputOptions(
    wantlist
      .command("update")
      .description("Update a wantlist release.")
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  )
    .option("--rating <rating>", "Rating from 0 to 5", rating)
    .option("--notes <text>", "Wantlist notes")
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        releaseId: number,
        options: RecordOptions & {
          rating?: number;
          notes?: string;
          dryRun?: boolean;
        },
        command: Command,
      ) => {
        if (options.rating === undefined && options.notes === undefined)
          throw new AppError({
            kind: "usage",
            code: "GROOVECTL_USAGE",
            message: "Provide --rating and/or --notes.",
          });
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(
          options.dryRun === true ? mutationColumns : itemColumns,
          fields,
        );
        const { service, username } = await context(runtime, command);
        if (options.dryRun === true) {
          renderRecord(
            result("wantlist.update", username, releaseId, options),
            format,
            mutationColumns,
            io.stdout,
            fields,
          );
          return;
        }
        renderRecord(
          await service.update(username, releaseId, update(options)),
          format,
          itemColumns,
          io.stdout,
          fields,
        );
      },
    );

  addOutputOptions(
    wantlist
      .command("remove")
      .description("Remove a release from the wantlist.")
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  )
    .option("--yes", "Skip the confirmation prompt.")
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        releaseId: number,
        options: RecordOptions & { yes?: boolean; dryRun?: boolean },
        command: Command,
      ) => {
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(mutationColumns, fields);
        const { service, username } = await context(runtime, command);
        const mutation = result(
          "wantlist.remove",
          username,
          releaseId,
          options,
        );
        if (options.dryRun !== true) {
          await confirmDestructiveAction(
            runtime,
            options.yes === true,
            `Remove release ${String(releaseId)} from the wantlist?`,
          );
          await service.remove(username, releaseId);
        }
        renderRecord(mutation, format, mutationColumns, io.stdout, fields);
      },
    );
  return wantlist;
}

async function context(
  runtime: CliRuntime,
  command: Command,
): Promise<{ service: WantlistService; username: string }> {
  const resolved = await runtime.tokens.resolve(
    tokenRequestFor(command, "token_required"),
  );
  const client = await runtime.clientFor(command, resolved?.token);
  const identity = await client.getIdentity();
  return { service: new WantlistService(client), username: identity.username };
}
function update(options: { rating?: number; notes?: string }): {
  rating?: number;
  notes?: string;
} {
  return {
    ...(options.rating === undefined ? {} : { rating: options.rating }),
    ...(options.notes === undefined ? {} : { notes: options.notes }),
  };
}
function result(
  action: string,
  username: string,
  releaseId: number,
  options: { rating?: number; notes?: string; dryRun?: boolean },
): MutationResult {
  return {
    action,
    username,
    releaseId,
    ...update(options),
    dryRun: options.dryRun === true,
  };
}

function nonEmptyQuery(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidArgumentError("expected a non-empty query");
  }
  return trimmed;
}

async function* filterWantlistItems(
  items: AsyncIterable<WantlistItem>,
  query: string,
): AsyncGenerator<WantlistItem> {
  const needle = query.toLowerCase();
  for await (const item of items) {
    const haystack = [
      item.title,
      ...item.artists,
      ...item.labels,
      ...item.catalogNumbers,
      item.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(needle)) yield item;
  }
}
