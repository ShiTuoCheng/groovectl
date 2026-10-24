import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/run-cli.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "groovectl-validation-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const mutations = [
  ["collection", "add", "7"],
  ["collection", "update", "1", "7", "42", "--rating", "5"],
  ["collection", "remove", "1", "7", "42", "--yes"],
  ["wantlist", "add", "7"],
  ["wantlist", "update", "7", "--rating", "5"],
  ["wantlist", "remove", "7", "--yes"],
];

describe("mutation output validation", () => {
  for (const args of mutations) {
    it.each([false, true])(
      `${args.join(" ")} respects dry-run=%s with valid output`,
      async (dryRun) => {
        const requests: string[] = [];
        const fetch: typeof globalThis.fetch = (input, init) => {
          const url =
            input instanceof URL
              ? input
              : new URL(input instanceof Request ? input.url : input);
          requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
          if (url.pathname === "/oauth/identity")
            return Promise.resolve(
              Response.json({
                id: 1,
                username: "fixture-user",
                resource_url: "https://api.discogs.com/users/fixture-user",
              }),
            );
          if (
            args[1] === "remove" ||
            (args[0] === "collection" && args[1] === "update")
          ) {
            return Promise.resolve(new Response(null, { status: 204 }));
          }
          if (args[0] === "collection")
            return Promise.resolve(
              Response.json({
                instance_id: 42,
                resource_url:
                  "https://api.discogs.com/users/fixture-user/collection/folders/1/releases/7/instances/42",
              }),
            );
          return Promise.resolve(
            Response.json({
              id: 7,
              rating: 5,
              notes: "fixture",
              resource_url:
                "https://api.discogs.com/users/fixture-user/wants/7",
              basic_information: {
                id: 7,
                title: "Fixture Release",
                resource_url: "https://api.discogs.com/releases/7",
              },
            }),
          );
        };
        let stdout = "";
        let stderr = "";
        const code = await runCli(
          [...args, "--json", ...(dryRun ? ["--dry-run"] : [])],
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
              DISCOGS_TOKEN: "fake-token",
            },
            interactive: false,
            fetch,
          },
        );
        expect(stderr).toBe("");
        expect(code).toBe(0);
        expect(JSON.parse(stdout)).toBeTypeOf("object");
        if (dryRun) {
          expect(requests).toEqual(["GET /oauth/identity"]);
          expect(JSON.parse(stdout)).toMatchObject({
            dryRun: true,
            releaseId: 7,
          });
        } else {
          expect(requests).toHaveLength(2);
          const method =
            args[1] === "remove"
              ? "DELETE"
              : args[0] === "wantlist" && args[1] === "add"
                ? "PUT"
                : "POST";
          expect(requests[1]).toMatch(
            new RegExp(`^${method} /users/fixture-user/`),
          );
        }
      },
    );

    it.each([
      { output: ["--fields", "misspelled"], error: "GROOVECTL_FIELD_UNKNOWN" },
      {
        output: ["--json", "--format", "tsv"],
        error: "GROOVECTL_OUTPUT_CONFLICT",
      },
    ])(
      `${args.join(" ")} rejects $error before any request`,
      async ({ output, error }) => {
        const fetch = vi.fn<typeof globalThis.fetch>(() =>
          Promise.resolve(
            Response.json({
              id: 1,
              username: "fixture-user",
              resource_url: "https://api.discogs.com/users/fixture-user",
            }),
          ),
        );
        let stderr = "";
        const code = await runCli(
          [...args, ...output],
          {
            stdout: { write: () => true },
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
              DISCOGS_TOKEN: "fake-token",
            },
            interactive: false,
            fetch,
          },
        );
        expect(code).toBe(2);
        expect(stderr).toContain(error);
        expect(fetch).not.toHaveBeenCalled();
      },
    );
  }
});
