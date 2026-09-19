import { describe, expect, it } from "vitest";

import { configSchema, defaultConfig } from "../../src/config/schema.js";

describe("configSchema", () => {
  it("provides safe defaults", () => {
    expect(defaultConfig).toEqual({
      format: "table",
      color: "auto",
      locale: "en",
      timeoutMs: 30_000,
      maxRateLimitWaitMs: 60_000,
    });
  });

  it("rejects an unbounded timeout", () => {
    expect(() => configSchema.parse({ timeoutMs: 300_001 })).toThrow();
  });
});
