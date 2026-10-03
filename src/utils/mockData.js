/**
 * Mock Data Engine for Stock / ETF prices and Transactions
 * Generates realistic price trends for SPY, QQQ, AAPL, MSFT, BTC from 2024 to 2026.
 */

// Helper to seed a random number generator for deterministic outputs
function createRandom(seed) {
  let h = seed ^ 0xDEADBEEF;
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const ASSET_DETAILS = {
  SPY: { name: 'SPDR S&P 500 ETF Trust', type: 'ETF', sector: 'Broad Market', assetClass: 'US Equity' },
  QQQ: { name: 'Invesco QQQ Trust Series 1', type: 'ETF', sector: 'Technology', assetClass: 'US Equity' },
  AAPL: { name: 'Apple Inc.', type: 'Stock', sector: 'Consumer Tech', assetClass: 'US Equity' },
  MSFT: { name: 'Microsoft Corporation', type: 'Stock', sector: 'Software / Cloud', assetClass: 'US Equity' },
  BTC: { name: 'Bitcoin', type: 'Crypto', sector: 'Alternative', assetClass: 'Cryptocurrency' }
};

// Generate list of dates from start to end (inclusive)
export function getDatesRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  while (start <= end) {
    dates.push(start.toISOString().split('T')[0]);
    start.setDate(start.getDate() + 1);
  }
  return dates;
}

// Generate deterministic historical prices using random walk
export function generateHistoricalPrices() {
  const dates = getDatesRange('2024-01-01', '2026-06-07');
  
  // Starting prices on 2024-01-01
  const prices = {
    SPY: 472.00,
    QQQ: 409.00,
    AAPL: 185.00,
    MSFT: 370.00,
    BTC: 42200.00
  };

  // Yearly drifts and volatilities (scaled down to daily)
  const stats = {
    SPY: { drift: 0.12, vol: 0.11 },
    QQQ: { drift: 0.18, vol: 0.16 },
    AAPL: { drift: 0.08, vol: 0.18 },
    MSFT: { drift: 0.10, vol: 0.14 },
    BTC: { drift: 0.35, vol: 0.45 }
  };

  const historical = {};
  
  // Initialize first day
  historical[dates[0]] = { ...prices };

  // Set up seeds for each asset
  const randoms = {
    SPY: createRandom(1001),
    QQQ: createRandom(2002),
    AAPL: createRandom(3003),
    MSFT: createRandom(4040),
    BTC: createRandom(5555)
  };

  const dt = 1 / 252; // trading day step

  for (let i = 1; i < dates.length; i++) {
    const prevDate = dates[i - 1];
    const currentDate = dates[i];
    const dayOfWeek = new Date(currentDate).getDay();
    
    historical[currentDate] = {};
    
    for (const symbol of Object.keys(prices)) {
      // Cryptocurrencies trade on weekends, stocks/ETFs only on weekdays
      if (symbol !== 'BTC' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        // Carry forward weekday prices
        historical[currentDate][symbol] = historical[prevDate][symbol];
        continue;
      }
      
      const prevPrice = historical[prevDate][symbol];
      const rand = randoms[symbol]();
      // Box-Muller transform for normal distribution
      const rand2 = randoms[symbol]();
      const z = Math.sqrt(-2.0 * Math.log(rand)) * Math.cos(2.0 * Math.PI * rand2);
      
      const { drift, vol } = stats[symbol];
      // Geometric Brownian Motion step
      const priceChange = prevPrice * (drift * dt + vol * Math.sqrt(dt) * z);
      let newPrice = prevPrice + priceChange;
      
      // Let's force BTC to have a giant run in late 2024 / early 2025
      if (symbol === 'BTC') {
        const dateObj = new Date(currentDate);
        // Bull run boost
        if (dateObj.getFullYear() === 2024 && dateObj.getMonth() >= 9) {
          newPrice += prevPrice * 0.005; // extra drift
        }
      }
      
      historical[currentDate][symbol] = Math.max(0.01, parseFloat(newPrice.toFixed(2)));
    }
  }

  return historical;
}

// Pre-populated mock transactions
export const INITIAL_TRANSACTIONS = [
  { id: '1', date: '2024-01-05', type: 'DEPOSIT', symbol: '-', shares: 0, price: 0, fee: 0, amount: 50000, memo: 'Initial Cash Deposit' },
  { id: '2', date: '2024-01-10', type: 'BUY', symbol: 'SPY', shares: 40, price: 475.00, fee: 5.00, amount: 19005.00, memo: 'Buy SPY ETF' },
  { id: '3', date: '2024-01-15', type: 'BUY', symbol: 'QQQ', shares: 30, price: 410.00, fee: 5.00, amount: 12305.00, memo: 'Buy Nasdaq ETF' },
  { id: '4', date: '2024-02-10', type: 'BUY', symbol: 'AAPL', shares: 40, price: 180.00, fee: 2.00, amount: 7202.00, memo: 'Buy AAPL Stock' },
  { id: '5', date: '2024-03-20', type: 'BUY', symbol: 'BTC', shares: 0.20, price: 62000.00, fee: 10.00, amount: 12410.00, memo: 'Buy Bitcoin' },
  { id: '6', date: '2024-04-15', type: 'DIVIDEND', symbol: 'SPY', shares: 0, price: 0, fee: 0, amount: 80.00, memo: 'SPY Dividend Payment' },
  { id: '7', date: '2024-06-10', type: 'DEPOSIT', symbol: '-', shares: 0, price: 0, fee: 0, amount: 20000, memo: 'Cash Deposit' },
  { id: '8', date: '2024-07-05', type: 'BUY', symbol: 'MSFT', shares: 20, price: 430.00, fee: 2.00, amount: 8602.00, memo: 'Buy MSFT Stock' },
  { id: '9', date: '2024-10-12', type: 'SELL', symbol: 'AAPL', shares: 15, price: 225.00, fee: 2.00, amount: 3373.00, memo: 'Sell AAPL profit take' },
  { id: '10', date: '2025-01-20', type: 'BUY', symbol: 'BTC', shares: 0.10, price: 90000.00, fee: 15.00, amount: 9015.00, memo: 'Add Bitcoin position' },
  { id: '11', date: '2025-03-15', type: 'SELL', symbol: 'QQQ', shares: 10, price: 470.00, fee: 5.00, amount: 4695.00, memo: 'Reduce QQQ position' },
  { id: '12', date: '2025-06-01', type: 'DIVIDEND', symbol: 'MSFT', shares: 0, price: 0, fee: 0, amount: 50.00, memo: 'MSFT Dividend' }
];
