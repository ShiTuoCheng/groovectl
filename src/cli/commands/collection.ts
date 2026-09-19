import { Command, Option } from "commander";

import { CollectionService } from "../../app/collection-service.js";
import type {
  CollectionAddResult,
  CollectionFolder,
  CollectionItem,
  CollectionValue,
  MutationResult,
} from "../../domain/user-resource.js";
import { AppError } from "../../errors/app-error.js";
import { renderRecord, renderRecords } from "../../output/records.js";
import {
  nonNegativeInteger,
  positiveInteger,
  rating,
} from "../create-program.js";
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

const folderColumns = [
  { key: "id", value: (item: CollectionFolder) => item.id },
  { key: "name", value: (item: CollectionFolder) => item.name },
  { key: "count", value: (item: CollectionFolder) => item.count },
  { key: "resourceUrl", value: (item: CollectionFolder) => item.resourceUrl },
] as const;
const itemColumns = [
  { key: "id", value: (item: CollectionItem) => item.id },
  { key: "instanceId", value: (item: CollectionItem) => item.instanceId },
  { key: "folderId", value: (item: CollectionItem) => item.folderId },
  { key: "title", value: (item: CollectionItem) => item.title },
  { key: "artists", value: (item: CollectionItem) => item.artists },
  { key: "year", value: (item: CollectionItem) => item.year },
  { key: "formats", value: (item: CollectionItem) => item.formats },
  { key: "rating", value: (item: CollectionItem) => item.rating },
  { key: "dateAdded", value: (item: CollectionItem) => item.dateAdded },
] as const;
const addColumns = [
  { key: "releaseId", value: (item: CollectionAddResult) => item.releaseId },
  { key: "folderId", value: (item: CollectionAddResult) => item.folderId },
  { key: "instanceId", value: (item: CollectionAddResult) => item.instanceId },
  {
    key: "resourceUrl",
    value: (item: CollectionAddResult) => item.resourceUrl,
  },
] as const;
const mutationColumns = [
  { key: "action", value: (item: MutationResult) => item.action },
  { key: "username", value: (item: MutationResult) => item.username },
  { key: "releaseId", value: (item: MutationResult) => item.releaseId },
  { key: "folderId", value: (item: MutationResult) => item.folderId },
  { key: "instanceId", value: (item: MutationResult) => item.instanceId },
  { key: "rating", value: (item: MutationResult) => item.rating },
  { key: "dryRun", value: (item: MutationResult) => item.dryRun },
] as const;
const valueColumns = [
  { key: "minimum", value: (item: CollectionValue) => item.minimum.display },
  { key: "median", value: (item: CollectionValue) => item.median.display },
  { key: "maximum", value: (item: CollectionValue) => item.maximum.display },
] as const;

interface CollectionListOptions extends ListOptions {
  folder: number;
  sort?:
    | "label"
    | "artist"
    | "title"
    | "catno"
    | "format"
    | "rating"
    | "added"
    | "year";
  sortOrder?: "asc" | "desc";
}

