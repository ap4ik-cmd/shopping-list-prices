# shopping-list-prices

Фоновая проверка примерных цен для shopping-list.html: при добавлении
товара запускается GitHub Action, который ищет товар в нескольких
сетях магазинов, усредняет цену за упаковку и пишет результат в
Firebase Realtime Database того же проекта, откуда сайт его читает.
Раз в неделю все цены обновляются заново по расписанию.

## Что где лежит

- `.github/workflows/price-on-add.yml` — реагирует на добавление товара
- `.github/workflows/refresh-prices-weekly.yml` — еженедельное обновление
- `scripts/check-prices.mjs` — сам скрипт проверки (Node + Playwright)
- `scripts/store-adapters.mjs` — парсер под каждую сеть магазинов
- `netlify/functions/trigger-price-check.js` — лёгкая функция-триггер
- `PATCH-INSTRUCTIONS.md` — что вставить в твой shopping-list.html

## Настройка (по шагам)

### 1. GitHub — включить Actions

В репозитории: **Settings → Actions → General** → убедись, что
Actions разрешены ("Allow all actions and reusable workflows").

### 2. GitHub — создать токен доступа

**Settings → Developer settings → Personal access tokens → Fine-grained
tokens → Generate new token.**

- Repository access: только этот репозиторий
- Permissions → Actions: **Read and write**
- Скопируй токен (он покажется один раз)

### 3. Netlify — переменные окружения

В настройках сайта на Netlify: **Site configuration → Environment
variables**, добавь:

- `GITHUB_TOKEN` — токен из шага 2
- `GITHUB_REPO` — `arc3nik24ru-ai/shopping-list-prices`

### 4. Задеплоить сайт с новыми файлами

Загрузи все файлы из этого репозитория (включая `netlify/` и
`netlify.toml`) туда же, где лежит твой сайт на Netlify — то есть в
тот же репозиторий/проект, что подключён к Netlify. Netlify сам
подхватит функцию при следующем деплое.

### 5. Применить патч к shopping-list.html

Следуй `PATCH-INSTRUCTIONS.md` — там точные фрагменты кода и куда их
вставлять.

### 6. Проверка

- Добавь новый товар в список → зайди в **Actions** на GitHub → должен
  появиться запуск "Check price for new item".
- Если сеть вернула 0 результатов — открой лог запуска, посмотри
  предупреждение вида `No prices found anywhere for "..."`.

## Честно про ограничения

- Готов (best-effort, но не проверен вживую) только парсер
  Перекрёстка. Пятёрочка и Магнит — заглушки с TODO в
  `store-adapters.mjs`: их защита от ботов сложнее, и угадывать
  селекторы вслепую не имеет смысла — лучше доделать по факту, когда
  будут видны реальные логи/ошибки.
- Если запуск падает с ошибкой скрейпинга — пришли мне текст ошибки
  из лога Action, поправим селекторы вместе.
