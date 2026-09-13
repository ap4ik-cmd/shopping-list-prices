#!/usr/bin/env node
// check-prices.mjs
//
// Two modes:
//   --item "Молоко"   → check price for exactly one product (used by the
//                        "add item" trigger)
//   --all             → read the whole board, collect every unique product
//                        name, refresh all of them (used by the weekly
//                        scheduled workflow)
//
// Writes results to Firebase Realtime Database at /prices/<key>.json,
// using the same public REST endpoint the app itself already uses.

import { chromium } from 'playwright';
import { STORE_ADAPTERS } from './store-adapters.mjs';

const FIREBASE_URL =
  process.env.FIREBASE_URL ||
  'https://foodlisting1-default-rtdb.asia-southeast1.firebasedatabase.app';
const BOARD_PATH = `${FIREBASE_URL}/board.json`;

// Must match the priceKey() function added to the frontend — see
// PATCH-INSTRUCTIONS.md. Firebase keys can't contain . # $ [ ] /
function priceKey(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, '_')
    .replace(/\s+/g, '_');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const itemIdx = args.indexOf('--item');
  if (itemIdx !== -1) return { mode: 'single', item: args[itemIdx + 1] };
  return { mode: 'all' };
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function collectAllItemNames() {
  const board = await fetchJSON(BOARD_PATH);
  const names = new Set();
  if (board && board.sheets) {
    for (const sheetId of Object.keys(board.sheets)) {
      const sheet = board.sheets[sheetId];
      (sheet.categories || []).forEach(cat =>
        (cat.items || []).forEach(it => it.name && names.add(it.name))
      );
      ((sheet.misc && sheet.misc.items) || []).forEach(
        it => it.name && names.add(it.name)
      );
    }
  }
  return Array.from(names);
}

async function priceForItem(browser, name) {
  const page = await browser.newPage();
  const allPrices = [];
  const sources = [];

  for (const adapter of STORE_ADAPTERS) {
    try {
      const results = await adapter.search(page, name, 5);
      if (results.length) {
        allPrices.push(...results.map(r => r.price));
        sources.push(adapter.name);
      }
    } catch (e) {
      console.warn(`[${adapter.name}] failed for "${name}": ${e.message}`);
    }
  }
  await page.close();

  if (!allPrices.length) {
    console.warn(`No prices found anywhere for "${name}"`);
    return null;
  }

  const avg = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
  return {
    avgPrice: Math.round(avg * 100) / 100,
    sampleSize: allPrices.length,
    sources,
    updatedAt: new Date().toISOString(),
  };
}

async function writePrice(key, data) {
  const res = await fetch(`${FIREBASE_URL}/prices/${key}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT prices/${key} -> ${res.status}`);
}

async function main() {
  const { mode, item } = parseArgs();
  if (mode === 'single' && !item) {
    throw new Error('--item requires a value');
  }
  const names = mode === 'single' ? [item] : await collectAllItemNames();
  console.log(`Checking prices for ${names.length} item(s)...`);

  const browser = await chromium.launch();
  for (const name of names) {
    console.log(`→ ${name}`);
    const result = await priceForItem(browser, name);
    if (result) {
      await writePrice(priceKey(name), result);
      console.log(
        `  saved: ${result.avgPrice} ₽ (n=${result.sampleSize}, sources=${result.sources.join(', ') || 'none'})`
      );
    }
  }
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
