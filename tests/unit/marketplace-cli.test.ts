import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/run-cli.js";
import type { RuntimeDependencies } from "../../src/cli/runtime.js";
import { listingFixture, statsFixture } from "../fixtures/marketplace.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "groovectl-marketplace-test-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function invoke(
  args: string[],
  body: unknown = statsFixture,
  extra: RuntimeDependencies = {},
) {
  let stdout = "";
  let stderr = "";
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(Response.json(body)),
  );
  const promptToken = vi.fn(() => Promise.resolve("fake-token"));
  const keyring = {
    get: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn(),
    delete: vi.fn(() => Promise.resolve(false)),
  };
  const code = await runCli(
    args,
    {
      stdout: {
        write: (text) => {
          stdout += String(text);
          return true;
        },
      },
      stderr: {
        write: (text) => {
          stderr += String(text);
          return true;
        },
      },
    },
    {
      env: { NODE_ENV: "test", GROOVECTL_CONFIG_DIR: directory },
      interactive: false,
      fetch,
      promptToken,
      keyring,
      ...extra,
    },
  );
  return { code, stdout, stderr, fetch, promptToken, keyring };
}

const commands = [
  { args: ["stats", "7"], body: statsFixture, field: "numForSale", value: 3 },
  {
    args: ["listing", "get", "42"],
    body: listingFixture,
    field: "status",
    value: "For Sale",
  },
  {
    args: ["fee", "45"],
    body: { value: 1.23, currency: "USD" },
    field: "fee",
    value: { value: 1.23, currency: "USD" },
  },
];

describe("marketplace CLI", () => {
  for (const { args, body, field, value } of commands) {
    it.each(["json", "jsonl", "table", "tsv"])(
      `${args.join(" ")} supports %s and field projection without auth or state`,
      async (format) => {
        const result = await invoke(
          ["marketplace", ...args, "--format", format, "--fields", field],
          body,
        );
        expect(result.code).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.fetch).toHaveBeenCalledTimes(1);
        expect(result.promptToken).not.toHaveBeenCalled();
        expect(result.keyring.set).not.toHaveBeenCalled();
        expect(
          new Headers(result.fetch.mock.calls[0]?.[1]?.headers).get(
            "authorization",
          ),
        ).toBeNull();
        if (format === "json" || format === "jsonl")
          expect(JSON.parse(result.stdout)).toEqual({ [field]: value });
        else expect(result.stdout).toContain(field);
        if (format === "jsonl")
          expect(result.stdout.trim().split("\n")).toHaveLength(1);
        if (format === "tsv") expect(result.stdout).toMatch(/^field\tvalue\n/u);
        expect(await readdir(directory)).toEqual([]);
      },
    );
  }

  it("uses an explicit stdin token without an identity request or private output", async () => {
    async function* input() {
      yield await Promise.resolve("fake-test-token\n");
    }
    const result = await invoke(
      [
        "--token-stdin",
        "marketplace",
        "listing",
        "get",
        "42",
        "--currency",
        "EUR",
        "--json",
      ],
      listingFixture,
      { input: input() },
    );
    expect(result.code).toBe(0);
    expect(result.fetch).toHaveBeenCalledTimes(1);
    expect(
      new Headers(result.fetch.mock.calls[0]?.[1]?.headers).get(
        "authorization",
      ),
    ).toBe("Discogs token=fake-test-token");
    expect(result.stdout + result.stderr).not.toContain("fake-test-token");
    expect(result.stdout).not.toContain("private-fixture");
  });

  it("honors stored output configuration and the JSON override", async () => {
    await writeFile(
      join(directory, "config.json"),
      JSON.stringify({ format: "tsv" }),
    );
    expect((await invoke(["marketplace", "stats", "7"])).stdout).toMatch(
      /^field\tvalue\n/u,
    );
    const result = await invoke(["marketplace", "stats", "7", "--json"]);
    expect(JSON.parse(result.stdout)).toMatchObject({ numForSale: 3 });
  });

  it("keeps null stats and blocked status as a successful result", async () => {
    const result = await invoke(["marketplace", "stats", "7", "--json"], {
      lowest_price: null,
      num_for_sale: null,
      blocked_from_sale: true,
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      lowestPrice: null,
      numForSale: null,
      blockedFromSale: true,
    });
  });

  it.each([
    ["stats", "0"],
    ["stats", "1e2"],
    ["listing", "get", "x"],
    ["fee", "NaN"],
    ["fee", "Infinity"],
    ["fee", "1e2"],
    ["fee", "-1"],
    ["fee", "1/2"],
    ["fee", "1.2.3"],
    ["fee", "9007199254740992"],
    ["stats", "7", "--currency", "CNY"],
    ["listing", "get", "42", "--currency", "eur"],
    ["fee", "45", "--currency", "CNY"],
    ["stats", "7", "--json", "--format", "tsv"],
  ])(
    "rejects invalid arguments before making requests: %j",
    async (...args) => {
      const result = await invoke(["marketplace", ...args]);
      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.fetch).not.toHaveBeenCalled();
    },
  );

  it("accepts a zero price and preserves decimal spelling in the request", async () => {
    const result = await invoke(["marketplace", "fee", "0.00", "--json"], {
      value: 0,
      currency: "USD",
    });
    expect(result.code).toBe(0);
    expect(result.fetch.mock.calls[0]?.[0]).toEqual(
      new URL("https://api.discogs.com/marketplace/fee/0.00"),
    );
    expect(JSON.parse(result.stdout)).toEqual({
      price: { value: 0, currency: "USD" },
      fee: { value: 0, currency: "USD" },
    });
  });

  it.each([
    [401, 3],
    [403, 4],
    [404, 5],
    [429, 6],
    [500, 7],
  ])("maps HTTP %i to exit code %i", async (status, exitCode) => {
    const result = await invoke(
      ["marketplace", "listing", "get", "42", "--json"],
      null,
      {
        fetch: () =>
          Promise.resolve(new Response("sensitive-upstream-body", { status })),
      },
    );
    expect(result.code).toBe(exitCode);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("sensitive-upstream-body");
  });

  it("rejects unknown output fields with the existing stable error", async () => {
    const result = await invoke([
      "marketplace",
      "stats",
      "7",
      "--fields",
      "noSuchField",
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("GROOVECTL_FIELD_UNKNOWN");
  });

  it("asks for a token when the API denies an anonymous request", async () => {
    const result = await invoke(["marketplace", "fee", "45", "--json"], null, {
      fetch: () => Promise.resolve(new Response(null, { status: 401 })),
    });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("GROOVECTL_AUTH_REQUIRED");
    expect(result.stderr).toContain("--token-stdin");
    expect(result.promptToken).not.toHaveBeenCalled();
  });

  it("keeps an invalid supplied token distinct from a missing token", async () => {
    async function* input() {
      yield await Promise.resolve("fake-invalid-token");
    }
    const result = await invoke(
      ["--token-stdin", "marketplace", "fee", "45", "--json"],
      null,
      {
        input: input(),
        fetch: () => Promise.resolve(new Response(null, { status: 401 })),
      },
    );
    expect(result.code).toBe(3);
    expect(result.stderr).toContain("GROOVECTL_AUTH_INVALID");
    expect(result.stderr).not.toContain("fake-invalid-token");
  });

  it("does not expose monitoring or write commands", async () => {
    const result = await invoke(["marketplace", "--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Data provided by Discogs.");
    expect(result.stdout).not.toMatch(/watch|delete|create|update/u);
  });
});
