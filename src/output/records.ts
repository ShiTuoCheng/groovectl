import type { OutputFormat, WritableOutput } from "./renderer.js";
import { AppError } from "../errors/app-error.js";

export interface Column<T> {
  key: string;
  label?: string;
  value: (item: T) => unknown;
}

export function renderRecord<T extends object>(
  item: T,
  format: OutputFormat,
  columns: readonly Column<T>[],
  output: WritableOutput,
  selectedFields?: readonly string[],
): void {
  const visibleColumns = selectColumns(columns, selectedFields);
  if (format === "json" || format === "jsonl") {
    const value =
      selectedFields === undefined ? item : project(item, visibleColumns);
    output.write(`${JSON.stringify(value, null, format === "json" ? 2 : 0)}\n`);
    return;
  }
  if (format === "tsv") {
    output.write("field\tvalue\n");
    for (const column of visibleColumns) {
      output.write(
        `${escapeTsv(column.key)}\t${escapeTsv(cell(column.value(item)))}\n`,
      );
    }
    return;
  }
  const rows = visibleColumns.map(
    (column) => [column.label ?? column.key, cell(column.value(item))] as const,
  );
  const width = Math.max(...rows.map(([label]) => label.length));
  output.write(
    `${rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join("\n")}\n`,
  );
}

export async function renderRecords<T extends object>(
  items: AsyncIterable<T>,
  format: OutputFormat,
  columns: readonly Column<T>[],
  output: WritableOutput,
  selectedFields?: readonly string[],
): Promise<void> {
  const visibleColumns = selectColumns(columns, selectedFields);
  if (format === "json") {
    const values: object[] = [];
    for await (const item of items) {
      values.push(
        selectedFields === undefined ? item : project(item, visibleColumns),
      );
      if (values.length > 10_000) {
        throw new AppError({
          kind: "usage",
          code: "CRATEFLOW_JSON_LIMIT",
          message: "JSON output is limited to 10,000 records.",
          remediation: "Use --format jsonl for streaming output.",
        });
      }
    }
    output.write(`${JSON.stringify(values, null, 2)}\n`);
    return;
  }
  if (format === "jsonl") {
    for await (const item of items) {
      output.write(
        `${JSON.stringify(selectedFields === undefined ? item : project(item, visibleColumns))}\n`,
      );
    }
    return;
  }
  output.write(
    `${visibleColumns.map((column) => (format === "tsv" ? column.key : (column.label ?? column.key).toUpperCase())).join("\t")}\n`,
  );
  for await (const item of items) {
    output.write(
      `${visibleColumns.map((column) => escapeTsv(cell(column.value(item)))).join("\t")}\n`,
    );
  }
}

function selectColumns<T>(
  columns: readonly Column<T>[],
  selectedFields: readonly string[] | undefined,
): readonly Column<T>[] {
  if (selectedFields === undefined) return columns;
  const byKey = new Map(columns.map((column) => [column.key, column]));
  return selectedFields.map((field) => {
    const column = byKey.get(field);
    if (column === undefined) {
      throw new AppError({
        kind: "usage",
        code: "CRATEFLOW_FIELD_UNKNOWN",
        message: `Unknown output field: ${field}.`,
        remediation: `Available fields: ${columns.map(({ key }) => key).join(", ")}.`,
      });
    }
    return column;
  });
}

function project<T>(item: T, columns: readonly Column<T>[]): object {
  return Object.fromEntries(
    columns.map((column) => [column.key, column.value(item)]),
  );
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(cell).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return "";
}

function escapeTsv(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}
