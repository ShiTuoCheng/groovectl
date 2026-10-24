import { z } from "zod";

export const configSchema = z.object({
  format: z.enum(["table", "json", "jsonl", "tsv"]).default("table"),
  color: z.enum(["auto", "always", "never"]).default("auto"),
  locale: z.string().min(2).default("en"),
  timeoutMs: z.number().int().positive().max(300_000).default(30_000),
  maxRateLimitWaitMs: z
    .number()
    .int()
    .nonnegative()
    .max(600_000)
    .default(60_000),
});

export type GroovectlConfig = z.infer<typeof configSchema>;

export const defaultConfig: GroovectlConfig = configSchema.parse({});
