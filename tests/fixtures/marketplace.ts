// Synthetic data only; never record real Marketplace responses or credentials.
export const statsFixture = {
  lowest_price: { value: 12.5, currency: "EUR" },
  num_for_sale: 3,
  blocked_from_sale: false,
};

export const listingFixture = {
  id: 42,
  status: "For Sale",
  price: { value: 12.5, currency: "EUR" },
  original_price: {
    value: 14,
    curr_abbr: "USD",
    formatted: "$14.00",
    curr_id: 1,
  },
  shipping_price: { value: 3, currency: "EUR" },
  condition: "Very Good Plus (VG+)",
  sleeve_condition: "Generic",
  comments: "Synthetic fixture\twith a newline\nonly",
  posted: "2026-01-01T12:00:00Z",
  ships_from: "Example Country",
  seller: { username: "fixture-seller", stats: { rating: "99.5" } },
  release: { id: 7, description: "Fixture Artist - Fixture Release" },
  resource_url: "https://api.discogs.com/marketplace/listings/42",
  uri: "https://www.discogs.com/sell/item/42",
  external_id: "private-fixture-comment",
  location: "private-fixture-location",
  quantity: 9,
  weight: 100,
  format_quantity: 1,
  in_cart: true,
};
