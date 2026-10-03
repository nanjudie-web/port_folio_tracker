/**
 * Financial Calculations for Portfolio Tracker
 * Implements Money-Weighted Return (MWR / IRR) and Time-Weighted Return (TWR)
 */

/**
 * Solves for IRR (MWR) using the Newton-Raphson method.
 * Cash flows are represented as { date: Date, amount: number }
 * where amount is negative for outflows (buying/depositing) and positive for inflows (selling/value).
 */
/**
 * Helper: Solves for IRR (MWR) using the Bisection method on normalized time fractions.
 * timedFlows is represented as { t: number, amount: number } where t is in [0, 1].
 */
function solveIRR(timedFlows) {
  const f = (r) => {
    if (1 + r <= 0) return Infinity;
    let sum = 0;
    for (const flow of timedFlows) {
      sum += flow.amount / Math.pow(1 + r, flow.t);
    }
    return sum;
  };

  let low = -0.999;
  let high = 100.0;
  
  let f_low = f(low);
  let f_high = f(high);
  
  // Expand bounds if signs are the same
  if (f_low * f_high > 0) {
    for (let exp = 0; exp < 10; exp++) {
      high *= 10;
      f_high = f(high);
      if (f_low * f_high <= 0) break;
    }
  }
  
  if (f_low * f_high > 0) {
    const totalInvested = timedFlows.filter(flow => flow.amount < 0).reduce((sum, flow) => sum - flow.amount, 0);
    const finalValue = timedFlows[timedFlows.length - 1].amount;
    return totalInvested > 0 ? (finalValue - totalInvested) / totalInvested : 0;
  }
  
  const tolerance = 1e-7;
  const maxIterations = 100;
  let mid = 0;
  
  for (let i = 0; i < maxIterations; i++) {
    mid = (low + high) / 2;
    const f_mid = f(mid);
    
    if (Math.abs(f_mid) < tolerance || (high - low) / 2 < tolerance) {
      return mid;
    }
    
    if (f_mid * f_low < 0) {
      high = mid;
    } else {
      low = mid;
      f_low = f_mid;
    }
  }
  
  return mid;
}

/**
 * Solves for IRR (MWR) using the Bisection method on normalized time.
 * Cash flows are represented as { date: Date, amount: number }
 * where amount is negative for outflows (buying/depositing) and positive for inflows (selling/value).
 */
export function calculateMWR(cashFlows, finalValue, finalDateStr) {
  if (cashFlows.length === 0) return 0;
  
  // Format cash flows for IRR calculation
  // We treat cash deposits as negative cash flows (capital invested)
  // and the final value of the portfolio as a positive cash flow on the final date.
  const flows = cashFlows.map(cf => ({
    date: new Date(cf.date),
    amount: cf.amount // negative for deposit/outflow, positive for withdraw/inflow
  }));
  
  // Add terminal value of portfolio as a positive inflow
  flows.push({
    date: new Date(finalDateStr),
    amount: finalValue
  });

  const startDate = flows[0].date;
  const endDate = flows[flows.length - 1].date;
  const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

  if (durationDays <= 0) return 0;

  // Normalize time fractions between 0 and 1 to prevent exponents from exploding
  const timedFlows = flows.map(cf => {
    const t = durationDays > 0 ? (cf.date - startDate) / (endDate - startDate) : 0;
    return { t, amount: cf.amount };
  });

  const periodicIRR = solveIRR(timedFlows);
  const T = durationDays / 365.25;

  // If the total period is less than 1 year, we show the absolute periodic return directly
  if (T < 1.0) {
    return periodicIRR;
  }
  
  // Otherwise, annualize it
  if (1 + periodicIRR > 0) {
    return Math.pow(1 + periodicIRR, 1 / T) - 1;
  }
  
  return periodicIRR;
}

/**
 * Computes daily portfolio states and returns time series for charts
 */
