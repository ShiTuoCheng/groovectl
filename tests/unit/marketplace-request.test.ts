import { EventEmitter } from "node:events";
import { IncomingMessage, type ClientRequest } from "node:http";
import { get } from "node:https";
import { Socket } from "node:net";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestMarketplacePage } from "../../src/http/marketplace-request.js";

vi.mock("node:https", () => ({ get: vi.fn() }));

const url = new URL(
  "https://www.discogs.com/sell/release/7?_pjax=%23pjax_container",
);
let request: EventEmitter;
let incoming: IncomingMessage;

beforeEach(() => {
  vi.mocked(get).mockReset();
  request = new EventEmitter();
  incoming = new IncomingMessage(new Socket());
  incoming.statusCode = 200;
  incoming.headers = {
    "content-type": "text/html",
    "x-example": ["one", "two"],
  };
  vi.mocked(get).mockImplementation((_url, _options, callback) => {
    callback?.(incoming);
    return request as ClientRequest;
  });
});

describe("Marketplace HTTPS transport", () => {
  it("streams HTML and forwards headers and the timeout signal", async () => {
    const signal = AbortSignal.timeout(1000);
    const response = await requestMarketplacePage(url, {
      headers: { "X-PJAX": "true" },
      signal,
    });
    incoming.push("<table>offers</table>");
    incoming.push(null);
    expect(await response.text()).toBe("<table>offers</table>");
    expect(response.headers.get("x-example")).toBe("one, two");
    expect(get).toHaveBeenCalledExactlyOnceWith(
      url,
      { headers: { "x-pjax": "true" }, signal },
      expect.any(Function),
    );
  });

  it("does not follow redirects and cancels the underlying response stream", async () => {
    incoming.statusCode = 302;
    incoming.headers.location = "https://example.com";
    const response = await requestMarketplacePage(url, {});
    expect(response.status).toBe(302);
    await response.body?.cancel();
    expect(incoming.destroyed).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("propagates a request error without retrying", async () => {
    vi.mocked(get).mockImplementation(() => request as ClientRequest);
    const pending = requestMarketplacePage(url, {});
    const error = new Error("connection failed");
    request.emit("error", error);
    await expect(pending).rejects.toBe(error);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("propagates failures while streaming the response body", async () => {
    const response = await requestMarketplacePage(url, {});
    const pending = response.text();
    incoming.destroy(new Error("connection interrupted"));
    await expect(pending).rejects.toThrow("connection interrupted");
  });

  it.each([
    ["gzip", gzipSync],
    ["deflate", deflateSync],
    ["br", brotliCompressSync],
  ] as const)(
    "decompresses %s encoded HTML responses and strips encoding headers",
    async (encoding, compress) => {
      const compressed = compress(Buffer.from("<table>compressed</table>"));
      incoming.headers = {
        "content-type": "text/html",
        "content-encoding": encoding,
        "content-length": String(compressed.byteLength),
      };
      const response = await requestMarketplacePage(url, {});
      incoming.push(compressed);
      incoming.push(null);
      expect(await response.text()).toBe("<table>compressed</table>");
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("content-length")).toBeNull();
    },
  );

  it("destroys the upstream stream when a compressed response body is cancelled", async () => {
    incoming.headers = {
      "content-type": "text/html",
      "content-encoding": "gzip",
    };
    const response = await requestMarketplacePage(url, {});
    await response.body?.cancel();
    expect(incoming.destroyed).toBe(true);
  });

  it.each([204, 304])("returns an empty body for HTTP %i", async (status) => {
    incoming.statusCode = status;
    const response = await requestMarketplacePage(url, {});
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
  });

  it("maps out-of-range status codes safely to 502", async () => {
    incoming.statusCode = 99;
    const response = await requestMarketplacePage(url, {});
    incoming.push(null);
    expect(response.status).toBe(502);
  });
});
