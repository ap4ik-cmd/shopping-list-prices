// store-adapters.mjs
//
// Each adapter searches one store's site for a product name and returns
// up to `limit` matches as { title, price }. `price` must be the PACK /
// UNIT price shown on the site — not recalculated per kg. Items that are
// genuinely sold loose by weight (fruit, veg, some meat) will naturally
// come back with a per-kg price from the store itself, which is fine —
// that IS the real unit price for that product.
//
// Магнит and Командор are verified against real markup (checked with
// the user directly). Пятёрочка is left as a stub — its anti-bot
// protection needs a specialised browser (camoufox), not plain
// Playwright.

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

// Командор (kopilkago.ru): живой поиск по мере ввода, результаты
// появляются прямо под полем поиска. ВАЖНО: до всякого ввода (и сразу
// после клика в поле) там уже показываются "рекомендованные товары" в
// точно такой же вёрстке — если это не учитывать, можно принять их за
// результаты поиска. Поэтому явно ждём, пока список ИЗМЕНИТСЯ по
// сравнению с тем, что было до ввода, а не просто ждём паузу.
function readKomandorCards() {
  const scope = document.querySelector('.header-search-result-products__list') || document;
  const cards = Array.from(scope.querySelectorAll('.product-card__content'));
  return cards
    .map(card => {
      const nameEl = card.querySelector('.product-card__name');
      const priceEl = card.querySelector('.product-card-price__current');
      const title = nameEl ? nameEl.textContent.trim() : '';
      const priceText = priceEl ? priceEl.textContent.replace(/\s/g, '').replace(',', '.') : '';
      const match = priceText.match(/[\d.]+/);
      const price = match ? parseFloat(match[0]) : NaN;
      return { title, price };
    })
    .filter(x => x.title && !Number.isNaN(x.price));
}

async function searchKomandor(page, query, limit = 5) {
  await page.goto('https://kopilkago.ru/', { waitUntil: 'domcontentloaded', timeout: 20000 });

  const input = await page.waitForSelector('.header-search__input', { timeout: 10000 }).catch(() => null);
  if (!input) return [];

  await input.click();
  // Снимок того, что показывается ДО ввода (обычно это рекомендованные
  // товары, не результаты поиска) — по нему поймём, когда список реально
  // обновится.
  await page.waitForTimeout(500);
  const beforeItems = await page.evaluate(readKomandorCards);
  const beforeSignature = beforeItems.map(i => i.title).join('|');

  // Печатаем по буквам — это живой поиск, и именно так реагирует их JS
  // (просто подставленное значение через fill() сайт не замечает).
  await input.type(query, { delay: 80 });

  const actualValue = await input.inputValue().catch(() => '');
  if (actualValue !== query) {
    console.warn(`  [Командор] поле поиска показывает "${actualValue}", а не "${query}" — возможно, промах`);
  }

  // Ждём, пока список результатов реально изменится (не просто фиксированную
  // паузу) — до ~4 секунд, проверяя каждые 300мс.
  let items = [];
  for (let i = 0; i < 13; i++) {
    await page.waitForTimeout(300);
    items = await page.evaluate(readKomandorCards);
    const signature = items.map(x => x.title).join('|');
    if (signature && signature !== beforeSignature) break;
  }

  // Диагностика в лог Action — видно, что реально вернул поиск по запросу.
  console.log(`  [Командор] запрос "${query}" → найдено ${items.length}: ${items.slice(0, 5).map(i => i.title).join(' | ')}`);

  return items.slice(0, limit);
}

// TODO: needs real selectors — Пятёрочка's anti-bot protection needs a
// specialised browser (camoufox), not plain Playwright. Left as a stub.
async function searchPyaterochka(_page, _query, _limit = 5) {
  return [];
}

export const STORE_ADAPTERS = [
  { name: 'Магнит', search: searchMagnit },
];
// Командор и Пятёрочка временно отключены (не участвуют в поиске), но
// функции остались выше — верни нужную сеть в этот список, если
// захочешь снова её подключить.
