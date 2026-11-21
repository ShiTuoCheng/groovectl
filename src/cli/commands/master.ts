import { Command, Option } from "commander";

import { DatabaseService } from "../../app/database-service.js";
import type { MasterVersionsParameters } from "../../discogs/client.js";
import type { Master, MasterVersion } from "../../domain/database-resource.js";
import {
  renderRecord,
  renderRecords,
  validateOutputFields,
} from "../../output/records.js";
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
  { key: "format", value: (item: MasterVersion) => item.format },
  { key: "catalogNumber", value: (item: MasterVersion) => item.catalogNumber },
  { key: "status", value: (item: MasterVersion) => item.status },
  { key: "have", value: (item: MasterVersion) => item.have },
  { key: "want", value: (item: MasterVersion) => item.want },
  { key: "url", value: (item: MasterVersion) => item.url },
] as const;

interface MasterVersionsOptions extends ListOptions {
  mediaFormat?: string;
  label?: string;
  released?: string;
  country?: string;
  sort?: MasterVersionsParameters["sort"];
  sortOrder?: "asc" | "desc";
}

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
    const requestedFormat = outputFormat(options, command);
    const fields = fieldsFor(command);
    validateOutputFields(masterColumns, fields);
    const format = await runtime.formatFor(
      command,
      requestedFormat,
      options.json,
    );
    const token = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_optional"),
    );
    const result = await new DatabaseService(
      await runtime.clientFor(command, token?.token),
    ).getMaster(id);
    renderRecord(result, format, masterColumns, io.stdout, fields);
  });

  addListOptions(
    master
      .command("versions")
      .description(
        "List and filter pressings/versions of a master release (by country, media format, label, year).",
      )
      .argument("<id>", "Discogs master ID", positiveInteger),
  )
    .option(
      "--media-format <format>",
      "Filter by media format (e.g. Vinyl, CD)",
    )
    .option("--label <label>", "Filter by label name")
    .option("--released <year>", "Filter by release year (e.g. 1959)")
    .option("--country <country>", "Filter by country (e.g. US, Japan, UK)")
    .addOption(
      new Option("--sort <field>", "Sort versions by field").choices([
        "released",
        "title",
        "format",
        "label",
        "catno",
        "country",
      ]),
    )
    .addOption(
      new Option("--sort-order <order>", "Sort order").choices(["asc", "desc"]),
    )
    .action(
      async (id: number, options: MasterVersionsOptions, command: Command) => {
        validateListOptions(options, command);
        const fields = fieldsFor(command);
        validateOutputFields(versionColumns, fields);
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const token = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_optional"),
        );
        const service = new DatabaseService(
          await runtime.clientFor(command, token?.token),
        );
        const shared: Omit<MasterVersionsParameters, "page"> = {
          per_page: options.perPage,
          ...(options.mediaFormat === undefined
            ? {}
            : { format: options.mediaFormat }),
          ...(options.label === undefined ? {} : { label: options.label }),
          ...(options.released === undefined
            ? {}
            : { released: options.released }),
          ...(options.country === undefined
            ? {}
            : { country: options.country }),
          ...(options.sort === undefined ? {} : { sort: options.sort }),
          ...(options.sortOrder === undefined
            ? {}
            : { sort_order: options.sortOrder }),
        };
        const values =
          options.all === true
            ? service.getMasterVersionsAll(id, shared)
            : asAsync(
                await service.getMasterVersions(id, {
                  ...shared,
                  ...(options.page === undefined ? {} : { page: options.page }),
                }),
              );
        await renderRecords(
          values,
          format,
          versionColumns,
          io.stdout,
          fields,
          options.limit,
        );
      },
    );

  return master;
}