export function createCollectionCommand(
  io: CliIo,
  runtime: CliRuntime,
): Command {
  const collection = new Command("collection").description(
    "Read and manage the authenticated user's Discogs collection.",
  );

  addOutputOptions(
    collection.command("folders").description("List collection folders."),
  ).action(async (options: RecordOptions, command: Command) => {
    const { service, username } = await context(runtime, command);
    await renderRecords(
      asAsync(await service.folders(username)),
      await runtime.formatFor(command, outputFormat(options), options.json),
      folderColumns,
      io.stdout,
      fieldsFor(command),
    );
  });

  addListOptions(
    collection.command("list").description("List collection releases."),
  )
    .option(
      "--folder <id>",
      "Folder ID (0 means all folders)",
      nonNegativeInteger,
      0,
    )
    .addOption(
      new Option("--sort <field>", "Sort field").choices([
        "label",
        "artist",
        "title",
        "catno",
        "format",
        "rating",
        "added",
        "year",
      ]),
    )
    .addOption(
      new Option("--sort-order <order>", "Sort order").choices(["asc", "desc"]),
    )
    .action(async (options: CollectionListOptions, command: Command) => {
      validateListOptions(options);
      const { service, username } = await context(runtime, command);
      const parameters = {
        per_page: options.perPage,
        ...(options.page === undefined ? {} : { page: options.page }),
        ...(options.sort === undefined ? {} : { sort: options.sort }),
        ...(options.sortOrder === undefined
          ? {}
          : { sort_order: options.sortOrder }),
      };
      const allParameters = {
        per_page: options.perPage,
        ...(options.sort === undefined ? {} : { sort: options.sort }),
        ...(options.sortOrder === undefined
          ? {}
          : { sort_order: options.sortOrder }),
      };
      const values =
        options.all === true
          ? service.listAll(username, options.folder, allParameters)
          : asAsync(await service.list(username, options.folder, parameters));
      await renderRecords(
        values,
        await runtime.formatFor(command, outputFormat(options), options.json),
        itemColumns,
        io.stdout,
        fieldsFor(command),
      );
    });

  addOutputOptions(
    collection
      .command("contains")
      .description("List owned instances of a release.")
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  ).action(
    async (releaseId: number, options: RecordOptions, command: Command) => {
      const { service, username } = await context(runtime, command);
      await renderRecords(
        asAsync(await service.contains(username, releaseId)),
        await runtime.formatFor(command, outputFormat(options), options.json),
        itemColumns,
        io.stdout,
        fieldsFor(command),
      );
    },
  );

  addOutputOptions(
    collection
      .command("add")
      .description("Add a release to the collection.")
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  )
    .option("--folder <id>", "Target folder ID", positiveInteger, 1)
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        releaseId: number,
        options: RecordOptions & { folder: number; dryRun?: boolean },
        command: Command,
      ) => {
        const { service, username } = await context(runtime, command);
        if (options.dryRun === true) {
          renderRecord(
            {
              action: "collection.add",
              username,
              releaseId,
              folderId: options.folder,
              dryRun: true,
            },
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
          await service.add(username, options.folder, releaseId),
          await runtime.formatFor(command, outputFormat(options), options.json),
          addColumns,
          io.stdout,
          fieldsFor(command),
        );
      },
    );

  addOutputOptions(
    collection
      .command("update")
      .description("Update one collection instance.")
      .argument("<folder-id>", "Current folder ID", nonNegativeInteger)
      .argument("<release-id>", "Discogs release ID", positiveInteger)
      .argument("<instance-id>", "Collection instance ID", positiveInteger),
  )
    .option("--rating <rating>", "Rating from 0 to 5", rating)
    .option("--move-to <folder-id>", "Move to folder ID", nonNegativeInteger)
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        folderId: number,
        releaseId: number,
        instanceId: number,
        options: RecordOptions & {
          rating?: number;
          moveTo?: number;
          dryRun?: boolean;
        },
        command: Command,
      ) => {
        if (options.rating === undefined && options.moveTo === undefined)
          throw usage("Provide --rating and/or --move-to.");
        const { service, username } = await context(runtime, command);
        const result: MutationResult = {
          action: "collection.update",
          username,
          releaseId,
          folderId: options.moveTo ?? folderId,
          instanceId,
          ...(options.rating === undefined ? {} : { rating: options.rating }),
          dryRun: options.dryRun === true,
        };
        if (options.dryRun !== true)
          await service.update(username, folderId, releaseId, instanceId, {
            ...(options.moveTo === undefined
              ? {}
              : { folder_id: options.moveTo }),
            ...(options.rating === undefined ? {} : { rating: options.rating }),
          });
        renderRecord(
          result,
          await runtime.formatFor(command, outputFormat(options), options.json),
          mutationColumns,
          io.stdout,
          fieldsFor(command),
        );
      },
    );

  addOutputOptions(
    collection
      .command("remove")
      .description("Remove one collection instance.")
      .argument("<folder-id>", "Current folder ID", nonNegativeInteger)
      .argument("<release-id>", "Discogs release ID", positiveInteger)
      .argument("<instance-id>", "Collection instance ID", positiveInteger),
  )
    .option("--yes", "Skip the confirmation prompt.")
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        folderId: number,
        releaseId: number,
        instanceId: number,
        options: RecordOptions & { yes?: boolean; dryRun?: boolean },
        command: Command,
      ) => {
        const { service, username } = await context(runtime, command);
        const result: MutationResult = {
          action: "collection.remove",
          username,
          releaseId,
          folderId,
          instanceId,
          dryRun: options.dryRun === true,
        };
        if (options.dryRun !== true) {
          await confirmDestructiveAction(
            runtime,
            options.yes === true,
            `Remove release ${String(releaseId)} instance ${String(instanceId)}?`,
          );
          await service.remove(username, folderId, releaseId, instanceId);
        }
        renderRecord(
          result,
          await runtime.formatFor(command, outputFormat(options), options.json),
          mutationColumns,
          io.stdout,
          fieldsFor(command),
        );
      },
    );

  addOutputOptions(
    collection.command("value").description("Show estimated collection value."),
  ).action(async (options: RecordOptions, command: Command) => {
    const { service, username } = await context(runtime, command);
    renderRecord(
      await service.value(username),
      await runtime.formatFor(command, outputFormat(options), options.json),
      valueColumns,
      io.stdout,
      fieldsFor(command),
    );
  });
  return collection;
}

async function context(
  runtime: CliRuntime,
  command: Command,
): Promise<{ service: CollectionService; username: string }> {
  const resolved = await runtime.tokens.resolve(
    tokenRequestFor(command, "token_required"),
  );
  const client = await runtime.clientFor(command, resolved?.token);
  const identity = await client.getIdentity();
  return {
    service: new CollectionService(client),
    username: identity.username,
  };
}

function usage(message: string): AppError {
  return new AppError({ kind: "usage", code: "CRATEFLOW_USAGE", message });
}
