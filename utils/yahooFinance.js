/**
 * Yahoo Finance API Fetcher via CORS Proxy
 * Fetches historical daily prices (up to 3 years) and the current market price
 * for any stock, ETF, or cryptocurrency.
 */

export async function fetchYahooFinanceData(symbol) {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!cleanSymbol || cleanSymbol === '-') {
    throw new Error('Invalid symbol');
  }

  const endpoint = `/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?range=3y&interval=1d`;
  // In local development Vite proxies Yahoo server-side, avoiding a fragile public CORS proxy.
  // Deployments can set VITE_MARKET_DATA_BASE_URL to their own server-side proxy.
  const marketDataBaseUrl = import.meta.env.VITE_MARKET_DATA_BASE_URL;
  // Use the same-origin proxy in both dev and Vercel production. This avoids
  // depending on a public CORS proxy that can be rate-limited or unavailable.
  const url = marketDataBaseUrl
    ? `${marketDataBaseUrl.replace(/\/$/, '')}${endpoint}`
    : `/api/yahoo${endpoint}`;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Symbol ${cleanSymbol} not found or Yahoo Finance is unreachable.`);
    }

    const data = await response.json();
    if (data.chart?.error) {
      throw new Error(data.chart.error.description || `Failed to fetch ${cleanSymbol}`);
    }

    const result = data.chart?.result?.[0];
    if (!result) {
      throw new Error(`No data found for symbol ${cleanSymbol}`);
    }

    const meta = result.meta || {};
    const name = meta.longName || meta.shortName || meta.symbol || cleanSymbol;
    
    // The regularMarketPrice is the current real-time or delayed market price
    const latestPrice = meta.regularMarketPrice || 0;
    
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    
    const prices = {};
    let lastValidPrice = 0;

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      // Convert Unix timestamp (seconds) to YYYY-MM-DD
      const dateStr = new Date(ts * 1000).toISOString().split('T')[0];
      const price = closes[i];

      if (price !== null && price !== undefined && !isNaN(price)) {
        prices[dateStr] = parseFloat(price.toFixed(4));
        lastValidPrice = price;
      } else if (lastValidPrice > 0) {
        prices[dateStr] = parseFloat(lastValidPrice.toFixed(4));
      }
    }

    return {
      symbol: cleanSymbol,
      name,
      latestPrice: parseFloat(latestPrice.toFixed(4)) || parseFloat(lastValidPrice.toFixed(4)) || 0,
      prices
    };
  } catch (error) {
    console.error(`Error in fetchYahooFinanceData for ${cleanSymbol}:`, error);
    throw error;
  }
}
