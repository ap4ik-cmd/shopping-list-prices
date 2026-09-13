# Патч для shopping-list.html

Ниже — что добавить в твой HTML-файл, чтобы он показывал цены и
запускал проверку при добавлении товара. Все вставки — внутри уже
существующего `<script>(function(){ ... })();</script>` в конце файла.

## 1. Константы

Сразу после строки с `POLL_MS`:

```js
const PRICE_FN_URL = '/api/trigger-price-check';
const PRICES_PATH = FIREBASE_URL + '/prices.json';
let prices = {};
```

## 2. Функция нормализации имени (должна СОВПАДАТЬ с priceKey() в check-prices.mjs)

```js
function priceKey(name){
  return name.trim().toLowerCase()
    .replace(/[.#$\[\]\/]/g, '_')
    .replace(/\s+/g, '_');
}
```

## 3. Загрузка цен из Firebase

```js
async function pullPrices(){
  try{
    const res = await fetch(PRICES_PATH, { cache: 'no-store' });
    if(res.ok){
      const raw = await res.json();
      prices = raw || {};
      render();
    }
  }catch(e){
    // тихо игнорируем — цены необязательны для работы списка
  }
}
```

## 4. Вызов при старте и в фоновом поллинге

В функции `init()` — сразу после `startPolling();` в конце добавь:

```js
pullPrices();
setInterval(pullPrices, POLL_MS);
```

## 5. Показ цены в строке продукта

В функции `buildItemRow(item, items)` — после блока, где добавляется
`label` (или `nameInput`), но до `row.appendChild(buildQtyControl(item));`,
вставь:

```js
const priceInfo = prices[priceKey(item.name)];
if(priceInfo && priceInfo.avgPrice){
  const priceEl = document.createElement('span');
  priceEl.className = 'item-price';
  priceEl.style.cssText = 'font-size:12px;color:var(--ink-soft);white-space:nowrap;margin-left:4px;';
  const qtyNum = parseFloat((item.qty || '1').replace(',', '.')) || 1;
  const total = Math.round(priceInfo.avgPrice * qtyNum);
  priceEl.textContent = '≈' + total + '₽';
  row.appendChild(priceEl);
}
```

## 6. Запуск проверки цены при добавлении товара

В функции `buildAddArea`, внутри `commit()`, сразу после строки

```js
items.push({ id: uid(), name: v, qty: DEFAULT_QTY, checked: false });
```

добавь:

```js
fetch(PRICE_FN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ itemName: v })
}).catch(() => {}); // не блокируем добавление, если функция недоступна
```

Это же стоит добавить и в `addCategory()` — в обоих местах, где
создаются `copiedItems` (при копировании продуктов блюда с другого
листа), пройтись по ним и дёрнуть ту же функцию для каждого имени.

---

Цена появится не мгновенно — обычно через 30–90 секунд после
добавления товара (пока GitHub Action запустится и отработает), но
благодаря поллингу раз в 3.5 сек она сама подхватится в интерфейсе,
без перезагрузки страницы.
