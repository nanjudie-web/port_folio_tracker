/**
 * Vercel serverless proxy for Yahoo Finance chart requests.
 * Uses a direct /api/yahoo route so it works reliably with a Vite deployment.
 */
export default async function handler(req, res) {
  const rawPath = req.query?.path;
  const chartPath = String(rawPath || '');
  if (!chartPath || !chartPath.startsWith('/v8/finance/chart/')) {
    res.status(400).json({ error: 'Invalid Yahoo Finance path' });
    return;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, String(item));
    }
  }

  const upstreamUrl = `https://query1.finance.yahoo.com${chartPath}?${query.toString()}`;
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
