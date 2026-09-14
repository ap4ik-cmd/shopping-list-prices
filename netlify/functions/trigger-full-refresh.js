// Triggers the "Weekly price refresh" GitHub Action on demand, so the
// user can recalculate prices for every product already in the list
// without waiting for the Monday schedule. Uses the same GITHUB_TOKEN /
// GITHUB_REPO env vars as trigger-price-check.js.

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = Netlify.env.get('GITHUB_TOKEN');
  const repo = Netlify.env.get('GITHUB_REPO');

  if (!token || !repo) {
    return new Response('Server not configured', { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/refresh-prices-weekly.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (res.status !== 204) {
    const text = await res.text();
    return new Response(`GitHub dispatch failed: ${res.status} ${text}`, { status: 502 });
  }

  return new Response('OK', { status: 202 });
};

export const config = { path: '/api/trigger-full-refresh' };
