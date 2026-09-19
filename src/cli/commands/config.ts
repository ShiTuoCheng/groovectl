import { Command } from "commander";

import { configSchema, type CrateflowConfig } from "../../config/schema.js";
import { AppError } from "../../errors/app-error.js";
import type { CliRuntime } from "../runtime.js";
import type { CliIo } from "../run-cli.js";

const keys = [
  "format",
  "color",
  "locale",
  "timeoutMs",
  "maxRateLimitWaitMs",
] as const;
type ConfigKey = (typeof keys)[number];

export function createConfigCommand(io: CliIo, runtime: CliRuntime): Command {
  const config = new Command("config").description(
    "Read or update local Crateflow settings (tokens are never stored here).",
  );

  config
    .command("get")
    .description("Show the configuration or one key.")
    .argument("[key]", `Configuration key (${keys.join(", ")})`)
    .option("--json", "Output JSON.")
    .action(async (key: ConfigKey | undefined, options: { json?: boolean }) => {
      if (key !== undefined && !keys.includes(key)) {
        throw invalidKey(key);
      }
      const value = await runtime.config.read();
      const result = key === undefined ? value : value[key];
      io.stdout.write(
        options.json === true || typeof result === "object"
          ? `${JSON.stringify(result, null, 2)}\n`
          : `${String(result)}\n`,
      );
    });

  config
    .command("set")
    .description("Set one configuration value.")
    .argument("<key>", `Configuration key (${keys.join(", ")})`)
    .argument("<value>", "New value")
    .action(async (key: ConfigKey, rawValue: string) => {
      if (!keys.includes(key)) throw invalidKey(key);
      const value = parseValue(key, rawValue);
      const current = await runtime.config.read();
      const next = configSchema.parse({ ...current, [key]: value });
      await runtime.config.write(next);
      io.stdout.write(`${key}=${String(next[key])}\n`);
    });

  return config;
}

function invalidKey(key: string): AppError {
  return new AppError({
    kind: "usage",
    code: "CRATEFLOW_CONFIG_KEY_INVALID",
    message: `Unknown configuration key: ${key}.`,
  });
}

function parseValue(key: ConfigKey, value: string): CrateflowConfig[ConfigKey] {
  if (key === "timeoutMs" || key === "maxRateLimitWaitMs") {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new AppError({
        kind: "usage",
        code: "CRATEFLOW_CONFIG_VALUE_INVALID",
        message: `${key} must be an integer.`,
      });
    }
    return parsed;
  }
  return value;
}
