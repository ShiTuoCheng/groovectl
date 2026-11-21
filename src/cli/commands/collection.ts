import { Command, InvalidArgumentError, Option } from "commander";

import { CollectionService } from "../../app/collection-service.js";
import type {
  CollectionAddResult,
  CollectionField,
  CollectionFolder,
  CollectionItem,
  CollectionValue,
  MutationResult,
} from "../../domain/user-resource.js";
import { AppError } from "../../errors/app-error.js";
import {
  renderRecord,
  renderRecords,
  validateOutputFields,
} from "../../output/records.js";
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
const fieldColumns = [
  { key: "id", value: (item: CollectionField) => item.id },
  { key: "name", value: (item: CollectionField) => item.name },
  { key: "type", value: (item: CollectionField) => item.type },
  { key: "position", value: (item: CollectionField) => item.position },
  { key: "public", value: (item: CollectionField) => item.public },
  { key: "lines", value: (item: CollectionField) => item.lines },
  { key: "options", value: (item: CollectionField) => item.options },
] as const;
const itemColumns = [
  { key: "id", value: (item: CollectionItem) => item.id },
  { key: "instanceId", value: (item: CollectionItem) => item.instanceId },
  { key: "folderId", value: (item: CollectionItem) => item.folderId },
  { key: "title", value: (item: CollectionItem) => item.title },
  { key: "artists", value: (item: CollectionItem) => item.artists },
  { key: "year", value: (item: CollectionItem) => item.year },
  { key: "formats", value: (item: CollectionItem) => item.formats },
  { key: "labels", value: (item: CollectionItem) => item.labels },
  {
    key: "catalogNumbers",
    value: (item: CollectionItem) => item.catalogNumbers,
  },
  { key: "rating", value: (item: CollectionItem) => item.rating },
  { key: "dateAdded", value: (item: CollectionItem) => item.dateAdded },
  { key: "notes", value: (item: CollectionItem) => item.notes },
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
  { key: "folderName", value: (item: MutationResult) => item.folderName },
  { key: "instanceId", value: (item: MutationResult) => item.instanceId },
  { key: "fieldId", value: (item: MutationResult) => item.fieldId },
  { key: "value", value: (item: MutationResult) => item.value },
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
  query?: string;
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
    const requestedFormat = outputFormat(options, command);
    const fields = fieldsFor(command);
    validateOutputFields(folderColumns, fields);
    const format = await runtime.formatFor(
      command,
      requestedFormat,
      options.json,
    );
    const { service, username } = await context(runtime, command);
    await renderRecords(
      asAsync(await service.folders(username)),
      format,
      folderColumns,
      io.stdout,
      fields,
    );
  });

  const folderCmd = collection
    .command("folder")
    .description("Read, create, rename, or delete custom collection folders.");

  addOutputOptions(
    folderCmd
      .command("get")
      .description("Get details for one collection folder.")
      .argument("<folder-id>", "Collection folder ID", nonNegativeInteger),
  ).action(
    async (folderId: number, options: RecordOptions, command: Command) => {
      const requestedFormat = outputFormat(options, command);
      const fields = fieldsFor(command);
      validateOutputFields(folderColumns, fields);
      const format = await runtime.formatFor(
        command,
        requestedFormat,
        options.json,
      );
      const { service, username } = await context(runtime, command);
      renderRecord(
        await service.getFolder(username, folderId),
        format,
        folderColumns,
        io.stdout,
        fields,
      );
    },
  );

  addOutputOptions(
    folderCmd
      .command("create")
      .description("Create a new custom collection folder.")
      .argument("<name>", "New folder name", nonEmptyText),
  )
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        name: string,
        options: RecordOptions & { dryRun?: boolean },
        command: Command,
      ) => {
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        const dryRun = options.dryRun === true;
        validateOutputFields(dryRun ? mutationColumns : folderColumns, fields);
        const { service, username } = await context(runtime, command);
        if (dryRun) {
          renderRecord(
            {
              action: "collection.folder.create",
              username,
              folderName: name,
              dryRun: true,
            },
            format,
            mutationColumns,
            io.stdout,
            fields,
          );
          return;
        }
        renderRecord(
          await service.createFolder(username, name),
          format,
          folderColumns,
          io.stdout,
          fields,
        );
      },
    );

  addOutputOptions(
    folderCmd
      .command("rename")
      .description("Rename a custom collection folder (folder ID >= 2).")
      .argument("<folder-id>", "Custom folder ID (>= 2)", nonNegativeInteger)
      .argument("<name>", "New folder name", nonEmptyText),
  )
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        folderId: number,
        name: string,
        options: RecordOptions & { dryRun?: boolean },
        command: Command,
      ) => {
        if (folderId < 2) {
          throw usage(
            "Folders 0 and 1 are Discogs system folders and cannot be renamed.",
          );
        }
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        const dryRun = options.dryRun === true;
        validateOutputFields(dryRun ? mutationColumns : folderColumns, fields);
        const { service, username } = await context(runtime, command);
        if (dryRun) {
          renderRecord(
            {
              action: "collection.folder.rename",
              username,
              folderId,
              folderName: name,
              dryRun: true,
            },
            format,
            mutationColumns,
            io.stdout,
            fields,
          );
          return;
        }
        renderRecord(
          await service.renameFolder(username, folderId, name),
          format,
          folderColumns,
          io.stdout,
          fields,
        );
      },
    );

  addOutputOptions(
    folderCmd
      .command("delete")
      .description("Delete an empty custom collection folder (folder ID >= 2).")
      .argument("<folder-id>", "Custom folder ID (>= 2)", nonNegativeInteger),
  )
    .option("--yes", "Skip the confirmation prompt.")
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        folderId: number,
        options: RecordOptions & { yes?: boolean; dryRun?: boolean },
        command: Command,
      ) => {
        if (folderId < 2) {
          throw usage(
            "Folders 0 and 1 are Discogs system folders and cannot be deleted.",
          );
        }
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(mutationColumns, fields);
        const { service, username } = await context(runtime, command);
        const result: MutationResult = {
          action: "collection.folder.delete",
          username,
          folderId,
          dryRun: options.dryRun === true,
        };
        if (options.dryRun !== true) {
          await confirmDestructiveAction(
            runtime,
            options.yes === true,
            `Delete collection folder ${String(folderId)}?`,
          );
          await service.deleteFolder(username, folderId);
        }
        renderRecord(result, format, mutationColumns, io.stdout, fields);
      },
    );

  addOutputOptions(
    collection
      .command("fields")
      .description(
        "List custom collection fields (such as Media Condition, Sleeve Condition, Notes) and their IDs.",
      ),
  ).action(async (options: RecordOptions, command: Command) => {
    const requestedFormat = outputFormat(options, command);
    const fields = fieldsFor(command);
    validateOutputFields(fieldColumns, fields);
    const format = await runtime.formatFor(
      command,
      requestedFormat,
      options.json,
    );
    const { service, username } = await context(runtime, command);
    await renderRecords(
      asAsync(await service.fields(username)),
      format,
      fieldColumns,
      io.stdout,
      fields,
    );
  });

  const noteCmd = collection
    .command("note")
    .description(
      "Manage custom field values and notes on collection instances.",
    );

  addOutputOptions(
    noteCmd
      .command("set")
      .description(
        "Set a custom field or note value on one collection instance (use `collection fields` to find field IDs).",
      )
      .argument("<folder-id>", "Current folder ID", nonNegativeInteger)
      .argument("<release-id>", "Discogs release ID", positiveInteger)
      .argument("<instance-id>", "Collection instance ID", positiveInteger)
      .argument("<field-id>", "Custom field ID", positiveInteger)
      .argument("<value>", "Field value (pass empty string to clear)"),
  )
    .option("--dry-run", "Show the intended change without writing.")
    .action(
      async (
        folderId: number,
        releaseId: number,
        instanceId: number,
        fieldId: number,
        value: string,
        options: RecordOptions & { dryRun?: boolean },
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
        const result: MutationResult = {
          action: "collection.note.set",
          username,
          folderId,
          releaseId,
          instanceId,
          fieldId,
          value,
          dryRun: options.dryRun === true,
        };
        if (options.dryRun !== true) {
          await service.setField(
            username,
            folderId,
            releaseId,
            instanceId,
            fieldId,
            value,
          );
        }
        renderRecord(result, format, mutationColumns, io.stdout, fields);
      },
    );

  addListOptions(
    collection.command("list").description("List collection releases."),
  )
    .option(
      "--folder <id>",
      "Folder ID (0 means all folders)",
      nonNegativeInteger,
      0,
    )
    .option(
      "--query <text>",
      "Filter read items locally by title, artist, label, catalog number, or notes.",
      nonEmptyText,
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
      validateListOptions(options, command);
      const fields = fieldsFor(command);
      validateOutputFields(itemColumns, fields);
      const format = await runtime.formatFor(
        command,
        outputFormat(options, command),
        options.json,
      );
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
      const rawValues =
        options.all === true
          ? service.listAll(username, options.folder, allParameters)
          : asAsync(await service.list(username, options.folder, parameters));
      const values =
        options.query === undefined
          ? rawValues
          : filterCollectionItems(rawValues, options.query);
      await renderRecords(
        values,
        format,
        itemColumns,
        io.stdout,
        fields,
        options.limit,
      );
    });

  addOutputOptions(
    collection
      .command("contains")
      .description("List owned instances of a release.")
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  ).action(
    async (releaseId: number, options: RecordOptions, command: Command) => {
      const requestedFormat = outputFormat(options, command);
      const fields = fieldsFor(command);
      validateOutputFields(itemColumns, fields);
      const format = await runtime.formatFor(
        command,
        requestedFormat,
        options.json,
      );
      const { service, username } = await context(runtime, command);
      await renderRecords(
        asAsync(await service.contains(username, releaseId)),
        format,
        itemColumns,
        io.stdout,
        fields,
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
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(
          options.dryRun === true ? mutationColumns : addColumns,
          fields,
        );
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
            format,
            mutationColumns,
            io.stdout,
            fields,
          );
          return;
        }
        renderRecord(
          await service.add(username, options.folder, releaseId),
          format,
          addColumns,
          io.stdout,
          fields,
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
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(mutationColumns, fields);
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
        renderRecord(result, format, mutationColumns, io.stdout, fields);
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
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(mutationColumns, fields);
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
        renderRecord(result, format, mutationColumns, io.stdout, fields);
      },
    );

  addOutputOptions(
    collection.command("value").description("Show estimated collection value."),
  ).action(async (options: RecordOptions, command: Command) => {
    const requestedFormat = outputFormat(options, command);
    const fields = fieldsFor(command);
    validateOutputFields(valueColumns, fields);
    const format = await runtime.formatFor(
      command,
      requestedFormat,
      options.json,
    );
    const { service, username } = await context(runtime, command);
    renderRecord(
      await service.value(username),
      format,
      valueColumns,
      io.stdout,
      fields,
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
  return new AppError({ kind: "usage", code: "GROOVECTL_USAGE", message });
}

function nonEmptyText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidArgumentError("expected a non-empty value");
  }
  return trimmed;
}

async function* filterCollectionItems(
  items: AsyncIterable<CollectionItem>,
  query: string,
): AsyncGenerator<CollectionItem> {
  const needle = query.toLowerCase();
  for await (const item of items) {
    const haystack = [
      item.title,
      ...item.artists,
      ...item.labels,
      ...item.catalogNumbers,
      ...item.notes.map((note) => note.value),
    ]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(needle)) yield item;
  }
}