export function calculateDailyPortfolio(transactions, historicalPrices, benchmarkSymbols = ['SPY', 'QQQ', 'BTC']) {
  const sortedTransactions = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  
  // Get date range from first transaction or 2024-01-01 to the latest price date
  const startDate = sortedTransactions.length > 0 ? sortedTransactions[0].date : '2024-01-01';
  
  const priceDates = Object.keys(historicalPrices).sort();
  const endDate = priceDates.length > 0 ? priceDates[priceDates.length - 1] : '2026-06-07';
  
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  while (start <= end) {
    dates.push(start.toISOString().split('T')[0]);
    start.setDate(start.getDate() + 1);
  }

  let cash = 0;
  let holdings = {};
  let totalInvested = 0;
  let totalDividends = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let explicitDeposits = 0;
  let inferredDeposits = 0;
  
  // Track cash flows for MWR calculations
  // negative = cash going into portfolio (deposits), positive = cash coming out (withdrawals)
  const cashFlows = []; 
  
  // Daily snapshot arrays
  const portfolioHistory = [];
  // Market series only contain trading days. Keep the latest close so weekends
  // and holidays are valued at the prior close instead of at zero.
  const lastKnownPrices = {};
  
  // Benchmark simulation states
  const benchmarkHoldings = Object.fromEntries(
    benchmarkSymbols.map(symbol => [symbol, { shares: 0 }])
  );

  // Loop through each day
  for (const date of dates) {
    Object.assign(lastKnownPrices, historicalPrices[date] || {});
    const prices = lastKnownPrices;
    const dailyTx = sortedTransactions.filter(t => t.date === date);
    let netCashFlowThisDay = 0; // tracking external cash flows
    
    for (const tx of dailyTx) {
      if (tx.type === 'DEPOSIT') {
        cash += tx.amount;
        totalInvested += tx.amount;
        totalDeposits += tx.amount;
        explicitDeposits += tx.amount;
        netCashFlowThisDay -= tx.amount; // capital invested is an outflow from user
      } else if (tx.type === 'WITHDRAW') {
        cash -= tx.amount;
        totalInvested -= tx.amount;
        totalWithdrawals += tx.amount;
        netCashFlowThisDay += tx.amount; // capital withdrawn is an inflow to user
      } else if (tx.type === 'BUY') {
        const cost = tx.amount; // shares * price + fee
        cash -= cost;
        holdings[tx.symbol] = (holdings[tx.symbol] || 0) + tx.shares;
      } else if (tx.type === 'SELL') {
        const revenue = tx.amount; // shares * price - fee
        cash += revenue;
        holdings[tx.symbol] = (holdings[tx.symbol] || 0) - tx.shares;
        if (holdings[tx.symbol] <= 0.0001) {
          delete holdings[tx.symbol];
        }
      } else if (tx.type === 'DIVIDEND') {
        cash += tx.amount;
        totalDividends += tx.amount;
      }
    }

    // Auto-deposit to cover negative cash (enables trade-only Google Sheets logs)
    if (cash < 0) {
      const autoDeposit = -cash;
      cash = 0;
      totalInvested += autoDeposit;
      totalDeposits += autoDeposit;
      inferredDeposits += autoDeposit;
      netCashFlowThisDay -= autoDeposit;
    }
    
    if (netCashFlowThisDay !== 0) {
      cashFlows.push({ date, amount: netCashFlowThisDay });
      
      // Simulate benchmark purchase/sale
      for (const bench of Object.keys(benchmarkHoldings)) {
        if (prices[bench]) {
          const benchPrice = prices[bench];
          const flowAmount = -netCashFlowThisDay; // positive is deposit
          if (flowAmount > 0) {
            benchmarkHoldings[bench].shares += flowAmount / benchPrice;
          } else if (flowAmount < 0) {
            benchmarkHoldings[bench].shares += flowAmount / benchPrice; // decreases shares
          }
        }
      }
    }
    
    // Value holdings
    let holdingsValue = 0;
    const holdingsBreakdown = [];
    
    for (const [symbol, shares] of Object.entries(holdings)) {
      const price = prices[symbol] || 0;
      const val = shares * price;
      holdingsValue += val;
      holdingsBreakdown.push({ symbol, shares, value: val, price });
    }

    // Do not treat a missing historical quote as a real zero-price loss.
    const hasUnpricedHoldings = holdingsBreakdown.some(item => item.shares > 0 && item.price <= 0);
    
    const totalValue = holdingsValue + cash;
    
    // Benchmark valuations
    const benchmarkValuations = {};
    for (const bench of Object.keys(benchmarkHoldings)) {
      const price = prices[bench] || 0;
      const shares = benchmarkHoldings[bench].shares;
      benchmarkValuations[bench] = shares * price;
    }

    const simpleReturn = totalDeposits > 0 ? (totalValue + totalWithdrawals - totalDeposits) / totalDeposits : 0;
    const benchmarkSimpleReturn = {};
    for (const bench of Object.keys(benchmarkHoldings)) {
      const benchVal = benchmarkValuations[bench] || 0;
      benchmarkSimpleReturn[bench] = totalDeposits > 0 ? (benchVal + totalWithdrawals - totalDeposits) / totalDeposits : 0;
    }

    portfolioHistory.push({
      date,
      cash,
      holdings: { ...holdings },
      holdingsValue,
      totalValue,
      totalInvested,
      totalDividends,
      holdingsBreakdown,
      resolvedPrices: { ...prices },
      hasUnpricedHoldings,
      benchmarks: benchmarkValuations,
      simpleReturn,
      benchmarkSimpleReturn
    });
  }

  // Calculate daily returns for TWR compounding
  // Daily return r_t = (V_t - C_t - V_t-1) / V_t-1 using EOD cash flow convention to prevent return dilution
  const twrFactors = [];
  
  // Do the same for benchmarks
  const benchmarkTWRFactors = Object.fromEntries(
    benchmarkSymbols.map(symbol => [symbol, []])
  );

  for (let i = 0; i < portfolioHistory.length; i++) {
    const current = portfolioHistory[i];
    const prev = i > 0 ? portfolioHistory[i - 1] : { totalValue: 0 };
    
    // Find net cash flow on this date using the change in totalInvested
    const prevInvested = i > 0 ? prev.totalInvested : 0;
    const netCF = current.totalInvested - prevInvested;
    
    // TWR return for the day
    let dailyReturn = 0;
    if (!current.hasUnpricedHoldings && prev.totalValue > 0) {
      dailyReturn = (current.totalValue - netCF - prev.totalValue) / prev.totalValue;
    }

    // The first fully priced portfolio snapshot is the TWR baseline. This avoids
    // turning unavailable price data at an initial trade into a -100% return.
    if (!current.hasUnpricedHoldings && Number.isFinite(dailyReturn)) {
      twrFactors.push(1 + dailyReturn);
    }
    
    // Compounded return up to this day
    const twrToDate = twrFactors.reduce((prod, f) => prod * f, 1) - 1;
    current.twr = twrToDate;

    // Daily return & TWR for benchmarks
    for (const bench of Object.keys(benchmarkTWRFactors)) {
      const prices = current.resolvedPrices;
      const prevPrices = i > 0 ? prev.resolvedPrices : null;
      
      let benchDailyReturn = 0;
      if (prices && prevPrices && prices[bench] && prevPrices[bench]) {
        benchDailyReturn = (prices[bench] - prevPrices[bench]) / prevPrices[bench];
      }
      
      benchmarkTWRFactors[bench].push(1 + benchDailyReturn);
      current.benchmarkTWR = current.benchmarkTWR || {};
      current.benchmarkTWR[bench] = benchmarkTWRFactors[bench].reduce((prod, f) => prod * f, 1) - 1;
    }
  }

  return {
    history: portfolioHistory,
    cashFlows,
    holdings,
    currentValue: portfolioHistory[portfolioHistory.length - 1]?.totalValue || 0,
    currentInvested: portfolioHistory[portfolioHistory.length - 1]?.totalInvested || 0,
    currentDividends: totalDividends,
    currentCash: cash,
    totalDeposits,
    totalWithdrawals,
    explicitDeposits,
    inferredDeposits
  };
}

