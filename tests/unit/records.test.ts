import { describe, expect, it } from "vitest";

import {
  renderRecord,
  renderRecords,
  validateOutputFields,
  type Column,
} from "../../src/output/records.js";

interface SampleItem {
  id: number;
  title: string;
  tags: string[];
  meta: { ok: boolean } | null;
  note?: string;
}

const columns: readonly Column<SampleItem>[] = [
  { key: "id", value: (item) => item.id },
  { key: "title", label: "Title", value: (item) => item.title },
  { key: "tags", value: (item) => item.tags },
  { key: "meta", value: (item) => item.meta },
  { key: "note", value: (item) => item.note },
];

const sample: SampleItem = {
  id: 7,
  title: "A\tB\nC\\D\r",
  tags: ["jazz", "modal"],
  meta: { ok: true },
};

function bufferOutput() {
  let text = "";
  return {
    output: {
      write: (chunk: string | Uint8Array) => {
        text += String(chunk);
        return true;
      },
    },
    text: () => text,
  };
}

async function* streamOf<T>(items: readonly T[]): AsyncGenerator<T> {
  for (const item of items) yield await Promise.resolve(item);
}

describe("output records renderer", () => {
  it("renders a single record as json, jsonl, tsv, and aligned table", () => {
    const jsonOut = bufferOutput();
    renderRecord(sample, "json", columns, jsonOut.output);
    expect(JSON.parse(jsonOut.text())).toEqual(sample);

    const projectedOut = bufferOutput();
    renderRecord(sample, "jsonl", columns, projectedOut.output, [
      "title",
      "id",
    ]);
    expect(projectedOut.text().trim()).toBe(
      JSON.stringify({ title: sample.title, id: 7 }),
    );

    const tsvOut = bufferOutput();
    renderRecord(sample, "tsv", columns, tsvOut.output);
    expect(tsvOut.text()).toContain("field\tvalue\n");
    expect(tsvOut.text()).toContain("title\tA\\tB\\nC\\\\D\\r\n");
    expect(tsvOut.text()).toContain("tags\tjazz, modal\n");
    expect(tsvOut.text()).toContain('meta\t{"ok":true}\n');
    expect(tsvOut.text()).toContain("note\t\n");

    const tableOut = bufferOutput();
    renderRecord({ ...sample, meta: null }, "table", columns, tableOut.output, [
      "id",
      "title",
      "meta",
    ]);
    expect(tableOut.text()).toContain("Title  A\tB\nC\\D\r");
    expect(tableOut.text()).toMatch(/meta\s+\n$/u);
  });

  it("streams records as json, jsonl, tsv, and table with field projection", async () => {
    const jsonOut = bufferOutput();
    await renderRecords(streamOf([sample]), "json", columns, jsonOut.output, [
      "id",
      "tags",
    ]);
    expect(JSON.parse(jsonOut.text())).toEqual([
      { id: 7, tags: ["jazz", "modal"] },
    ]);

    const jsonlOut = bufferOutput();
    await renderRecords(streamOf([sample]), "jsonl", columns, jsonlOut.output);
    expect(JSON.parse(jsonlOut.text().trim())).toEqual(sample);

    const tableOut = bufferOutput();
    await renderRecords(streamOf([sample]), "table", columns, tableOut.output, [
      "id",
      "title",
    ]);
    expect(tableOut.text()).toBe("ID\tTITLE\n7\tA\\tB\\nC\\\\D\\r\n");

    const tsvOut = bufferOutput();
    await renderRecords(streamOf([sample]), "tsv", columns, tsvOut.output, [
      "id",
      "title",
    ]);
    expect(tsvOut.text()).toBe("id\ttitle\n7\tA\\tB\\nC\\\\D\\r\n");
  });

  it("caps buffered json arrays at 10,000 records", async () => {
    async function* tooMany(): AsyncGenerator<SampleItem> {
      for (let index = 0; index < 10_001; index += 1) {
        yield await Promise.resolve({ ...sample, id: index });
      }
    }
    const out = bufferOutput();
    await expect(
      renderRecords(tooMany(), "json", columns, out.output),
    ).rejects.toMatchObject({
      code: "GROOVECTL_JSON_LIMIT",
      kind: "usage",
    });
  });

  it("validates unknown fields with available field remediation", () => {
    expect(() => validateOutputFields(columns, ["id", "title"])).not.toThrow();
    expect(() => validateOutputFields(columns, ["missing"])).toThrow(
      expect.objectContaining({
        code: "GROOVECTL_FIELD_UNKNOWN",
        remediation: "Available fields: id, title, tags, meta, note.",
      }),
    );
  });
});
