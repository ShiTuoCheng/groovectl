import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defaultConfig } from "../../src/config/schema.js";
import { ConfigStore } from "../../src/config/store.js";

const directories: string[] = [];
afterEach(
  async () =>
    await Promise.all(
      directories
        .splice(0)
        .map((path) => rm(path, { recursive: true, force: true })),
    ),
);

describe("ConfigStore", () => {
  it("writes validated configuration atomically without token fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "groovectl-config-"));
    directories.push(directory);
    const path = join(directory, "nested", "config.json");
    const store = new ConfigStore(path);
    expect(store.path).toBe(path);
    await expect(store.read()).resolves.toEqual(defaultConfig);
    const next = await store.set("timeoutMs", 12_345);
    expect(next.timeoutMs).toBe(12_345);
    expect(JSON.parse(await readFile(path, "utf8"))).not.toHaveProperty(
      "token",
    );
    if (process.platform !== "win32")
      expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("maps malformed JSON, invalid schema, and invalid updates to stable errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "groovectl-config-"));
    directories.push(directory);
    const path = join(directory, "config.json");
    const store = new ConfigStore(path);

    await writeFile(path, "{invalid json");
    await expect(store.read()).rejects.toMatchObject({
      code: "GROOVECTL_CONFIG_INVALID",
      kind: "validation",
    });

    await writeFile(path, JSON.stringify({ timeoutMs: -1 }));
    await expect(store.read()).rejects.toMatchObject({
      code: "GROOVECTL_CONFIG_INVALID",
      kind: "validation",
    });

    await writeFile(path, JSON.stringify(defaultConfig));
    await expect(store.set("timeoutMs", -1)).rejects.toMatchObject({
      code: "GROOVECTL_CONFIG_VALUE_INVALID",
      kind: "usage",
    });
  });
});
