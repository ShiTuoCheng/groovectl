import { load } from "cheerio";

import { AppError } from "../errors/app-error.js";
import {
  mediaConditionLabels,
  mediaGrades,
  type MarketplaceOffer,
} from "../domain/marketplace.js";

export interface MarketplacePage {
  items: MarketplaceOffer[];
  start: number;
  end: number;
  total: number;
}

export function gradeRank(value: string | null): number {
  return mediaGrades.findIndex(
    (grade) => mediaConditionLabels[grade] === value,
  );
}

export function parseMarketplacePage(
  html: string,
  releaseId: number,
  sourceUrl: string,
  source: "web" | "html",
): MarketplacePage {
  const $ = load(html);
  const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
  const pagination = clean($(".pagination_total").first().text()).replaceAll(
    ",",
    "",
  );
  const range = /^(\d+)\s*[–-]\s*(\d+)\s+of\s+(\d+)$/u.exec(pagination);
  const zero = /^(?:0|0\s+of\s+0|0\s*[–-]\s*0\s+of\s+0)$/u.test(pagination);
  const releasePath = new RegExp(
    `^/(?:sell/release|release)/${String(releaseId)}(?:-|/|$)`,
    "u",
  );
  const pageMatches = $("a[href]")
    .toArray()
    .some((link) => {
      const url = parseDiscogsUrl($(link).attr("href"));
      return (
        url !== undefined &&
        url.origin === "https://www.discogs.com" &&
        releasePath.test(url.pathname)
      );
    });
  // PJAX fragments omit the profile heading. Validate release links, row IDs,
  // pagination, and row counts rather than requiring a full document shell.
  if (!pageMatches || (!range && !zero)) {
    throw invalidPage();
  }
  const start = Number(range?.[1] ?? 0);
  const end = Number(range?.[2] ?? 0);
  const total = Number(range?.[3] ?? 0);
  if (
    ![start, end, total].every(Number.isSafeInteger) ||
    end < start ||
    end > total ||
    (total > 0 && start < 1)
  )
    throw invalidPage();
  const items: MarketplaceOffer[] = [];
  const seen = new Set<number>();
  const readAt = new Date().toISOString();
  for (const row of $("tr[data-release-id]").toArray()) {
    const item = $(row);
    if (item.attr("data-release-id") !== String(releaseId)) throw invalidPage();
    const href = item.find("a.item_description_title").attr("href");
    const url = parseDiscogsUrl(href);
    const idText =
      url === undefined
        ? undefined
        : /^\/sell\/item\/(\d+)$/u.exec(url.pathname)?.[1];
    const id = Number(idText);
    const priceNode = item.find(".item_price .price").first();
    const priceText = priceNode.attr("data-pricevalue") ?? "";
    const currency = priceNode.attr("data-currency") ?? "";
    const price = Number(priceText);
    const conditionNode = item.find(".item_condition").clone();
    conditionNode
      .find(".mplabel, .has-tooltip, .item_sleeve_condition")
      .remove();
    const condition = clean(conditionNode.text());
    const sellerNode = item.find('.seller_info a[href^="/seller/"]').first();
    const seller = clean(sellerNode.text());
    if (
      url === undefined ||
      url.origin !== "https://www.discogs.com" ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      seen.has(id) ||
      !/^\d+(?:\.\d+)?$/u.test(priceText) ||
      !Number.isFinite(price) ||
      price > Number.MAX_SAFE_INTEGER ||
      !/^[A-Z]{3}$/u.test(currency) ||
      gradeRank(condition) < 0 ||
      !seller
    )
      throw invalidPage();
    seen.add(id);
    const ratingText = item
      .find(".seller_info strong")
      .toArray()
      .map((node) => clean($(node).text()))
      .find((text) => /^\d+(?:\.\d+)?%$/u.test(text));
    const rating =
      ratingText === undefined ? null : Number(ratingText.slice(0, -1));
    if (rating !== null && rating > 100) throw invalidPage();
    const feedbackText = clean(
      item.find('a[href^="/sell/seller_feedback/"]').first().text(),
    );
    const feedback = /^(\d[\d,]*)\s+ratings?$/u.exec(feedbackText)?.[1];
    const feedbackCount =
      feedback === undefined ? null : Number(feedback.replaceAll(",", ""));
    if (feedbackCount !== null && !Number.isSafeInteger(feedbackCount)) {
      throw invalidPage();
    }
    const shipsFrom =
      item
        .find(".seller_info li")
        .toArray()
        .map((node) => clean($(node).text()))
        .find((text) => text.startsWith("Ships From:"))
        ?.slice("Ships From:".length)
        .trim() || null;
    items.push({
      id,
      releaseId,
      price: { value: price, currency },
      condition,
      sleeveCondition:
        clean(item.find(".item_sleeve_condition").first().text()) || null,
      comments:
        clean(
          item
            .find(".item_description > p.hide_mobile:not(.label_and_cat)")
            .text(),
        ) || null,
      shipsFrom,
      seller: {
        username: seller,
        rating,
        feedbackCount,
      },
      shippingText:
        clean(item.find(".item_price .item_shipping").first().text()) || null,
      availability: /Unavailable in /u.test(
        clean(item.find(".item_add_to_cart").text()),
      )
        ? "unavailable"
        : "listed",
      marketplaceUrl: `https://www.discogs.com/sell/item/${String(id)}`,
      source,
      sourceUrl,
      readAt,
    });
  }
  if (items.length !== (total === 0 ? 0 : end - start + 1)) throw invalidPage();
  return { items, start, end, total };
}

function parseDiscogsUrl(href: string | undefined): URL | undefined {
  if (href === undefined) return undefined;
  try {
    return new URL(href, "https://www.discogs.com");
  } catch {
    return undefined;
  }
}

function invalidPage(): AppError {
  return new AppError({
    kind: "upstream",
    code: "GROOVECTL_MARKETPLACE_PAGE_INVALID",
    message: "The page is not a recognized Marketplace page for this release.",
    remediation:
      "Check the release, language, page format, and whether Discogs returned a challenge or login page.",
  });
}
