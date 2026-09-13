// Lightweight trigger — does NOT scrape anything itself. It just asks
// GitHub to run the "check-price" workflow for one item. Needs two
// Netlify environment variables (Site settings → Environment variables):
//   GITHUB_TOKEN  — a GitHub personal access token, "Actions: write" scope
//                    on this repo is enough (fine-grained token)
//   GITHUB_REPO   — "your-username/shopping-list-prices"

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const itemName = (body.itemName || '').trim();
  if (!itemName) {
    return new Response('itemName is required', { status: 400 });
  }

  const token = Netlify.env.get('GITHUB_TOKEN');
  const repo = Netlify.env.get('GITHUB_REPO');

  if (!token || !repo) {
    return new Response('Server not configured', { status: 500 });
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'check-price',
      client_payload: { itemName },
    }),
  });

  if (res.status !== 204) {
    const text = await res.text();
    return new Response(`GitHub dispatch failed: ${res.status} ${text}`, { status: 502 });
  }

  return new Response('OK', { status: 202 });
};

export const config = { path: '/api/trigger-price-check' };
