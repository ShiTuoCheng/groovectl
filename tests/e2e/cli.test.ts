import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          );
        }),
    ),
  );
});

describe("crateflow CLI", () => {
  it("prints machine-readable version information", async () => {
    const result = await runCli(["version", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      version: "0.0.0-development",
      platform: process.platform,
      arch: process.arch,
    });
    expect(result.stderr).toBe("");
  });

  it("gets an anonymous release as JSON", async () => {
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBeUndefined();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: 7,
          title: "Local Fixture",
          artists: [{ name: "Fixture Artist" }],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;

    const result = await runCli(
      ["--fields", "id,title", "release", "get", "7", "--json"],
      {
        NODE_ENV: "test",
        CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
      },
    );

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 7,
      title: "Local Fixture",
    });
    expect(Object.keys(JSON.parse(result.stdout) as object)).toEqual([
      "id",
      "title",
    ]);
    expect(result.stderr).toBe("");
  });

  it("uses exit code 2 and a stable prefix for invalid input", async () => {
    const result = await runCli(["release", "get", "not-an-id"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CRATEFLOW_USAGE:");
    expect(result.stderr).toContain("expected a positive integer");
  });

  it("validates a stdin token without printing it", async () => {
    const server = createServer((request, response) => {
      expect(request.url).toBe("/oauth/identity");
      expect(request.headers.authorization).toBe("Discogs token=fake-token");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: 8,
          username: "fixture-user",
          resource_url: "https://api.discogs.com/users/fixture-user",
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const result = await runCli(
      ["--token-stdin", "auth", "status", "--json"],
      {
        NODE_ENV: "test",
        CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
      },
      "fake-token\n",
    );
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("fake-token");
    expect(JSON.parse(result.stdout)).toEqual({
      authenticated: true,
      username: "fixture-user",
      source: "stdin",
    });
  });

  it("searches after validating the temporary token", async () => {
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe("Discogs token=fake-token");
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url === "/oauth/identity") {
        response.end(
          JSON.stringify({
            id: 8,
            username: "fixture-user",
            resource_url: "https://api.discogs.com/users/fixture-user",
          }),
        );
        return;
      }
      expect(request.url).toContain("/database/search?");
      response.end(
        JSON.stringify({
          pagination: {
            page: 1,
            pages: 1,
            per_page: 50,
            items: 1,
            urls: {},
          },
          results: [
            {
              id: 9,
              type: "release",
              title: "Fixture Artist - Fixture Album",
              resource_url: "https://api.discogs.com/releases/9",
            },
          ],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const result = await runCli(
      [
        "--token-stdin",
        "search",
        "Fixture Album",
        "--type",
        "release",
        "--json",
      ],
      {
        NODE_ENV: "test",
        CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
      },
      "fake-token\n",
    );
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("fake-token");
    expect(JSON.parse(result.stdout)).toMatchObject([
      { id: 9, type: "release", title: "Fixture Artist - Fixture Album" },
    ]);
  });

  it("gets a public master without authentication", async () => {
    const server = createServer((request, response) => {
      expect(request.url).toBe("/masters/1");
      expect(request.headers.authorization).toBeUndefined();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: 1,
          title: "Fixture Master",
          main_release: 2,
          resource_url: "https://api.discogs.com/masters/1",
          uri: "/master/1",
          artists: [{ name: "Fixture Artist" }],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const result = await runCli(["master", "get", "1", "--json"], {
      NODE_ENV: "test",
      CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 1,
      title: "Fixture Master",
      artists: ["Fixture Artist"],
    });
  });

  it("lists public label releases as JSONL", async () => {
    const server = createServer((request, response) => {
      expect(request.url).toBe("/labels/4/releases?per_page=50");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
          releases: [
            {
              id: 5,
              title: "Fixture Release",
              artist: "Fixture Artist",
              resource_url: "https://api.discogs.com/releases/5",
            },
          ],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const result = await runCli(
      ["label", "releases", "4", "--format", "jsonl"],
      {
        NODE_ENV: "test",
        CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
      },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 5,
      title: "Fixture Release",
    });
  });

  it("shows a collection add dry-run without sending a write request", async () => {
    const methods: string[] = [];
    const server = createServer((request, response) => {
      methods.push(request.method ?? "");
      expect(request.url).toBe("/oauth/identity");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: 8,
          username: "fixture-user",
          resource_url: "https://api.discogs.com/users/fixture-user",
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const result = await runCli(
      ["--token-stdin", "collection", "add", "7", "--dry-run", "--json"],
      {
        NODE_ENV: "test",
        CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
      },
      "fake-token\n",
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      action: "collection.add",
      releaseId: 7,
      dryRun: true,
    });
    expect(methods).toEqual(["GET"]);
  });

  it("refuses a non-interactive destructive write without --yes", async () => {
    const server = createServer((request, response) => {
      expect(request.url).toBe("/oauth/identity");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: 8,
          username: "fixture-user",
          resource_url: "https://api.discogs.com/users/fixture-user",
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const result = await runCli(
      ["--token-stdin", "wantlist", "remove", "7", "--json"],
      {
        NODE_ENV: "test",
        CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
      },
      "fake-token\n",
    );
    expect(result.code).toBe(10);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CRATEFLOW_CONFIRMATION_REQUIRED");
  });

  it("adds to the wantlist through the documented PUT endpoint", async () => {
    const server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url === "/oauth/identity") {
        response.end(
          JSON.stringify({
            id: 8,
            username: "fixture-user",
            resource_url: "https://api.discogs.com/users/fixture-user",
          }),
        );
        return;
      }
      expect(request.method).toBe("PUT");
      expect(request.url).toBe(
        "/users/fixture-user/wants/7?rating=5&notes=priority",
      );
      response.end(
        JSON.stringify({
          id: 7,
          rating: 5,
          notes: "priority",
          resource_url: "https://api.discogs.com/users/fixture-user/wants/7",
          basic_information: {
            id: 7,
            title: "Fixture Album",
            resource_url: "https://api.discogs.com/releases/7",
            artists: [{ name: "Fixture Artist" }],
          },
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const result = await runCli(
      [
        "--token-stdin",
        "wantlist",
        "add",
        "7",
        "--rating",
        "5",
        "--notes",
        "priority",
        "--json",
      ],
      {
        NODE_ENV: "test",
        CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
      },
      "fake-token\n",
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 7,
      rating: 5,
      notes: "priority",
    });
  });
});

async function runCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
  input?: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ["dist/bin/crateflow.js", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end(input);

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const [code] = (await once(child, "exit")) as [number | null];
  return { code, stdout, stderr };
}
