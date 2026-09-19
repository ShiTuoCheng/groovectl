import type { Release } from "../domain/release.js";

export type OutputFormat = "table" | "json";
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

  return {
    renderOne(value) {
      const rows: ReadonlyArray<readonly [string, string]> = [
        ["ID", String(value.id)],
        ["Title", value.title],
        ["Artists", displayList(value.artists)],
        ["Year", value.year === null ? "—" : String(value.year)],
        ["Country", value.country ?? "—"],
        ["Formats", displayList(value.formats)],
        ["Genres", displayList(value.genres)],
        ["Styles", displayList(value.styles)],
        ["URL", value.url],
      ];
      const width = Math.max(...rows.map(([label]) => label.length));
      output.write(
        `${rows.map(([label, text]) => `${label.padEnd(width)}  ${text}`).join("\n")}\n`,
      );
    },
  };
}

function displayList(values: readonly string[]): string {
  return values.length === 0 ? "—" : values.join(", ");
}
