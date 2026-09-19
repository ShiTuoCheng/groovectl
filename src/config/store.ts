import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { configSchema, defaultConfig, type CrateflowConfig } from "./schema.js";
import { AppError } from "../errors/app-error.js";

export class ConfigStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  get path(): string {
    return this.#path;
  }

  async read(): Promise<CrateflowConfig> {
    let text: string;
    try {
      text = await readFile(this.#path, "utf8");
    } catch (cause: unknown) {
      if (isMissingFile(cause)) return defaultConfig;
      throw cause;
    }
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch (cause: unknown) {
      throw new AppError({
        kind: "validation",
        code: "CRATEFLOW_CONFIG_INVALID",
        message: "The Crateflow configuration file is not valid JSON.",
        cause,
      });
    }
    try {
      return configSchema.parse(value);
    } catch (cause: unknown) {
      throw new AppError({
        kind: "validation",
        code: "CRATEFLOW_CONFIG_INVALID",
        message: "The Crateflow configuration contains invalid values.",
        cause,
      });
    }
  }

  async write(config: CrateflowConfig): Promise<void> {
    const value = configSchema.parse(config);
    const directory = dirname(this.#path);
    const temporaryPath = `${this.#path}.${String(process.pid)}.tmp`;
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.#path);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async set<K extends keyof CrateflowConfig>(
    key: K,
    value: CrateflowConfig[K],
  ): Promise<CrateflowConfig> {
    const next = configSchema.parse({ ...(await this.read()), [key]: value });
    await this.write(next);
    return next;
  }
}

function isMissingFile(value: unknown): boolean {
  return (
    value instanceof Error &&
    "code" in value &&
    (value as NodeJS.ErrnoException).code === "ENOENT"
  );
}
