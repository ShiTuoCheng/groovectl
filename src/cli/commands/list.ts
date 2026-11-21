import { Command } from "commander";

import { UserService } from "../../app/user-service.js";
import type {
  UserListDetail,
  UserListSummary,
} from "../../domain/user-resource.js";
import {
  renderRecord,
  renderRecords,
  validateOutputFields,
} from "../../output/records.js";
import { nonEmptyText, positiveInteger } from "../create-program.js";
import { fieldsFor, tokenRequestFor } from "../global-options.js";
import type { CliIo } from "../run-cli.js";
import type { CliRuntime } from "../runtime.js";
import {
  addListOptions,
  addOutputOptions,
  asAsync,
  outputFormat,
  validateListOptions,
  type ListOptions,
  type RecordOptions,
} from "./database-common.js";

const listSummaryColumns = [
  { key: "id", value: (item: UserListSummary) => item.id },
  { key: "name", value: (item: UserListSummary) => item.name },
  { key: "public", value: (item: UserListSummary) => item.public },
  { key: "dateAdded", value: (item: UserListSummary) => item.dateAdded },
  { key: "dateChanged", value: (item: UserListSummary) => item.dateChanged },
  { key: "description", value: (item: UserListSummary) => item.description },
  { key: "url", value: (item: UserListSummary) => item.url },
] as const;

const listDetailColumns = [
  ...listSummaryColumns,
  { key: "items", value: (item: UserListDetail) => item.items },
] as const;

export function createListCommand(io: CliIo, runtime: CliRuntime): Command {
  const list = new Command("list").description("Read Discogs user lists.");

  addListOptions(
    list
      .command("ls")
      .description(
        "List a user's Discogs lists (defaults to the authenticated user when username is omitted).",
      )
      .argument("[username]", "Discogs username", nonEmptyText),
  ).action(
    async (
      username: string | undefined,
      options: ListOptions,
      command: Command,
    ) => {
      validateListOptions(options, command);
      const fields = fieldsFor(command);
      validateOutputFields(listSummaryColumns, fields);
      const format = await runtime.formatFor(
        command,
        outputFormat(options, command),
        options.json,
      );
      const policy =
        username === undefined ? "token_required" : "token_optional";
      const resolved = await runtime.tokens.resolve(
        tokenRequestFor(command, policy),
      );
      const client = await runtime.clientFor(command, resolved?.token);
      const targetUsername = username ?? (await client.getIdentity()).username;
      const service = new UserService(client);
      const values =
        options.all === true
          ? service.getListsAll(targetUsername, { per_page: options.perPage })
          : asAsync(
              await service.getLists(targetUsername, {
                per_page: options.perPage,
                ...(options.page === undefined ? {} : { page: options.page }),
              }),
            );
      await renderRecords(
        values,
        format,
        listSummaryColumns,
        io.stdout,
        fields,
        options.limit,
      );
    },
  );

  addOutputOptions(
    list
      .command("get")
      .description("Get details and items of a Discogs list by ID.")
      .argument("<list-id>", "Discogs list ID", positiveInteger),
  ).action(async (listId: number, options: RecordOptions, command: Command) => {
    const requestedFormat = outputFormat(options, command);
    const fields = fieldsFor(command);
    validateOutputFields(listDetailColumns, fields);
    const format = await runtime.formatFor(
      command,
      requestedFormat,
      options.json,
    );
    const resolved = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_optional"),
    );
    const client = await runtime.clientFor(command, resolved?.token);
    const result = await new UserService(client).getList(listId);
    renderRecord(result, format, listDetailColumns, io.stdout, fields);
  });

  return list;
}
