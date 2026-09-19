import { Command } from "commander";

import { DatabaseService } from "../../app/database-service.js";
import type { Label, LabelRelease } from "../../domain/database-resource.js";
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

const labelColumns = [
  { key: "id", value: (item: Label) => item.id },
  { key: "name", value: (item: Label) => item.name },
  { key: "parentLabel", value: (item: Label) => item.parentLabel },
  { key: "contactInfo", value: (item: Label) => item.contactInfo },
  { key: "urls", value: (item: Label) => item.urls },
  { key: "profile", value: (item: Label) => item.profile },
  { key: "url", value: (item: Label) => item.url },
] as const;

const releaseColumns = [
  { key: "id", value: (item: LabelRelease) => item.id },
  { key: "title", value: (item: LabelRelease) => item.title },
  { key: "artist", value: (item: LabelRelease) => item.artist },
  { key: "year", value: (item: LabelRelease) => item.year },
  { key: "format", value: (item: LabelRelease) => item.format },
  { key: "catalogNumber", value: (item: LabelRelease) => item.catalogNumber },
  { key: "status", value: (item: LabelRelease) => item.status },
] as const;

export function createLabelCommand(io: CliIo, runtime: CliRuntime): Command {
  const label = new Command("label").description("Read Discogs labels.");

  addOutputOptions(
    label
      .command("get")
      .description("Get a label by ID.")
      .argument("<id>", "Discogs label ID", positiveInteger),
  ).action(async (id: number, options: RecordOptions, command: Command) => {
    const token = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_optional"),
    );
    const result = await new DatabaseService(
      await runtime.clientFor(command, token?.token),
    ).getLabel(id);
    renderRecord(
      result,
      await runtime.formatFor(command, outputFormat(options), options.json),
      labelColumns,
      io.stdout,
      fieldsFor(command),
    );
  });

  addListOptions(
    label
      .command("releases")
      .description("List a label's releases.")
      .argument("<id>", "Discogs label ID", positiveInteger),
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
        ? service.getLabelReleasesAll(id, { per_page: options.perPage })
        : asAsync(
            await service.getLabelReleases(id, {
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

  return label;
}
