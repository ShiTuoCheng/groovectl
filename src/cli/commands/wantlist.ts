import { Command } from "commander";

import { WantlistService } from "../../app/wantlist-service.js";
import type {
  MutationResult,
  WantlistItem,
} from "../../domain/user-resource.js";
import { AppError } from "../../errors/app-error.js";
import { renderRecord, renderRecords } from "../../output/records.js";
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
  ).action(async (options: ListOptions, command: Command) => {
    validateListOptions(options);
    const { service, username } = await context(runtime, command);
    const values =
      options.all === true
        ? service.listAll(username, { per_page: options.perPage })
        : asAsync(
            await service.list(username, {
              per_page: options.perPage,
              ...(options.page === undefined ? {} : { page: options.page }),
            }),
          );
    await renderRecords(
      values,
      await runtime.formatFor(command, outputFormat(options), options.json),
      itemColumns,
      io.stdout,
      fieldsFor(command),
    );
  });

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
        const { service, username } = await context(runtime, command);
        if (options.dryRun === true) {
          renderRecord(
            result("wantlist.add", username, releaseId, options),
            await runtime.formatFor(
              command,
              outputFormat(options),
              options.json,
            ),
            mutationColumns,
            io.stdout,
            fieldsFor(command),
          );
          return;
        }
        renderRecord(
          await service.add(username, releaseId, update(options)),
          await runtime.formatFor(command, outputFormat(options), options.json),
          itemColumns,
          io.stdout,
          fieldsFor(command),
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
            code: "CRATEFLOW_USAGE",
            message: "Provide --rating and/or --notes.",
          });
        const { service, username } = await context(runtime, command);
        if (options.dryRun === true) {
          renderRecord(
            result("wantlist.update", username, releaseId, options),
            await runtime.formatFor(
              command,
              outputFormat(options),
              options.json,
            ),
            mutationColumns,
            io.stdout,
            fieldsFor(command),
          );
          return;
        }
        renderRecord(
          await service.update(username, releaseId, update(options)),
          await runtime.formatFor(command, outputFormat(options), options.json),
          itemColumns,
          io.stdout,
          fieldsFor(command),
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
        renderRecord(
          mutation,
          await runtime.formatFor(command, outputFormat(options), options.json),
          mutationColumns,
          io.stdout,
          fieldsFor(command),
        );
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
