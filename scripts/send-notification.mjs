#!/usr/bin/env node
// send-notification.mjs
//
// Отправляет push-уведомление всем сохранённым подпискам. Запускается
// по расписанию (см. .github/workflows/thursday-notification.yml).

import webpush from 'web-push';

const FIREBASE_URL =
  process.env.FIREBASE_URL ||
  'https://foodlisting1-default-rtdb.asia-southeast1.firebasedatabase.app';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY не заданы (нужны секреты в GitHub)');
  process.exit(1);
}

webpush.setVapidDetails('mailto:noreply@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

async function main() {
  const res = await fetch(`${FIREBASE_URL}/pushSubscriptions.json`);
  const raw = res.ok ? await res.json() : null;
  if (!raw) {
    console.log('Нет ни одной подписки — отправлять некому');
    return;
  }

  const payload = JSON.stringify({
    title: 'Food Listing',
    body: 'Пора закупаться! 🛒 Проверьте список покупок.',
  });

  const entries = Object.entries(raw);
  console.log(`Отправляю уведомление ${entries.length} подписчик(ам)...`);

  for (const [id, sub] of entries) {
    try {
      await webpush.sendNotification(sub, payload);
      console.log(`  ✓ отправлено (${id})`);
    } catch (e) {
      console.warn(`  ✗ ошибка для ${id}: ${e.statusCode || e.message}`);
      if (e.statusCode === 404 || e.statusCode === 410) {
        // подписка больше не существует — удаляем её
        await fetch(`${FIREBASE_URL}/pushSubscriptions/${id}.json`, {
          method: 'DELETE',
        }).catch(() => {});
        console.log(`  (удалил протухшую подписку ${id})`);
      }
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