/**
 * Calculates stock-by-stock performance details (Buy Cost, Sell Proceeds, Dividends, Unrealized & Total Profit/Loss)
 */
export function calculateHoldingsPerformance(transactions, currentPrices) {
  const performance = {};
  
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  sorted.forEach(tx => {
    const sym = tx.symbol;
    if (!sym || sym === '-') return;

    if (!performance[sym]) {
      performance[sym] = {
        symbol: sym,
        sharesOwned: 0,
        avgCost: 0,
        buyCost: 0,
        sellProceeds: 0,
        dividends: 0,
        realizedGain: 0
      };
    }

    const p = performance[sym];

    if (tx.type === 'BUY') {
      const cost = tx.amount; // includes fee
      const newShares = p.sharesOwned + tx.shares;
      if (newShares > 0) {
        p.avgCost = (p.sharesOwned * p.avgCost + cost) / newShares;
      }
      p.sharesOwned = newShares;
      p.buyCost += cost;
    } else if (tx.type === 'SELL') {
      const revenue = tx.amount; // price * shares - fee
      const costOfSoldShares = tx.shares * p.avgCost;
      p.realizedGain += revenue - costOfSoldShares;
      p.sharesOwned = Math.max(0, p.sharesOwned - tx.shares);
      if (p.sharesOwned <= 0.00001) {
        p.sharesOwned = 0;
        p.avgCost = 0;
      }
      p.sellProceeds += revenue;
    } else if (tx.type === 'DIVIDEND') {
      p.dividends += tx.amount;
    }
  });

  Object.keys(performance).forEach(sym => {
    const p = performance[sym];
    p.currentPrice = currentPrices[sym] || 0;
    p.currentValue = p.sharesOwned * p.currentPrice;
    
    // Cost basis of current shares
    p.costBasis = p.sharesOwned * p.avgCost;
    
    // Unrealized gain (on current open positions)
    p.unrealizedGain = p.currentValue - p.costBasis;
    p.unrealizedGainPct = p.avgCost > 0 ? (p.currentPrice - p.avgCost) / p.avgCost : 0;
    
    // Total gain (including realized gains and dividends)
    p.totalGain = p.unrealizedGain + p.realizedGain + p.dividends;
    p.totalGainPct = p.buyCost > 0 ? p.totalGain / p.buyCost : 0;
  });

  // Filter out assets that are completely liquidated and have 0 values
  return Object.values(performance).filter(p => p.sharesOwned > 0 || Math.abs(p.totalGain) > 0.01);
}

/**
 * Generates daily cumulative MWR (IRR) series for line chart plotting
 */
export function calculateMWRSeries(history, cashFlows, symbol) {
  return history.map(h => {
    const dateStr = h.date;
    const filteredCF = cashFlows.filter(cf => cf.date <= dateStr);
    
    const portfolioMWR = calculateMWR(filteredCF, h.totalValue, dateStr);
    const benchmarkValue = h.benchmarks[symbol] || 0;
    const benchmarkMWR = calculateMWR(filteredCF, benchmarkValue, dateStr);
    
    return {
      date: dateStr,
      portfolioReturn: portfolioMWR,
      benchmarkReturn: benchmarkMWR
    };
  });
}
