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
      expect(request.headers["user-agent"]).toBe("Groovectl/test");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: 42, title: "Test" }));
    });

    const client = new DiscogsClient({ baseUrl, userAgent: "Groovectl/test" });
    await expect(client.getRelease(42)).resolves.toMatchObject({
      id: 42,
      title: "Test",
    });
  });

  it("maps a missing release to a stable error", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(404).end();
    });

    const client = new DiscogsClient({ baseUrl, userAgent: "Groovectl/test" });
    await expect(client.getRelease(404)).rejects.toMatchObject<
      Partial<AppError>
    >({
      code: "GROOVECTL_NOT_FOUND",
      kind: "not_found",
      httpStatus: 404,
    });
  });

  it.each([
    [401, "GROOVECTL_AUTH_INVALID", "auth_invalid"],
    [403, "GROOVECTL_FORBIDDEN", "forbidden"],
    [405, "GROOVECTL_METHOD_NOT_ALLOWED", "usage"],
    [422, "GROOVECTL_VALIDATION_FAILED", "validation"],
    [429, "GROOVECTL_RATE_LIMITED", "rate_limited"],
    [500, "GROOVECTL_DISCOGS_ERROR", "upstream"],
    [503, "GROOVECTL_DISCOGS_ERROR", "upstream"],
  ] as const)(
    "maps HTTP %i to %s",
    async (status, expectedCode, expectedKind) => {
      const { baseUrl } = await startServer((_request, response) => {
        response.writeHead(status).end();
      });
      const client = new DiscogsClient({
        baseUrl,
        userAgent: "Groovectl/test",
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
    const client = new DiscogsClient({ baseUrl, userAgent: "Groovectl/test" });
    await expect(client.getRelease(1)).rejects.toMatchObject<Partial<AppError>>(
      {
        code: "GROOVECTL_INVALID_RESPONSE",
        kind: "upstream",
      },
    );
  });

  it("rejects responses that do not match the release schema", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
    const client = new DiscogsClient({ baseUrl, userAgent: "Groovectl/test" });
    await expect(client.getRelease(1)).rejects.toMatchObject<Partial<AppError>>(
      {
        code: "GROOVECTL_RESPONSE_SCHEMA_MISMATCH",
        kind: "upstream",
      },
    );
  });

  it("maps transport failures without leaking the original error", async () => {
    const client = new DiscogsClient({
      userAgent: "Groovectl/test",
      fetch: () => Promise.reject(new Error("socket details")),
    });
    await expect(client.getRelease(1)).rejects.toMatchObject<Partial<AppError>>(
      {
        code: "GROOVECTL_NETWORK_ERROR",
        kind: "network",
        message: "The request to Discogs failed.",
      },
    );
  });

  it("authenticates identity with the Discogs token header", async () => {
    const { baseUrl } = await startServer((request, response) => {
      expect(request.url).toBe("/oauth/identity");
      expect(request.headers.authorization).toBe("Discogs token=test-token");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: 123,
          username: "fixture-user",
          resource_url: "https://api.discogs.com/users/fixture-user",
          consumer_name: "Groovectl",
        }),
      );
    });
    const client = new DiscogsClient({
      baseUrl,
      userAgent: "Groovectl/test",
      token: "test-token",
    });
    await expect(client.getIdentity()).resolves.toMatchObject({
      id: 123,
      username: "fixture-user",
    });
  });

  it("serializes database search parameters", async () => {
    let baseUrl = "";
    ({ baseUrl } = await startServer((request, response) => {
      const url = new URL(request.url ?? "", baseUrl);
      expect(url.pathname).toBe("/database/search");
      expect(url.searchParams.get("q")).toBe("Kind of Blue");
      expect(url.searchParams.get("type")).toBe("release");
      expect(url.searchParams.get("per_page")).toBe("25");
      expect(request.headers.authorization).toBe("Discogs token=test-token");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          pagination: { page: 1, pages: 1, per_page: 25, items: 1, urls: {} },
          results: [
            {
              id: 1,
              type: "release",
              title: "Miles Davis - Kind of Blue",
              resource_url: "https://api.discogs.com/releases/1",
            },
          ],
        }),
      );
    }));
    const client = new DiscogsClient({
      baseUrl,
      userAgent: "Groovectl/test",
      token: "test-token",
    });
    await expect(
      client.search({ q: "Kind of Blue", type: "release", per_page: 25 }),
    ).resolves.toMatchObject({ results: [{ id: 1, type: "release" }] });
  });

  it("parses master, artist, and label resources", async () => {
    const { baseUrl } = await startServer((request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url === "/masters/1") {
        response.end(
          JSON.stringify({
            id: 1,
            title: "Master Fixture",
            main_release: 2,
            resource_url: "https://api.discogs.com/masters/1",
            uri: "/master/1",
            artists: [{ name: "Fixture Artist" }],
          }),
        );
        return;
      }
      if (request.url === "/artists/3") {
        response.end(
          JSON.stringify({
            id: 3,
            name: "Fixture Artist",
            resource_url: "https://api.discogs.com/artists/3",
            uri: "/artist/3",
          }),
        );
        return;
      }
      response.end(
        JSON.stringify({
          id: 4,
          name: "Fixture Label",
          resource_url: "https://api.discogs.com/labels/4",
          uri: "/label/4",
        }),
      );
    });
    const client = new DiscogsClient({ baseUrl, userAgent: "Groovectl/test" });
    await expect(client.getMaster(1)).resolves.toMatchObject({
      id: 1,
      main_release: 2,
    });
    await expect(client.getArtist(3)).resolves.toMatchObject({
      id: 3,
      name: "Fixture Artist",
    });
    await expect(client.getLabel(4)).resolves.toMatchObject({
      id: 4,
      name: "Fixture Label",
    });
  });

  it("follows safe pagination links for master versions", async () => {
    let baseUrl = "";
    ({ baseUrl } = await startServer((request, response) => {
      const url = new URL(request.url ?? "", baseUrl);
      const page = url.searchParams.get("page") ?? "1";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          pagination: {
            page: Number(page),
            pages: 2,
            per_page: 1,
            items: 2,
            urls:
              page === "1"
                ? { next: `${baseUrl}/masters/1/versions?page=2` }
                : {},
          },
          versions: [
            {
              id: Number(page),
              title: `Version ${page}`,
              resource_url: `https://api.discogs.com/releases/${page}`,
            },
          ],
        }),
      );
    }));
    const client = new DiscogsClient({ baseUrl, userAgent: "Groovectl/test" });
    const ids: number[] = [];
    for await (const version of client.getMasterVersionsAll(1, {
      per_page: 1,
    })) {
      ids.push(version.id);
    }
    expect(ids).toEqual([1, 2]);
  });

  it("rejects pagination links on a different origin", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          pagination: {
            page: 1,
            pages: 2,
            per_page: 1,
            items: 2,
            urls: { next: "https://example.com/steal" },
          },
          releases: [
            {
              id: 1,
              title: "Fixture",
              artist: "Artist",
              resource_url: "https://api.discogs.com/releases/1",
            },
          ],
        }),
      );
    });
    const client = new DiscogsClient({ baseUrl, userAgent: "Groovectl/test" });
    const consume = async (): Promise<void> => {
      for await (const value of client.getLabelReleasesAll(1)) {
        // Consume the first page so pagination validation runs.
        expect(value.id).toBe(1);
      }
    };
    await expect(consume()).rejects.toMatchObject({
      code: "GROOVECTL_UNSAFE_PAGINATION_URL",
    });
  });

  it("uses the documented collection endpoints and accepts 204 mutations", async () => {
    const requests: Array<{ method: string; url: string; body: string }> = [];
    const { baseUrl } = await startServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => (body += chunk));
      request.on("end", () => {
        requests.push({
          method: request.method ?? "",
          url: request.url ?? "",
          body,
        });
        if (request.method === "POST" && request.url?.endsWith("/releases/7")) {
          response.writeHead(201, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              instance_id: 12,
              resource_url: `${baseUrl}/instance/12`,
            }),
          );
          return;
        }
        response.writeHead(204).end();
      });
    });
    const client = new DiscogsClient({
      baseUrl,
      userAgent: "Groovectl/test",
      token: "test-token",
    });
    await expect(client.addToCollection("a user", 1, 7)).resolves.toMatchObject(
      { instance_id: 12 },
    );
    await expect(
      client.updateCollectionInstance("a user", 1, 7, 12, { rating: 5 }),
    ).resolves.toBeUndefined();
    await expect(
      client.removeCollectionInstance("a user", 1, 7, 12),
    ).resolves.toBeUndefined();
    expect(requests).toEqual([
      {
        method: "POST",
        url: "/users/a%20user/collection/folders/1/releases/7",
        body: "",
      },
      {
        method: "POST",
        url: "/users/a%20user/collection/folders/1/releases/7/instances/12",
        body: '{"rating":5}',
      },
      {
        method: "DELETE",
        url: "/users/a%20user/collection/folders/1/releases/7/instances/12",
        body: "",
      },
    ]);
  });

  it("uses PUT, POST, and DELETE for wantlist mutations without retrying writes", async () => {
    const methods: string[] = [];
    const { baseUrl } = await startServer((request, response) => {
      methods.push(request.method ?? "");
      if (request.method === "DELETE") {
        response.writeHead(204).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(wantFixture(baseUrl)));
    });
    const client = new DiscogsClient({
      baseUrl,
      userAgent: "Groovectl/test",
      token: "test-token",
    });
    await client.addToWantlist("fixture-user", 7, { rating: 4, notes: "find" });
    await client.updateWantlistItem("fixture-user", 7, { rating: 5 });
    await client.removeWantlistItem("fixture-user", 7);
    expect(methods).toEqual(["PUT", "POST", "DELETE"]);
  });
});

function wantFixture(baseUrl: string): object {
  return {
    id: 7,
    rating: 4,
    notes: "find",
    resource_url: `${baseUrl}/users/fixture-user/wants/7`,
    basic_information: {
      id: 7,
      title: "Fixture Album",
      resource_url: "https://api.discogs.com/releases/7",
      artists: [{ name: "Fixture Artist" }],
    },
  };
}

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ baseUrl: string }> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${String(address.port)}` };
}
