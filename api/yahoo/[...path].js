/**
 * Vercel serverless proxy for Yahoo Finance chart requests.
 * The browser calls /api/yahoo/v8/finance/chart/{symbol}?range=3y&interval=1d
 * and this function forwards it server-side, avoiding browser CORS limits.
 */
export default async function handler(req, res) {
  const pathParts = Array.isArray(req.query?.path)
    ? req.query.path
    : [req.query?.path].filter(Boolean);

  if (pathParts.length === 0) {
    res.status(400).json({ error: 'Missing Yahoo Finance path' });
    return;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, String(item));
    }
  }

  const upstreamUrl = `https://query1.finance.yahoo.com/${pathParts
    .map(part => encodeURIComponent(part))
    .join('/')}${query.toString() ? `?${query.toString()}` : ''}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'user-agent': 'portfolio-tracker/1.0' }
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=600');
    res.send(body);
  } catch {
    res.status(502).json({ error: 'Yahoo Finance request failed' });
  }
}
