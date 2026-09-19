import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { DiscogsClient } from "../../src/discogs/client.js";
import type { AppError } from "../../src/errors/app-error.js";

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

describe("DiscogsClient", () => {
  it("sends the required headers and parses a release", async () => {
    const { baseUrl } = await startServer((request, response) => {
      expect(request.url).toBe("/releases/42");
      expect(request.headers.accept).toBe(
        "application/vnd.discogs.v2.discogs+json",
      );
      expect(request.headers["user-agent"]).toBe("Crateflow/test");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: 42, title: "Test" }));
    });

    const client = new DiscogsClient({ baseUrl, userAgent: "Crateflow/test" });
    await expect(client.getRelease(42)).resolves.toMatchObject({
      id: 42,
      title: "Test",
    });
  });

  it("maps a missing release to a stable error", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(404).end();
    });

    const client = new DiscogsClient({ baseUrl, userAgent: "Crateflow/test" });
    await expect(client.getRelease(404)).rejects.toMatchObject<
      Partial<AppError>
    >({
      code: "CRATEFLOW_NOT_FOUND",
      kind: "not_found",
      httpStatus: 404,
    });
  });

  it.each([
    [401, "CRATEFLOW_AUTH_INVALID", "auth_invalid"],
    [403, "CRATEFLOW_FORBIDDEN", "forbidden"],
    [429, "CRATEFLOW_RATE_LIMITED", "rate_limited"],
    [503, "CRATEFLOW_DISCOGS_ERROR", "upstream"],
  ] as const)(
    "maps HTTP %i to %s",
    async (status, expectedCode, expectedKind) => {
      const { baseUrl } = await startServer((_request, response) => {
        response.writeHead(status).end();
      });
      const client = new DiscogsClient({
        baseUrl,
        userAgent: "Crateflow/test",
      });
      await expect(client.getRelease(1)).rejects.toMatchObject<
        Partial<AppError>
      >({
        code: expectedCode,
        kind: expectedKind,
        httpStatus: status,
      });
    },
  );

  it("rejects malformed JSON without exposing the response", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("not-json");
    });
    const client = new DiscogsClient({ baseUrl, userAgent: "Crateflow/test" });
    await expect(client.getRelease(1)).rejects.toMatchObject<Partial<AppError>>(
      {
        code: "CRATEFLOW_INVALID_RESPONSE",
        kind: "upstream",
      },
    );
  });

  it("rejects responses that do not match the release schema", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
    const client = new DiscogsClient({ baseUrl, userAgent: "Crateflow/test" });
    await expect(client.getRelease(1)).rejects.toMatchObject<Partial<AppError>>(
      {
        code: "CRATEFLOW_RESPONSE_SCHEMA_MISMATCH",
        kind: "upstream",
      },
    );
  });

  it("maps transport failures without leaking the original error", async () => {
    const client = new DiscogsClient({
      userAgent: "Crateflow/test",
      fetch: () => Promise.reject(new Error("socket details")),
    });
    await expect(client.getRelease(1)).rejects.toMatchObject<Partial<AppError>>(
      {
        code: "CRATEFLOW_NETWORK_ERROR",
        kind: "network",
        message: "The request to Discogs failed.",
      },
    );
  });
});

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ baseUrl: string }> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${String(address.port)}` };
}
