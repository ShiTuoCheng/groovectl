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

    const result = await runCli(["release", "get", "7", "--json"], {
      NODE_ENV: "test",
      CRATEFLOW_API_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 7,
      title: "Local Fixture",
      artists: ["Fixture Artist"],
    });
    expect(result.stderr).toBe("");
  });

  it("uses exit code 2 and a stable prefix for invalid input", async () => {
    const result = await runCli(["release", "get", "not-an-id"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CRATEFLOW_USAGE:");
    expect(result.stderr).toContain("expected a positive integer");
  });
});

async function runCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ["dist/bin/crateflow.js", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

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
