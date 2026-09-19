import { Command } from "commander";

import { DatabaseService } from "../../app/database-service.js";
import type { Master, MasterVersion } from "../../domain/database-resource.js";
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

const masterColumns = [
  { key: "id", value: (item: Master) => item.id },
  { key: "title", value: (item: Master) => item.title },
  { key: "artists", value: (item: Master) => item.artists },
  { key: "year", value: (item: Master) => item.year },
  { key: "genres", value: (item: Master) => item.genres },
  { key: "styles", value: (item: Master) => item.styles },
  { key: "mainReleaseId", value: (item: Master) => item.mainReleaseId },
  { key: "url", value: (item: Master) => item.url },
] as const;

const versionColumns = [
  { key: "id", value: (item: MasterVersion) => item.id },
  { key: "title", value: (item: MasterVersion) => item.title },
  { key: "label", value: (item: MasterVersion) => item.label },
  { key: "country", value: (item: MasterVersion) => item.country },
  { key: "released", value: (item: MasterVersion) => item.released },
  { key: "formats", value: (item: MasterVersion) => item.formats },
  { key: "catalogNumber", value: (item: MasterVersion) => item.catalogNumber },
] as const;

export function createMasterCommand(io: CliIo, runtime: CliRuntime): Command {
  const master = new Command("master").description(
    "Read Discogs master releases.",
  );

  addOutputOptions(
    master
      .command("get")
      .description("Get a master release by ID.")
      .argument("<id>", "Discogs master ID", positiveInteger),
  ).action(async (id: number, options: RecordOptions, command: Command) => {
    const token = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_optional"),
    );
    const result = await new DatabaseService(
      await runtime.clientFor(command, token?.token),
    ).getMaster(id);
    renderRecord(
      result,
      await runtime.formatFor(command, outputFormat(options), options.json),
      masterColumns,
      io.stdout,
      fieldsFor(command),
    );
  });

  addListOptions(
    master
      .command("versions")
      .description("List versions of a master release.")
      .argument("<id>", "Discogs master ID", positiveInteger),
  ).action(async (id: number, options: ListOptions, command: Command) => {
    validateListOptions(options);
    const token = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_optional"),
    );
    const service = new DatabaseService(
      await runtime.clientFor(command, token?.token),
    );
    const parameters = {
      per_page: options.perPage,
      ...(options.page === undefined ? {} : { page: options.page }),
    };
    const values =
      options.all === true
        ? service.getMasterVersionsAll(id, { per_page: options.perPage })
        : asAsync(await service.getMasterVersions(id, parameters));
    await renderRecords(
      values,
      await runtime.formatFor(command, outputFormat(options), options.json),
      versionColumns,
      io.stdout,
      fieldsFor(command),
    );
  });

  return master;
}
