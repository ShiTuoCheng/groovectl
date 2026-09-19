import { Command, Option } from "commander";

import { DatabaseService } from "../../app/database-service.js";
import type { SearchParameters } from "../../discogs/client.js";
import type { SearchResult } from "../../domain/search-result.js";
import type { OutputFormat } from "../../output/renderer.js";
import { positiveInteger } from "../create-program.js";
import { fieldsFor, tokenRequestFor } from "../global-options.js";
import type { CliRuntime } from "../runtime.js";
import type { CliIo } from "../run-cli.js";
import { renderRecords } from "../../output/records.js";

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
  output: OutputFormat;
  json?: boolean;
}

const formats = ["table", "json", "jsonl", "tsv"] as const;
const searchColumns = [
  { key: "type", value: (item: SearchResult) => item.type },
  { key: "id", value: (item: SearchResult) => item.id },
  { key: "title", value: (item: SearchResult) => item.title },
  { key: "year", value: (item: SearchResult) => item.year },
  { key: "country", value: (item: SearchResult) => item.country },
  { key: "formats", value: (item: SearchResult) => item.formats },
  { key: "labels", value: (item: SearchResult) => item.labels },
  { key: "catalogNumber", value: (item: SearchResult) => item.catalogNumber },
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
    .addOption(
      new Option("--output <format>", "Output format")
        .choices([...formats])
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
        await client.getIdentity();
        const service = new DatabaseService(client);
        const results =
          options.all === true
            ? service.searchAll(parameters)
            : asAsync(await service.search(parameters));
        await renderRecords(
          results,
          await runtime.formatFor(
            command,
            options.output,
            options.json,
            "output",
          ),
          searchColumns,
          io.stdout,
          fieldsFor(command),
        );
      },
    );
}

function validateOptions(
  query: string | undefined,
  options: SearchOptions,
  command: Command,
): void {
  if (options.perPage > 100) command.error("--per-page cannot exceed 100.");
  if (options.all === true && options.page !== undefined) {
    command.error("--all cannot be combined with --page.");
  }
  if (options.json === true && options.output !== "table") {
    command.error("--json cannot be combined with --output.");
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
  if (!criteria.some((value) => value !== undefined)) {
    command.error("provide a query or at least one search filter.");
  }
}

function compact(
  parameters: Record<string, string | number | undefined>,
): SearchParameters {
  return Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== undefined),
  );
}

async function* asAsync<T>(values: readonly T[]): AsyncGenerator<T> {
  for (const value of values) {
    yield await Promise.resolve(value);
  }
}
