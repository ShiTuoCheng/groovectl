import type { OutputFormat, WritableOutput } from "./renderer.js";

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
): void {
  if (format === "json" || format === "jsonl") {
    output.write(`${JSON.stringify(item, null, format === "json" ? 2 : 0)}\n`);
    return;
  }
  if (format === "tsv") {
    output.write("field\tvalue\n");
    for (const column of columns) {
      output.write(
        `${escapeTsv(column.key)}\t${escapeTsv(cell(column.value(item)))}\n`,
      );
    }
    return;
  }
  const rows = columns.map(
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
): Promise<void> {
  if (format === "json") {
    const values: T[] = [];
    for await (const item of items) values.push(item);
    output.write(`${JSON.stringify(values, null, 2)}\n`);
    return;
  }
  if (format === "jsonl") {
    for await (const item of items) output.write(`${JSON.stringify(item)}\n`);
    return;
  }
  output.write(
    `${columns.map((column) => (format === "tsv" ? column.key : (column.label ?? column.key).toUpperCase())).join("\t")}\n`,
  );
  for await (const item of items) {
    output.write(
      `${columns.map((column) => escapeTsv(cell(column.value(item)))).join("\t")}\n`,
    );
  }
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
