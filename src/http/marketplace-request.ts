import { get } from "node:https";
import { Readable, type Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/** One HTTPS GET, with no redirects, retries, cookies, or API credentials. */
export function requestMarketplacePage(
  url: URL,
  init: RequestInit,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: Object.fromEntries(new Headers(init.headers)),
        ...(init.signal == null ? {} : { signal: init.signal }),
      },
      (incoming) => {
        try {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value)) {
              for (const entry of value) headers.append(name, entry);
            } else if (value !== undefined) {
              headers.set(name, value);
            }
          }
          const rawStatus = incoming.statusCode ?? 502;
          const status = rawStatus >= 200 && rawStatus <= 599 ? rawStatus : 502;
          if ([204, 205, 304].includes(status)) {
            incoming.resume();
            resolve(new Response(null, { status, headers }));
            return;
          }
          const bodyStream = decodeStream(incoming, headers);
          resolve(
            new Response(
              Readable.toWeb(bodyStream) as ReadableStream<Uint8Array>,
              { status, headers },
            ),
          );
        } catch (error: unknown) {
          incoming.destroy();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
    );
    request.on("error", reject);
  });
}

function decodeStream(incoming: Readable, headers: Headers): Readable {
  const encoding = headers.get("content-encoding")?.trim().toLowerCase();
  let decoder: Transform | undefined;
  if (encoding === "gzip" || encoding === "x-gzip") {
    decoder = createGunzip();
  } else if (encoding === "deflate") {
    decoder = createInflate();
  } else if (encoding === "br") {
    decoder = createBrotliDecompress();
  }
  if (decoder === undefined) return incoming;
  headers.delete("content-encoding");
  headers.delete("content-length");
  const decompressed = incoming.pipe(decoder);
  incoming.on("error", (error) => decompressed.destroy(error));
  const destroy = decompressed.destroy.bind(decompressed);
  decompressed.destroy = function (error?: Error) {
    incoming.unpipe(decompressed);
    if (!incoming.destroyed) incoming.destroy();
    return destroy(error);
  };
  return decompressed;
}
