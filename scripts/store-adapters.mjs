// store-adapters.mjs
//
// Each adapter searches one store's site for a product name and returns
// up to `limit` matches as { title, price }. `price` must be the PACK /
// UNIT price shown on the site — not recalculated per kg. Items that are
// genuinely sold loose by weight (fruit, veg, some meat) will naturally
// come back with a per-kg price from the store itself, which is fine —
// that IS the real unit price for that product.
//
// Магнит is verified against real markup (as of the HTML sample checked
// with the user). Пятёрочка is left as a stub — its anti-bot protection
// needs a specialised browser (camoufox), not plain Playwright.

async function searchMagnit(page, query, limit = 5) {
  const url = `https://magnit.ru/search?term=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Magnit may show an address/city picker on first visit — try to
  // dismiss it if it's blocking the results (best-effort, harmless if
  // there's nothing to dismiss).
  await page.keyboard.press('Escape').catch(() => {});

  await page
    .waitForSelector('.unit-catalog-product-preview-description', { timeout: 12000 })
    .catch(() => {});

  const items = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.unit-catalog-product-preview-description'));
    return cards
      .map(card => {
        const titleEl = card.querySelector('.unit-catalog-product-preview-title');
        // ".../__regular" is the pack price as shown (e.g. "223.98 ₽").
        // Deliberately NOT using ".../-weighted" — that one is the
        // per-kg reference price (e.g. "159.99 ₽ · 1кг"), not the pack price.
        const priceEl = card.querySelector('.unit-catalog-product-preview-prices__regular');
        const title = titleEl ? titleEl.textContent.trim() : '';
        const priceText = priceEl ? priceEl.textContent.replace(/\s/g, '').replace(',', '.') : '';
        const match = priceText.match(/[\d.]+/);
        const price = match ? parseFloat(match[0]) : NaN;
        return { title, price };
      })
      .filter(x => x.title && !Number.isNaN(x.price));
  });

  return items.slice(0, limit);
}

// TODO: needs real selectors — Пятёрочка's anti-bot protection needs a
// specialised browser (camoufox), not plain Playwright. Left as a stub.
async function searchPyaterochka(_page, _query, _limit = 5) {
  return [];
}

export const STORE_ADAPTERS = [
  { name: 'Магнит', search: searchMagnit },
  { name: 'Пятёрочка', search: searchPyaterochka },
];
