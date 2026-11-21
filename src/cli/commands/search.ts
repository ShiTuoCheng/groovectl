import { Command, Option } from "commander";

import { DatabaseService } from "../../app/database-service.js";
import type { SearchParameters } from "../../discogs/client.js";
import type { SearchResult } from "../../domain/search-result.js";
import { AppError } from "../../errors/app-error.js";
import {
  renderRecords,
  validateOutputFields,
  type OutputFormat,
} from "../../output/records.js";
import { positiveInteger } from "../create-program.js";
import { fieldsFor, tokenRequestFor } from "../global-options.js";
import type { CliRuntime } from "../runtime.js";
import type { CliIo } from "../run-cli.js";
import { asAsync, outputFormats } from "./database-common.js";

interface SearchOptions {
  type?: SearchParameters["type"];
  artist?: string;
  title?: string;
  releaseTitle?: string;
  credit?: string;
  anv?: string;
  label?: string;
  genre?: string;
  style?: string;
  country?: string;
  year?: string;
  format?: string;
  catno?: string;
  barcode?: string;
  track?: string;
  submitter?: string;
  contributor?: string;
  page?: number;
  perPage: number;
  all?: boolean;
  limit?: number;
  output: OutputFormat;
  json?: boolean;
}

const searchColumns = [
  { key: "type", value: (item: SearchResult) => item.type },
  { key: "id", value: (item: SearchResult) => item.id },
  { key: "masterId", value: (item: SearchResult) => item.masterId },
  { key: "title", value: (item: SearchResult) => item.title },
  { key: "year", value: (item: SearchResult) => item.year },
  { key: "country", value: (item: SearchResult) => item.country },
  { key: "formats", value: (item: SearchResult) => item.formats },
  { key: "labels", value: (item: SearchResult) => item.labels },
  { key: "catalogNumber", value: (item: SearchResult) => item.catalogNumber },
  { key: "barcodes", value: (item: SearchResult) => item.barcodes },
  { key: "url", value: (item: SearchResult) => item.url },
] as const;

export function createSearchCommand(io: CliIo, runtime: CliRuntime): Command {
  return new Command("search")
    .description("Search the Discogs database. Requires a User Token.")
    .argument("[query]", "Free-text search query")
    .addOption(
      new Option("--type <type>", "Result type").choices([
        "release",
        "master",
        "artist",
        "label",
      ]),
    )
    .option("--artist <name>", "Artist name")
    .option("--title <title>", "Title")
    .option("--release-title <title>", "Release title")
    .option("--credit <name>", "Credited artist")
    .option("--anv <name>", "Artist name variation")
    .option("--label <name>", "Label name")
    .option("--genre <genre>", "Genre")
    .option("--style <style>", "Style")
    .option("--country <country>", "Country")
    .option("--year <year>", "Year")
    .option("--format <format>", "Release format")
    .option("--catno <catalog-number>", "Catalog number")
    .option("--barcode <barcode>", "Barcode")
    .option("--track <track>", "Track title")
    .option("--submitter <username>", "Submitter username")
    .option("--contributor <username>", "Contributor username")
    .option("--page <page>", "Page number", positiveInteger)
    .option(
      "--per-page <count>",
      "Results per page (max 100)",
      positiveInteger,
      50,
    )
    .option("--all", "Read every result page serially.")
    .option("--limit <count>", "Maximum records to output.", positiveInteger)
    .addOption(
      new Option("--output <format>", "Output format")
        .choices([...outputFormats])
        .default("table"),
    )
    .option("--json", "Shortcut for --output json.")
    .action(
      async (
        query: string | undefined,
        options: SearchOptions,
        command: Command,
      ) => {
        validateOptions(query, options, command);
        const fields = fieldsFor(command);
        validateOutputFields(searchColumns, fields);
        const format = await runtime.formatFor(
          command,
          options.output,
          options.json,
          "output",
        );
        const parameters = compact({
          q: query,
          type: options.type,
          artist: options.artist,
          title: options.title,
          release_title: options.releaseTitle,
          credit: options.credit,
          anv: options.anv,
          label: options.label,
          genre: options.genre,
          style: options.style,
          country: options.country,
          year: options.year,
          format: options.format,
          catno: options.catno,
          barcode: options.barcode,
          track: options.track,
          submitter: options.submitter,
          contributor: options.contributor,
          page: options.page,
          per_page: options.perPage,
        });
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const service = new DatabaseService(client);
        const results =
          options.all === true
            ? service.searchAll(parameters)
            : asAsync(await service.search(parameters));
        await renderRecords(
          results,
          format,
          searchColumns,
          io.stdout,
          fields,
          options.limit,
        );
      },
    );
}

function validateOptions(
  query: string | undefined,
  options: SearchOptions,
  command: Command,
): void {
  if (options.perPage > 100) {
    throw new AppError({
      kind: "usage",
      code: "GROOVECTL_INVALID_PAGE_SIZE",
      message: "--per-page cannot exceed 100.",
    });
  }
  if (options.all === true && options.page !== undefined) {
    throw new AppError({
      kind: "usage",
      code: "GROOVECTL_PAGINATION_CONFLICT",
      message: "--all cannot be combined with --page.",
    });
  }
  if (
    options.json === true &&
    command.getOptionValueSource("output") !== "default"
  ) {
    throw new AppError({
      kind: "usage",
      code: "GROOVECTL_OUTPUT_CONFLICT",
      message: "--json cannot be combined with --output.",
    });
  }
  const criteria = [
    query,
    options.artist,
    options.title,
    options.releaseTitle,
    options.credit,
    options.anv,
    options.label,
    options.genre,
    options.style,
    options.country,
    options.year,
    options.format,
    options.catno,
    options.barcode,
    options.track,
    options.submitter,
    options.contributor,
  ];
  if (
    !criteria.some((value) => value !== undefined && value.trim().length > 0)
  ) {
    throw new AppError({
      kind: "usage",
      code: "GROOVECTL_USAGE",
      message: "Provide a query or at least one search filter.",
    });
  }
}

function compact(
  parameters: Record<string, string | number | undefined>,
): SearchParameters {
  return Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== undefined),
  );
}
