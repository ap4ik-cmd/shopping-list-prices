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

// Командор (kopilkago.ru) doesn't navigate to a separate search-results
// URL — results appear as a dropdown under the search field while
// typing. So instead of goto()-ing a search URL, we type into the
// field on the homepage and read whatever appears.
async function searchKomandor(page, query, limit = 5) {
  await page.goto('https://kopilkago.ru/', { waitUntil: 'domcontentloaded', timeout: 20000 });

  const input = await page.waitForSelector('.header-search__input', { timeout: 10000 }).catch(() => null);
  if (!input) {
    console.warn('  [Командор] поле поиска не найдено (.header-search__input) — верстка страницы могла измениться');
    return [];
  }

  await input.click();
  // Печать по буквам иногда обрезала первое слово в многословных запросах
  // (похоже, сайт что-то переигрывает в поле по ходу ввода). Раз мы всё
  // равно жмём отдельную кнопку поиска — надёжнее сразу подставить
  // готовое значение целиком.
  await input.fill(query);
  const actualValue = await input.inputValue().catch(() => '');
  if (actualValue !== query) {
    console.warn(`  [Командор] поле поиска показывает "${actualValue}", а не "${query}" — возможно, промах`);
  }

  // Ввод текста сам по себе НЕ запускает поиск на этом сайте — нужно
  // явно нажать на кнопку-лупу рядом с полем.
  const urlBefore = page.url();
  const submitBtn = await page.waitForSelector('.header-search__submit', { timeout: 5000 }).catch(() => null);
  if (!submitBtn) {
    console.warn('  [Командор] кнопка поиска не найдена (.header-search__submit) — поиск не запущен');
    return [];
  }
  await submitBtn.click();

  // Индикатор загрузки для коротких запросов появляется и исчезает
  // слишком быстро, чтобы его поймать — вместо гонки за ним просто ждём
  // фиксированную паузу, достаточную для сетевого запроса и рендера.
  await page.waitForTimeout(1800);
  const resultsList = await page
    .waitForSelector('.header-search-result-products__list', { timeout: 8000 })
    .catch(() => null);
  await page.waitForTimeout(400);

  const urlAfter = page.url();
  if (urlAfter !== urlBefore) {
    console.warn(`  [Командор] после клика по поиску адрес страницы изменился: ${urlBefore} → ${urlAfter}`);
  }

  if (!resultsList) {
    // Раньше здесь был фолбэк "|| document", который в случае ненайденного
    // блока результатов скрейпил ВСЮ страницу (включая рекомендации на
    // главной) и возвращал одни и те же карточки независимо от запроса —
    // именно это давало одинаковую цену для любого товара. Теперь вместо
    // этого честно возвращаем пусто и оставляем диагностику в логе, чтобы
    // понять настоящую причину и поправить селектор осознанно, а не вслепую.
    const debug = await page
      .evaluate(() => ({
        productCardLikeCount: document.querySelectorAll('[class*="product-card"]').length,
        pageTitle: document.title,
        bodyTextLength: document.body ? document.body.innerText.length : 0,
      }))
      .catch(() => null);
    console.warn(
      `  [Командор] блок результатов поиска не найден (.header-search-result-products__list). Диагностика: ${JSON.stringify(debug)}`
    );
    return [];
  }

  const items = await page.evaluate((scopeSelector) => {
    const scope = document.querySelector(scopeSelector);
    if (!scope) return [];
    const cards = Array.from(scope.querySelectorAll('.product-card__content'));
    return cards
      .map(card => {
        const nameEl = card.querySelector('.product-card__name');
        // ".../__current" is the pack price as shown (e.g. "80.00" for
        // a 0.5кг pack). Deliberately NOT using the "quantum" weight
        // reference price next to it — that one is per-kg, not the
        // pack price.
        const priceEl = card.querySelector('.product-card-price__current');
        const title = nameEl ? nameEl.textContent.trim() : '';
        const priceText = priceEl ? priceEl.textContent.replace(/\s/g, '').replace(',', '.') : '';
        const match = priceText.match(/[\d.]+/);
        const price = match ? parseFloat(match[0]) : NaN;
        return { title, price };
      })
      .filter(x => x.title && !Number.isNaN(x.price));
  }, '.header-search-result-products__list');

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
  { name: 'Командор', search: searchKomandor },
];
// Магнит и Пятёрочка временно отключены (не участвуют в поиске), но
// функции остались выше — верни нужную сеть в этот список, если
// захочешь снова её подключить.
