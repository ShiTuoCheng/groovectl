import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/run-cli.js";
import type { RuntimeDependencies } from "../../src/cli/runtime.js";
import { marketplacePage, offerRow } from "../fixtures/marketplace-page.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "groovectl-ai-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function invoke(args: string[], overrides: RuntimeDependencies = {}) {
  let stdout = "";
  let stderr = "";
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
      env: {
        NODE_ENV: "test",
        GROOVECTL_CONFIG_DIR: directory,
      },
      interactive: false,
      ...overrides,
    },
  );
  return { code, stdout, stderr };
}

describe("AI-friendly CLI ergonomics", () => {
  it("outputs complete machine-readable schema and filtered subtrees offline", async () => {
    const full = await invoke(["schema"]);
    expect(full.code).toBe(0);
    expect(full.stderr).toBe("");
    const doc = JSON.parse(full.stdout) as {
      name: string;
      conventions: { safetyFlags: string[] };
      exitCodes: Record<string, string>;
      commands: Array<{ path: string }>;
    };
    expect(doc.name).toBe("groovectl");
    expect(doc.conventions.safetyFlags).toEqual(["--dry-run", "--yes"]);
    expect(doc.exitCodes["5"]).toBe("not found");
    const paths = doc.commands.map((entry) => entry.path);
    expect(paths).toContain("release get");
    expect(paths).toContain("release rating set");
    expect(paths).toContain("master versions");
    expect(paths).toContain("collection folder create");
    expect(paths).toContain("collection fields");
    expect(paths).toContain("collection note set");
    expect(paths).toContain("marketplace price-suggestions");
    expect(paths).toContain("marketplace listings");
    expect(paths).toContain("marketplace inventory");
    expect(paths).toContain("marketplace listing create");
    expect(paths).toContain("marketplace orders list");
    expect(paths).toContain("user profile");
    expect(paths).toContain("list get");
    expect(paths).toContain("schema");

    const compact = await invoke(["schema", "marketplace", "--compact"]);
    expect(compact.code).toBe(0);
    expect(compact.stdout.trim().split("\n")).toHaveLength(1);
    const compactDoc = JSON.parse(compact.stdout) as {
      commands: Array<{ path: string }>;
    };
    expect(
      compactDoc.commands.every((cmd) => cmd.path.startsWith("marketplace ")),
    ).toBe(true);

    const leaf = await invoke(["schema", "marketplace", "listing", "get"]);
    expect(leaf.code).toBe(0);
    const leafDoc = JSON.parse(leaf.stdout) as {
      commands: Array<{ path: string }>;
    };
    expect(leafDoc.commands.map((cmd) => cmd.path)).toEqual([
      "marketplace listing get",
    ]);

    const missing = await invoke(["schema", "no-such-command"]);
    expect(missing.code).toBe(5);
    expect(missing.stderr).toContain("GROOVECTL_COMMAND_NOT_FOUND");

    const variadicCompact = await invoke(["schema", "schema", "--compact"]);
    expect(variadicCompact.code).toBe(0);
    expect(JSON.parse(variadicCompact.stdout)).toMatchObject({
      commands: [{ path: "schema", args: ["[command...]"] }],
    });
  });

  it("emits structured JSON errors for both AppError and Commander usage errors", async () => {
    const usage = await invoke([
      "--error-format",
      "json",
      "release",
      "get",
      "not-a-number",
    ]);
    expect(usage.code).toBe(2);
    expect(usage.stdout).toBe("");
    expect(JSON.parse(usage.stderr)).toEqual({
      error: {
        code: "GROOVECTL_USAGE",
        kind: "usage",
        message: expect.stringContaining(
          "expected a positive integer",
        ) as string,
        remediation: null,
        httpStatus: null,
        exitCode: 2,
      },
    });

    const api404 = await invoke(["release", "get", "999999", "--json"], {
      env: {
        NODE_ENV: "test",
        GROOVECTL_CONFIG_DIR: directory,
        GROOVECTL_ERROR_FORMAT: "json",
      },
      fetch: () => Promise.resolve(new Response(null, { status: 404 })),
    });
    expect(api404.code).toBe(5);
    expect(JSON.parse(api404.stderr)).toEqual({
      error: {
        code: "GROOVECTL_NOT_FOUND",
        kind: "not_found",
        message: "The requested Discogs resource was not found.",
        remediation: null,
        httpStatus: 404,
        exitCode: 5,
      },
    });

    const overrideToText = await invoke(
      ["--error-format=text", "release", "get", "999999"],
      {
        env: {
          NODE_ENV: "test",
          GROOVECTL_CONFIG_DIR: directory,
          GROOVECTL_ERROR_FORMAT: "json",
        },
        fetch: () => Promise.resolve(new Response(null, { status: 404 })),
      },
    );
    expect(overrideToText.code).toBe(5);
    expect(overrideToText.stderr).toContain("GROOVECTL_NOT_FOUND:");

    const help = await invoke(["--error-format", "json", "--help"]);
    expect(help.code).toBe(0);
    expect(help.stderr).toBe("");

    for (const args of [
      ["--error-format", "json"],
      ["marketplace", "--error-format", "json"],
      ["--error-format", "json", "help", "bogus"],
    ]) {
      const missingSub = await invoke(args);
      expect(missingSub.code).toBe(2);
      expect(missingSub.stdout).toBe("");
      expect(JSON.parse(missingSub.stderr)).toEqual({
        error: {
          code: "GROOVECTL_USAGE",
          kind: "usage",
          message: "Missing or unknown subcommand.",
          remediation:
            "Run `groovectl schema --compact` or pass `--help` to see available commands.",
          httpStatus: null,
          exitCode: 2,
        },
      });
    }
  });

  it("suppresses informational notices with --quiet while keeping errors intact", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(marketplacePage(), {
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    const ok = await invoke(
      ["--quiet", "marketplace", "listings", "7", "--json"],
      { fetch },
    );
    expect(ok.code).toBe(0);
    expect(ok.stderr).toBe("");
    expect(JSON.parse(ok.stdout)).toMatchObject([{ id: 42, source: "web" }]);

    const err = await invoke(["-q", "marketplace", "listings", "7", "--json"], {
      fetch: () => Promise.resolve(new Response(null, { status: 403 })),
    });
    expect(err.code).toBe(4);
    expect(err.stderr).toContain("GROOVECTL_MARKETPLACE_WEB_BLOCKED");

    const jsonErr = await invoke(["marketplace", "listings", "7", "--json"], {
      env: {
        NODE_ENV: "test",
        GROOVECTL_CONFIG_DIR: directory,
        GROOVECTL_ERROR_FORMAT: "json",
      },
      fetch: () => Promise.resolve(new Response(null, { status: 403 })),
    });
    expect(jsonErr.code).toBe(4);
    expect(JSON.parse(jsonErr.stderr)).toMatchObject({
      error: {
        code: "GROOVECTL_MARKETPLACE_WEB_BLOCKED",
        httpStatus: 403,
        exitCode: 4,
      },
    });
  });

  it("stops paginated --all requests early once --limit is satisfied", async () => {
    const searchFetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        Response.json({
          pagination: {
            page: 1,
            pages: 5,
            per_page: 2,
            items: 10,
            urls: {
              next: "https://api.discogs.com/database/search?page=2&per_page=2&q=jazz",
            },
          },
          results: [
            {
              id: 1,
              type: "release",
              title: "One",
              resource_url: "https://api.discogs.com/releases/1",
            },
            {
              id: 2,
              type: "release",
              title: "Two",
              resource_url: "https://api.discogs.com/releases/2",
            },
          ],
        }),
      ),
    );
    const searchRes = await invoke(
      ["search", "jazz", "--all", "--per-page", "2", "--limit", "2", "--json"],
      {
        env: {
          NODE_ENV: "test",
          GROOVECTL_CONFIG_DIR: directory,
          DISCOGS_TOKEN: "fake-token",
        },
        fetch: searchFetch,
      },
    );
    expect(searchRes.code).toBe(0);
    expect(JSON.parse(searchRes.stdout)).toHaveLength(2);
    expect(searchFetch).toHaveBeenCalledTimes(1);

    const webFetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(
          marketplacePage([offerRow({ id: 42 }), offerRow({ id: 43 })], 1, 6),
          { headers: { "Content-Type": "text/html" } },
        ),
      ),
    );
    const webRes = await invoke(
      [
        "--quiet",
        "marketplace",
        "listings",
        "7",
        "--all",
        "--per-page",
        "2",
        "--limit",
        "2",
        "--json",
      ],
      { fetch: webFetch },
    );
    expect(webRes.code).toBe(0);
    expect(JSON.parse(webRes.stdout)).toHaveLength(2);
    expect(webFetch).toHaveBeenCalledTimes(1);
  });
});
