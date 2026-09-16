// scripts/store-adapters.mjs — адаптер для Командор (kopilkago.ru)

const KOMANDOR_URL = 'https://kopilkago.ru/';
const SEARCH_INPUT_SELECTOR = '.header-search__input';
const RESULTS_LIST_SELECTOR = '.header-search-result-products__list';
const RESULT_ITEM_SELECTOR = `${RESULTS_LIST_SELECTOR} > div > .product-card`;

const RESULTS_TIMEOUT_MS = 8000;
const TYPE_DELAY_MS = 60; // имитация набора, живой поиск обычно debounce ~300-500ms

/**
 * Парсит цену вида "129.99" -> число. Возвращает null, если не нашли.
 */
function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/\s/g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Ищет товар на kopilkago.ru (Командор) и возвращает цену первого результата.
 * @param {import('playwright').Page} page
 * @param {string} productName
 * @returns {Promise<{price: number, oldPrice: number|null, name: string} | null>}
 */
export async function fetchKomandorPrice(page, productName) {
  await page.goto(KOMANDOR_URL, { waitUntil: 'domcontentloaded' });

  const input = page.locator(SEARCH_INPUT_SELECTOR);
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.click();
  await input.fill(''); // на случай остаточного текста

  // Печатаем посимвольно — живой поиск реагирует на input-события,
  // а не на programmatic value-set (fill иногда не триггерит debounce).
  await input.type(productName, { delay: TYPE_DELAY_MS });

  // Ждём именно блок результатов поиска, а не рекомендации внизу страницы.
  // Рекомендации на странице есть всегда — если ждать просто ".product-card",
  // промис резолвится мгновенно на первом товаре из рекомендаций (баг, который
  // мы чинили: одинаковая цена на каждый товар).
  try {
    await page.waitForSelector(RESULTS_LIST_SELECTOR, {
      state: 'visible',
      timeout: RESULTS_TIMEOUT_MS,
    });
  } catch {
    console.warn(`No search results dropdown appeared for "${productName}"`);
    return null;
  }

  // Дополнительно ждём, чтобы внутри блока реально появились карточки
  // (сам контейнер может отрендериться раньше данных).
  const items = page.locator(RESULT_ITEM_SELECTOR);
  try {
    await items.first().waitFor({ state: 'visible', timeout: RESULTS_TIMEOUT_MS });
  } catch {
    console.warn(`No prices found anywhere for "${productName}"`);
    return null;
  }

  const firstItem = items.first();

  const name = (await firstItem.locator('.product-card__name a').innerText().catch(() => '')).trim();
  const currentPriceText = await firstItem
    .locator('.product-card-price__current')
    .innerText()
    .catch(() => null);
  const oldPriceText = await firstItem
    .locator('.product-card-price__old')
    .innerText()
    .catch(() => null);

  const price = parsePrice(currentPriceText);
  if (price === null) {
    console.warn(`Found result for "${productName}" but couldn't parse price: "${currentPriceText}"`);
    return null;
  }

  return {
    price,
    oldPrice: parsePrice(oldPriceText),
    name,
  };
}
