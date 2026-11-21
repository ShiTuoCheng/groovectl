import { open } from "node:fs/promises";

import { AppError } from "../errors/app-error.js";
import {
  gradeRank,
  parseMarketplacePage,
} from "../discogs/marketplace-page.js";
import {
  mediaGrades,
  type MarketplaceCurrency,
  type MarketplaceOffer,
  type MarketplaceOfferSort,
  type MediaGrade,
} from "../domain/marketplace.js";
import { requestMarketplacePage } from "../http/marketplace-request.js";

export interface OfferOptions {
  page?: number;
  perPage: number;
  all?: boolean;
  html?: string;
  sort?: MarketplaceOfferSort;
  shipsFrom?: string;
  currency?: MarketplaceCurrency;
  minMedia?: MediaGrade;
  minSleeve?: MediaGrade;
  maxPrice?: string;
  minSellerRating?: number;
  includeUnavailable?: boolean;
}

const sortQueryValues: Record<MarketplaceOfferSort, string> = {
  "price-asc": "price,asc",
  "price-desc": "price,desc",
  "listed-desc": "listed,desc",
  "listed-asc": "listed,asc",
  "condition-desc": "condition,desc",
  "condition-asc": "condition,asc",
};

const maxBytes = 10 * 1024 * 1024;

export class MarketplaceOffers {
  constructor(
    private readonly fetchImpl: (
      url: URL,
      init: RequestInit,
    ) => Promise<Response> = requestMarketplacePage,
    private readonly timeoutMs = 30_000,
    private readonly onDiagnostic?: (message: string) => void,
  ) {}

