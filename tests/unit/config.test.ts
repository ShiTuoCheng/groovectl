import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { configFilePath } from "../../src/config/paths.js";
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

describe("configFilePath", () => {
  it("uses platform-standard crateflow paths outside test overrides", () => {
    const home = homedir();
    expect(configFilePath({}, "darwin")).toBe(
      join(home, "Library", "Application Support", "crateflow", "config.json"),
    );
    expect(configFilePath({ APPDATA: "C:\\Roaming" }, "win32")).toBe(
      join("C:\\Roaming", "crateflow", "config.json"),
    );
    expect(configFilePath({}, "win32")).toBe(
      join(home, "AppData", "Roaming", "crateflow", "config.json"),
    );
    expect(configFilePath({ XDG_CONFIG_HOME: "/xdg" }, "linux")).toBe(
      join("/xdg", "crateflow", "config.json"),
    );
    expect(configFilePath({}, "linux")).toBe(
      join(home, ".config", "crateflow", "config.json"),
    );
  });

  it("accepts GROOVECTL_CONFIG_DIR and legacy CRATEFLOW_CONFIG_DIR only in test mode", () => {
    expect(
      configFilePath(
        { NODE_ENV: "test", GROOVECTL_CONFIG_DIR: "/tmp/g" },
        "linux",
      ),
    ).toBe(join("/tmp/g", "config.json"));
    expect(
      configFilePath(
        { NODE_ENV: "test", CRATEFLOW_CONFIG_DIR: "/tmp/c" },
        "linux",
      ),
    ).toBe(join("/tmp/c", "config.json"));
    expect(
      configFilePath(
        { NODE_ENV: "production", GROOVECTL_CONFIG_DIR: "/tmp/g" },
        "linux",
      ),
    ).not.toBe(join("/tmp/g", "config.json"));
  });
});
