import type { Release } from "../domain/release.js";

export type OutputFormat = "table" | "json" | "jsonl" | "tsv";
export type WritableOutput = Pick<NodeJS.WriteStream, "write">;

export interface Renderer {
  renderOne(value: Release): void;
}

export function createRenderer(
  format: OutputFormat,
  output: WritableOutput,
): Renderer {
  if (format === "json") {
    return {
      renderOne(value) {
        output.write(`${JSON.stringify(value, null, 2)}\n`);
      },
    };
  }

  if (format === "jsonl") {
    return {
      renderOne(value) {
        output.write(`${JSON.stringify(value)}\n`);
      },
    };
  }

  return {
    renderOne(value) {
      const rows = releaseRows(value);
      if (format === "tsv") {
        output.write("field\tvalue\n");
        for (const [field, text] of rows) {
          output.write(`${escapeTsv(field)}\t${escapeTsv(text)}\n`);
        }
        return;
      }
      const width = Math.max(...rows.map(([label]) => label.length));
      output.write(
        `${rows.map(([label, text]) => `${label.padEnd(width)}  ${text}`).join("\n")}\n`,
      );
    },
  };
}

function releaseRows(value: Release): ReadonlyArray<readonly [string, string]> {
  return [
    ["id", String(value.id)],
    ["title", value.title],
    ["artists", displayList(value.artists)],
    ["year", value.year === null ? "" : String(value.year)],
    ["country", value.country ?? ""],
    ["formats", displayList(value.formats)],
    ["genres", displayList(value.genres)],
    ["styles", displayList(value.styles)],
    ["url", value.url],
  ];
}

function displayList(values: readonly string[]): string {
  return values.length === 0 ? "—" : values.join(", ");
}

function escapeTsv(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}