  async *list(
    releaseId: number,
    options: OfferOptions,
  ): AsyncGenerator<MarketplaceOffer> {
    let page = options.page ?? 1;
    let previousEnd = 0;
    const seen = new Set<number>();
    for (let fetched = 0; fetched < 100; fetched += 1) {
      const url = new URL(
        `https://www.discogs.com/sell/release/${String(releaseId)}`,
      );
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(options.perPage));
      url.searchParams.set(
        "sort",
        sortQueryValues[options.sort ?? "price-asc"],
      );
      if (options.shipsFrom)
        url.searchParams.set("ships_from", options.shipsFrom);
      url.searchParams.set("_pjax", "#pjax_container");
      const html =
        options.html === undefined
          ? await this.readWeb(url)
          : await this.readHtml(options.html);
      const parsed = parseMarketplacePage(
        html,
        releaseId,
        options.html === undefined ? url.href : `${url.origin}${url.pathname}`,
        options.html === undefined ? "web" : "html",
      );
      if (
        (fetched > 0 && parsed.start !== previousEnd + 1) ||
        (options.html === undefined &&
          parsed.total > 0 &&
          parsed.start !== (page - 1) * options.perPage + 1)
      ) {
        throw new AppError({
          kind: "upstream",
          code: "GROOVECTL_PAGINATION_INVALID",
          message: "Marketplace pagination repeated or skipped results.",
        });
      }
      for (const item of parsed.items) {
        if (seen.has(item.id))
          throw new AppError({
            kind: "upstream",
            code: "GROOVECTL_PAGINATION_INVALID",
            message: "Marketplace pagination repeated an offer.",
          });
        seen.add(item.id);
        if (matches(item, options)) yield item;
      }
      previousEnd = parsed.end;
      if (
        !options.all ||
        options.html !== undefined ||
        parsed.end >= parsed.total
      )
        return;
      page += 1;
    }
    throw new AppError({
      kind: "usage",
      code: "GROOVECTL_PAGE_LIMIT",
      message: "Marketplace reads are limited to 100 pages per invocation.",
    });
  }

  private async readHtml(path: string): Promise<string> {
    let handle;
    try {
      handle = await open(path, "r");
      const info = await handle.stat();
      if (!info.isFile()) {
        throw new AppError({
          kind: "usage",
          code: "GROOVECTL_HTML_INPUT_ERROR",
          message: "Marketplace HTML input must be a regular file.",
        });
      }
      if (info.size > maxBytes) throw tooLarge();
      const chunks: Buffer[] = [];
      let total = 0;
      const chunkSize = 64 * 1024;
      for (;;) {
        const buffer = Buffer.allocUnsafe(chunkSize);
        const { bytesRead } = await handle.read(buffer, 0, chunkSize, null);
        if (bytesRead === 0) break;
        total += bytesRead;
        if (total > maxBytes) throw tooLarge();
        chunks.push(buffer.subarray(0, bytesRead));
      }
      return Buffer.concat(chunks, total).toString("utf8");
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw new AppError({
        kind: "usage",
        code: "GROOVECTL_HTML_INPUT_ERROR",
        message: "Cannot read the supplied HTML file.",
        cause,
      });
    } finally {
      await handle?.close();
    }
  }

  private async readWeb(url: URL): Promise<string> {
    try {
      const startedAt = Date.now();
      this.onDiagnostic?.(`GET ${url.origin}${url.pathname}`);
      // Website reads must never receive the API token, cookies, or automatic redirects.
      const response = await this.fetchImpl(url, {
        headers: {
          "User-Agent": "Groovectl Marketplace reader",
          Accept: "text/html",
          "Accept-Language": "en",
          "X-PJAX": "true",
          "X-PJAX-Container": "#pjax_container",
        },
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      this.onDiagnostic?.(
        `HTTP ${String(response.status)} in ${String(Date.now() - startedAt)}ms`,
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError({
          kind:
            response.status === 403
              ? "forbidden"
              : response.status === 429
                ? "rate_limited"
                : response.status === 404
                  ? "not_found"
                  : "upstream",
          code:
            response.status === 403
              ? "GROOVECTL_MARKETPLACE_WEB_BLOCKED"
              : response.status === 429
                ? "GROOVECTL_RATE_LIMITED"
                : response.status === 404
                  ? "GROOVECTL_NOT_FOUND"
                  : "GROOVECTL_MARKETPLACE_WEB_ERROR",
          message: `Discogs Marketplace returned HTTP ${String(response.status)}.`,
          remediation:
            response.status === 403
              ? "Website reads are best-effort. Use --html with a release Marketplace page saved in your browser; API tokens do not unlock website access."
              : "No retry was attempted.",
          httpStatus: response.status,
        });
      }
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("text/html")
      ) {
        await response.body?.cancel();
        throw new AppError({
          kind: "upstream",
          code: "GROOVECTL_MARKETPLACE_PAGE_INVALID",
          message: "Discogs did not return an HTML page.",
        });
      }
      if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw tooLarge();
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new AppError({
          kind: "upstream",
          code: "GROOVECTL_MARKETPLACE_PAGE_INVALID",
          message: "Discogs returned an empty response.",
        });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxBytes) throw tooLarge();
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      return Buffer.concat(chunks).toString("utf8");
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw new AppError({
        kind: "network",
        code: "GROOVECTL_NETWORK_ERROR",
        message:
          "The Marketplace website request failed; no retry was attempted.",
        cause,
      });
    }
  }
}

function matches(item: MarketplaceOffer, options: OfferOptions): boolean {
  return (
    (options.includeUnavailable === true ||
      item.availability !== "unavailable") &&
    (options.shipsFrom === undefined ||
      item.shipsFrom?.toLowerCase() === options.shipsFrom.toLowerCase()) &&
    (options.currency === undefined ||
      item.price.currency === options.currency) &&
    (options.maxPrice === undefined ||
      item.price.value <= Number(options.maxPrice)) &&
    (options.minMedia === undefined ||
      gradeRank(item.condition) >= gradeRankFor(options.minMedia)) &&
    (options.minSleeve === undefined ||
      gradeRank(item.sleeveCondition) >= gradeRankFor(options.minSleeve)) &&
    (options.minSellerRating === undefined ||
      (item.seller.rating !== null &&
        item.seller.rating >= options.minSellerRating))
  );
}

function gradeRankFor(grade: MediaGrade): number {
  return mediaGrades.indexOf(grade);
}

function tooLarge(): AppError {
  return new AppError({
    kind: "usage",
    code: "GROOVECTL_HTML_TOO_LARGE",
    message: "Marketplace HTML input exceeds the 10 MiB limit.",
  });
}
