// store-adapters.mjs
//
// Each adapter searches one store's site for a product name and returns
// up to `limit` matches as { title, price }. `price` must be the PACK /
// UNIT price shown on the site — not recalculated per kg. Items that are
// genuinely sold loose by weight (fruit, veg, some meat) will naturally
// come back with a per-kg price from the store itself, which is fine —
// that IS the real unit price for that product.
//
// HONEST CAVEAT: this was written without live internet access, so the
// selectors below are a best-effort starting point, not verified against
// the real current markup. Пятёрочка and Магнит are left as stubs on
// purpose rather than guessed — their sites are more aggressively
// protected and guessing selectors would just produce silently-wrong
// code. To finish an adapter:
//   1. Open the store's search page in a real browser.
//   2. DevTools → inspect a product card → note the class names/attributes
//      around the title and the price.
//   3. Fill in the matching adapter below (or send me the HTML/selectors
//      and I'll do it with you).

async function searchPerekrestok(page, query, limit = 5) {
  const url = `https://www.perekrestok.ru/cat/search?text=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page
    .waitForSelector('[data-qa*="product"], [class*="product-card"]', { timeout: 8000 })
    .catch(() => {});

  const items = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-qa*="product"], [class*="product-card"]'));
    return cards
      .map(card => {
        const titleEl = card.querySelector('[class*="title"], [class*="name"]');
        const priceEl = card.querySelector('[class*="price"]:not([class*="old"])');
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

// TODO: needs real selectors — left as a stub, see caveat above.
async function searchPyaterochka(_page, _query, _limit = 5) {
  return [];
}

// TODO: needs real selectors — left as a stub, see caveat above.
async function searchMagnit(_page, _query, _limit = 5) {
  return [];
}

export const STORE_ADAPTERS = [
  { name: 'Перекрёсток', search: searchPerekrestok },
  { name: 'Пятёрочка', search: searchPyaterochka },
  { name: 'Магнит', search: searchMagnit },
];
