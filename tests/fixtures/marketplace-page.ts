export function offerRow(
  options: {
    id?: number;
    releaseId?: number;
    country?: string;
    condition?: string;
    sleeve?: string;
    currency?: string;
    price?: string;
    unavailable?: boolean;
    rating?: string;
    comments?: string;
    shipping?: string;
  } = {},
): string {
  const o = {
    id: 42,
    releaseId: 7,
    country: "United Kingdom",
    condition: "Very Good Plus (VG+)",
    sleeve: "Near Mint (NM or M-)",
    currency: "GBP",
    price: "80.00",
    rating: "99.5%",
    comments: "Play tested. Sleeve is intact &amp; complete.",
    shipping: "",
    ...options,
  };
  return `<tr data-release-id="${String(o.releaseId)}">
    <td class="item_description">
      <a class="item_description_title" href="/sell/item/${String(o.id)}">Fixture album</a>
      <p class="hide_mobile label_and_cat">Label: Fixture</p>
      <p class="item_condition"><span class="mplabel">Media Condition:</span>
        <span>${o.condition}<span class="has-tooltip">Unrelated grading advice</span></span>
        <br><span class="mplabel">Sleeve Condition:</span><span class="item_sleeve_condition">${o.sleeve}</span>
      </p><p class="hide_mobile">${o.comments}</p>
    </td>
    <td class="seller_info"><ul><li><strong><a href="/seller/fixture-seller/profile">fixture-seller</a></strong></li>
      <li><strong>${o.rating}</strong><a href="/sell/seller_feedback/fixture-seller">1,234 ratings</a></li>
      <li><span class="mplabel">Ships From:</span>${o.country}</li></ul>
    </td>
    <td class="item_price"><span class="price" data-currency="${o.currency}" data-pricevalue="${o.price}">£${o.price}</span>
      <span class="converted_price">about $999.00</span><span class="item_shipping">${o.shipping}</span></td>
    <td class="item_add_to_cart">${o.unavailable === true ? "Unavailable in United Kingdom" : "Add to Cart"}</td>
  </tr>`;
}

export function marketplacePage(
  rows = [offerRow()],
  start = 1,
  total = rows.length,
): string {
  const end = rows.length === 0 ? 0 : start + rows.length - 1;
  return `<html lang="en"><head><title>Fixture Marketplace</title></head><body>
    <h1 id="profile_title">Fixture Album</h1><a href="/release/7-Fixture-Album">View Release Page</a>
    <table>${rows.join("")}</table><strong class="pagination_total">${String(rows.length === 0 ? 0 : start)} – ${String(end)} of ${String(total)}</strong>
  </body></html>`;
}
