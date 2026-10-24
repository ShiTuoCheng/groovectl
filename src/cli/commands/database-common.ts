import { Option, type Command } from "commander";

import { AppError } from "../../errors/app-error.js";
import type { OutputFormat } from "../../output/renderer.js";
import { positiveInteger } from "../create-program.js";

export const outputFormats = ["table", "json", "jsonl", "tsv"] as const;

export interface RecordOptions {
  format: OutputFormat;
  json?: boolean;
}

export interface ListOptions extends RecordOptions {
  all?: boolean;
  page?: number;
  perPage: number;
}

export function addOutputOptions(command: Command): Command {
  return command
    .addOption(
      new Option("--format <format>", "Output format")
        .choices([...outputFormats])
        .default("table"),
    )
    .option("--json", "Shortcut for --format json.");
}

export function addListOptions(command: Command): Command {
  return addOutputOptions(command)
    .option("--page <page>", "Page number", positiveInteger)
    .option(
      "--per-page <count>",
      "Results per page (max 100)",
      positiveInteger,
      50,
    )
    .option("--all", "Read every page serially.");
}

export function outputFormat(options: RecordOptions): OutputFormat {
  if (options.json === true && options.format !== "table") {
    throw new AppError({
      kind: "usage",
      code: "GROOVECTL_OUTPUT_CONFLICT",
      message: "--json cannot be combined with --format.",
    });
  }
  return options.json === true ? "json" : options.format;
}

export function validateListOptions(options: ListOptions): void {
  outputFormat(options);
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
}

export async function* asAsync<T>(values: readonly T[]): AsyncGenerator<T> {
  for (const value of values) yield await Promise.resolve(value);
}
