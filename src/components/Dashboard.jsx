import { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Award, 
  RefreshCw, 
  Database, 
  Trash2, 
  ExternalLink,
  Plus,
  Info,
  ArrowRight
  ,Filter
} from 'lucide-react';
import LineChart from './LineChart';
import DonutChart from './DonutChart';
import { calculateHoldingsPerformance, calculateMWRSeries } from '../utils/calculations';

export default function Dashboard({ 
  portfolioData, 
  transactions,
  mwr, 
  twr,
  currency,
  setCurrency,
  thbRate,
  connectedSheetUrl,
  syncGoogleSheet,
  disconnectGoogleSheet,
  isSheetSyncing,
  sheetSyncError,
  lastSynced,
  benchmarksList = [],
  onAddBenchmark
}) {
  const { history, cashFlows, currentValue, currentInvested, currentDividends, currentCash, explicitDeposits = 0, inferredDeposits = 0 } = portfolioData;
  const [sheetInput, setSheetInput] = useState('');
  
  // Interactive Options States
  const [calcMethod, setCalcMethod] = useState('TWR'); // TWR, MWR, SR
  const [timeRange, setTimeRange] = useState('ALL');
  const [selectedBenchmark, setSelectedBenchmark] = useState('SPY');
  const [newBenchmarkSymbol, setNewBenchmarkSymbol] = useState('');
  const [benchmarkAddStatus, setBenchmarkAddStatus] = useState('');

  // Allocation/Profit-Loss Toggle State
  const [allocationMode, setAllocationMode] = useState('ALLOCATION'); // ALLOCATION or PROFIT_LOSS

  // Sorting State for table
  const [sortCol, setSortCol] = useState('VALUE'); // SYMBOL, VALUE, 1D_GAIN, GAIN, TOTAL_GAIN
  const [sortAsc, setSortAsc] = useState(false);
  const [ledgerView, setLedgerView] = useState('Overview');
  const [showLedgerFilters, setShowLedgerFilters] = useState(false);
  const [ledgerFilters, setLedgerFilters] = useState({});
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(25);

  const totalGain = currentValue - currentInvested;
  
  // Calculate total return percentage relative to net invested to show correct performance
  const totalDeposits = portfolioData.totalDeposits || currentInvested || 0;
  const totalWithdrawals = portfolioData.totalWithdrawals || 0;
  const netInvested = totalDeposits - totalWithdrawals;
  
  const totalGainPct = netInvested > 0 
    ? totalGain / netInvested 
    : (totalDeposits > 0 ? totalGain / totalDeposits : 0);
    
  const isGainPositive = totalGain >= 0;



  // Currency conversion scaling
  const thbScale = currency === 'THB' ? thbRate : 1;

  // Formatting helpers
  const formatCur = (val) => {
    const converted = val * thbScale;
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: currency, 
      maximumFractionDigits: 0 
    }).format(converted);
  };

  const formatPct = (val) => {
    const sign = val >= 0 ? '+' : '';
    return sign + (val * 100).toFixed(2) + '%';
  };

  // 1. Calculate 1D Gain/Loss
  const latestSnap = history[history.length - 1];
  const yesterdaySnap = history.length > 1 ? history[history.length - 2] : null;
  
  const { oneDGain, oneDGainPct, isOneDGainPositive } = useMemo(() => {
    if (!latestSnap || !yesterdaySnap) {
      return { oneDGain: 0, oneDGainPct: 0, isOneDGainPositive: true };
    }
    // Cash flow change today (deposits - withdrawals)
    const todayNetCF = latestSnap.totalInvested - yesterdaySnap.totalInvested;
    
    // 1D Gain = Today Value - Net Cash Flow Today - Yesterday Value
    const gainVal = latestSnap.totalValue - todayNetCF - yesterdaySnap.totalValue;
    const denominator = yesterdaySnap.totalValue + (todayNetCF > 0 ? todayNetCF : 0);
    const gainPct = denominator > 0 ? gainVal / denominator : 0;
    
    return {
      oneDGain: gainVal,
      oneDGainPct: gainPct,
      isOneDGainPositive: gainVal >= 0
    };
  }, [latestSnap, yesterdaySnap]);

  // 2. Calculate individual stock performance breakdown
  const currentPrices = useMemo(() => {
    const pricesObj = {};
    if (latestSnap) {
      latestSnap.holdingsBreakdown.forEach(h => {
        pricesObj[h.symbol] = h.price;
      });
    }
    return pricesObj;
  }, [latestSnap]);

  const holdingsPerformance = useMemo(() => {
    const perf = calculateHoldingsPerformance(transactions, currentPrices);
    if (!latestSnap) return perf;
    
    return perf.map(hold => {
      const symbol = hold.symbol;
      const valueToday = hold.currentValue;
      
      const yesterdayHold = yesterdaySnap 
        ? yesterdaySnap.holdingsBreakdown.find(h => h.symbol === symbol) 
        : null;
      const priceYesterday = yesterdayHold ? yesterdayHold.price : hold.currentPrice;
      const sharesYesterday = yesterdayHold ? yesterdayHold.shares : 0;
      const valueYesterday = sharesYesterday * priceYesterday;
      
      const todayTx = transactions.filter(t => t.date === latestSnap.date && t.symbol === symbol);
      const buyAmt = todayTx.filter(t => t.type === 'BUY').reduce((sum, t) => sum + t.amount, 0);
      const sellAmt = todayTx.filter(t => t.type === 'SELL').reduce((sum, t) => sum + t.amount, 0);
      const netBuyToday = buyAmt - sellAmt;
      
      const stock1DGain = valueToday - valueYesterday - netBuyToday;
      const denom = valueYesterday + (netBuyToday > 0 ? netBuyToday : 0);
      const stock1DGainPct = denom > 0 ? stock1DGain / denom : 0;
      
      return {
        ...hold,
        oneDGain: stock1DGain,
        oneDGainPct: stock1DGainPct
      };
    });
  }, [transactions, currentPrices, latestSnap, yesterdaySnap]);

  // Calculate portfolio-level Unrealized Gain / Loss
  const { portfolioUnrealizedGain, portfolioUnrealizedGainPct, isUnrealizedGainPositive } = useMemo(() => {
    const unrealized = holdingsPerformance.reduce((sum, h) => sum + h.unrealizedGain, 0);
    const costBasis = holdingsPerformance.reduce((sum, h) => sum + h.costBasis, 0);
    const pct = costBasis > 0 ? unrealized / costBasis : 0;
    return {
      portfolioUnrealizedGain: unrealized,
      portfolioUnrealizedGainPct: pct,
      isUnrealizedGainPositive: unrealized >= 0
    };
  }, [holdingsPerformance]);

  // Handle clickable column header sorting
  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false); // default desc
    }
  };

  const sortedHoldings = useMemo(() => {
    const sorted = [...holdingsPerformance];
    sorted.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortCol === 'SYMBOL') {
        valA = a.symbol;
        valB = b.symbol;
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortCol === 'VALUE') {
        valA = a.currentValue;
        valB = b.currentValue;
      } else if (sortCol === 'SHARES') {
        valA = a.sharesOwned;
        valB = b.sharesOwned;
      } else if (sortCol === 'AVG_COST') {
        valA = a.avgCost;
        valB = b.avgCost;
      } else if (sortCol === 'PRICE') {
        valA = a.currentPrice;
        valB = b.currentPrice;
      } else if (sortCol === '1D_GAIN') {
        valA = a.oneDGain || 0;
        valB = b.oneDGain || 0;
      } else if (sortCol === 'GAIN') {
        valA = a.unrealizedGain;
        valB = b.unrealizedGain;
      } else if (sortCol === 'TOTAL_GAIN') {
        valA = a.totalGain;
        valB = b.totalGain;
      }
      return sortAsc ? valA - valB : valB - valA;
    });
    return sorted;
  }, [holdingsPerformance, sortCol, sortAsc]);

  const filteredHoldings = useMemo(() => {
    const numericMatches = (value, query) => {
      const input = (query || '').trim().replace(/,/g, '');
      if (!input) return true;
      const comparison = input.match(/^(<=|>=|<|>)\s*(-?\d*\.?\d+)$/);
      if (comparison) {
        const number = Number(comparison[2]);
        return comparison[1] === '>' ? value > number : comparison[1] === '>=' ? value >= number : comparison[1] === '<' ? value < number : value <= number;
      }
      const range = input.match(/^(-?\d*\.?\d+)\s*-\s*(-?\d*\.?\d+)$/);
      if (range) return value >= Number(range[1]) && value <= Number(range[2]);
      return String(value).toLowerCase().includes(input.toLowerCase());
    };

    return sortedHoldings.filter(hold => {
      const allocation = currentValue > 0 ? (hold.currentValue / currentValue) * 100 : 0;
      return (!ledgerFilters.symbol || hold.symbol.toLowerCase().includes(ledgerFilters.symbol.toLowerCase()))
        && numericMatches(hold.sharesOwned, ledgerFilters.shares)
        && numericMatches(hold.avgCost, ledgerFilters.avgCost)
        && numericMatches(hold.currentPrice, ledgerFilters.price)
        && numericMatches(hold.currentValue, ledgerFilters.value)
        && numericMatches(hold.oneDGainPct * 100, ledgerFilters.oneDayPct)
        && numericMatches(hold.unrealizedGainPct * 100, ledgerFilters.unrealizedPct)
        && numericMatches(hold.oneDGain, ledgerFilters.oneDayGain)
        && numericMatches(hold.unrealizedGain, ledgerFilters.unrealizedGain)
        && numericMatches(hold.totalGainPct * 100, ledgerFilters.totalGainPct)
        && numericMatches(allocation, ledgerFilters.allocation);
    });
  }, [sortedHoldings, ledgerFilters, currentValue]);

  const setLedgerFilter = (key, value) => {
    setLedgerPage(1);
    setLedgerFilters(prev => ({ ...prev, [key]: value }));
  };
  const selectLedgerView = (view) => {
    setLedgerView(view);
    const sortByView = { Overview: 'VALUE', Cost: 'AVG_COST', Gain: 'GAIN', Price: 'PRICE' };
    setSortCol(sortByView[view]);
    setSortAsc(false);
    setLedgerPage(1);
  };

  const ledgerPageCount = Math.max(1, Math.ceil(filteredHoldings.length / ledgerPageSize));
  const visibleHoldings = useMemo(() => {
    const safePage = Math.min(ledgerPage, ledgerPageCount);
    const start = (safePage - 1) * ledgerPageSize;
    return filteredHoldings.slice(start, start + ledgerPageSize);
  }, [filteredHoldings, ledgerPage, ledgerPageCount, ledgerPageSize]);

  // 3. Generate Line Chart data series dynamically based on TWR, MWR, SR
  const isBenchmarkLoaded = useMemo(() => {
    return latestSnap && latestSnap.benchmarks && latestSnap.benchmarks[selectedBenchmark] !== undefined;
  }, [latestSnap, selectedBenchmark]);

  const chartData = useMemo(() => {
    if (!isBenchmarkLoaded) {
      return history.map(h => ({
        date: h.date,
        portfolioReturn: calcMethod === 'TWR' ? h.twr : h.simpleReturn,
        benchmarkReturn: 0
      }));
    }

    if (calcMethod === 'TWR') {
      return history.map(h => ({
        date: h.date,
        portfolioReturn: h.twr,
        benchmarkReturn: h.benchmarkTWR[selectedBenchmark] || 0
      }));
    } else if (calcMethod === 'SR') {
      return history.map(h => ({
        date: h.date,
        portfolioReturn: h.simpleReturn,
        benchmarkReturn: h.benchmarkSimpleReturn[selectedBenchmark] || 0
      }));
    } else {
      // MWR cumulative de-annualized timelines
      return calculateMWRSeries(history, cashFlows, selectedBenchmark);
    }
  }, [history, cashFlows, calcMethod, selectedBenchmark, isBenchmarkLoaded]);

  const visibleChartData = useMemo(() => {
    if (timeRange === 'ALL' || chartData.length === 0) return chartData;
    const days = { '1M': 31, '3M': 92, '6M': 183, '1Y': 365 }[timeRange];
    const latest = new Date(chartData[chartData.length - 1].date);
    const cutoff = new Date(latest);
    cutoff.setDate(cutoff.getDate() - days);
    return chartData.filter(point => new Date(point.date) >= cutoff);
  }, [chartData, timeRange]);

  // 4. Prepare data for allocation Donut Chart
  const allocationDonutData = useMemo(() => {
    const alloc = holdingsPerformance.map(h => ({
      label: h.symbol,
      value: h.currentValue
    }));
    
    if (currentCash > 0) {
      alloc.push({
        label: 'Cash',
        value: currentCash
      });
    }
    return alloc;
  }, [holdingsPerformance, currentCash]);

  // 5. Add custom benchmark handler
  const handleAddCustomBenchmark = async (e) => {
    e.preventDefault();
    const sym = newBenchmarkSymbol.trim().toUpperCase();
    if (!sym) return;

    setBenchmarkAddStatus('Syncing ETF data...');
    try {
      await onAddBenchmark(sym);
      setNewBenchmarkSymbol('');
      setSelectedBenchmark(sym);
      setBenchmarkAddStatus('Added!');
      setTimeout(() => setBenchmarkAddStatus(''), 3000);
    } catch (err) {
      setBenchmarkAddStatus(`Error: ${err.message || 'Not found'}`);
    }
  };

  const handleConnectSheet = (e) => {
    e.preventDefault();
    if (sheetInput.trim()) {
      syncGoogleSheet(sheetInput.trim());
      setSheetInput('');
    }
  };

  // Find max absolute gain/loss for scaling the profit/loss horizontal bar chart
  const maxAbsGain = useMemo(() => {
    if (holdingsPerformance.length === 0) return 100;
    const values = holdingsPerformance.map(p => Math.abs(p.unrealizedGain));
    return Math.max(...values, 100);
  }, [holdingsPerformance]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Top Header & Currency Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}>
            หุ้นล้านเด้ง Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Multi-currency tracking, MWR & TWR metrics, and Google Sheets integration.
          </p>
        </div>

        {/* Currency Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <button 
            onClick={() => setCurrency('USD')}
            className={`btn`}
            style={{ 
              padding: '6px 16px', 
              fontSize: '13px', 
              borderRadius: '8px', 
              backgroundColor: currency === 'USD' ? 'var(--color-primary)' : 'transparent',
              color: currency === 'USD' ? '#fff' : 'var(--text-secondary)',
              boxShadow: currency === 'USD' ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none'
            }}
          >
            $ USD
          </button>
          <button 
            onClick={() => setCurrency('THB')}
            className={`btn`}
            style={{ 
              padding: '6px 16px', 
              fontSize: '13px', 
              borderRadius: '8px', 
              backgroundColor: currency === 'THB' ? 'var(--color-primary)' : 'transparent',
              color: currency === 'THB' ? '#fff' : 'var(--text-secondary)',
              boxShadow: currency === 'THB' ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none'
            }}
          >
            ฿ THB
          </button>
        </div>
      </div>

      {/* Google Sheets Sync Integration Manager */}
      <div className="glass-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {connectedSheetUrl ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)', flexShrink: 0 }}>
                <Database size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: '600' }}>Google Sheet Connected</h4>
                  <a href={connectedSheetUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', display: 'inline-flex', alignItems: 'center' }} title="Open Google Sheet">
                    <ExternalLink size={12} />
                  </a>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                  Last synced: {lastSynced || 'Just now'} | Exchange Rate: 1 USD = {thbRate.toFixed(2)} THB
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {sheetSyncError && (
                <span style={{ fontSize: '12px', color: 'var(--color-error)' }}>{sheetSyncError}</span>
              )}
              <button 
                onClick={() => syncGoogleSheet(connectedSheetUrl)}
                className={`btn btn-secondary`}
                disabled={isSheetSyncing}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '13px' }}
              >
                <RefreshCw size={14} className={isSheetSyncing ? 'animate-spin' : ''} style={isSheetSyncing ? { animation: 'spin 1.5s linear infinite' } : {}} />
                {isSheetSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button 
                onClick={disconnectGoogleSheet}
                className="btn btn-secondary"
                style={{ padding: '8px 12px', color: 'var(--color-error)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                title="Disconnect Google Sheet"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
            <div style={{ flex: '1', minWidth: '280px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={16} style={{ color: 'var(--text-muted)' }} />
                Sync with your Google Sheet
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', lineHeight: '1.4' }}>
                Paste your Google Sheets sharing link below to load your real portfolio transactions directly. Share settings must be: <strong>"Anyone with the link can view"</strong>.
              </p>
            </div>

            <form onSubmit={handleConnectSheet} style={{ display: 'flex', gap: '12px', flex: '1', minWidth: '320px' }}>
              <input 
                type="text" 
                placeholder="Paste Google Sheets sharing URL..."
                value={sheetInput}
                onChange={(e) => setSheetInput(e.target.value)}
                className="input-field"
                style={{ height: '40px', fontSize: '13px' }}
                required
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                style={{ height: '40px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', flexShrink: 0 }}
                disabled={isSheetSyncing}
              >
                {isSheetSyncing ? 'Loading...' : 'Connect'}
                <ArrowRight size={14} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Metrics Cards Grid - 5 Cards including 1D Gain and Total Gain */}
      <div className="metrics-grid portfolio-metrics">
        {/* Net Portfolio Value */}
        <div className="glass-card metric-card primary">
          <span className="metric-label">Net Value</span>
          <span className="metric-value">{formatCur(currentValue)}</span>
          <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            <span>Cash: {formatCur(currentCash)}</span>
            <span title={inferredDeposits > 0 ? 'Calculated from purchases because no matching deposit was supplied in the transaction log.' : 'Recorded DEPOSIT transactions.'}>
              Funding: {formatCur(explicitDeposits || inferredDeposits)} {inferredDeposits > 0 ? '(inferred)' : '(recorded)'}
            </span>
          </div>
        </div>

        {/* 1D Gain / Loss */}
        <div className={`glass-card metric-card ${isOneDGainPositive ? 'success' : 'loss'}`}>
          <span className="metric-label">1D Gain / Loss</span>
          <span className="metric-value" style={{ color: isOneDGainPositive ? 'var(--color-success)' : 'var(--color-error)' }}>
            {formatCur(oneDGain)}
          </span>
          <div className="metric-change" style={{ marginTop: '2px' }}>
            <span className={isOneDGainPositive ? "change-up" : "change-down"} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '13px' }}>
              {isOneDGainPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />} 
              {formatPct(oneDGainPct)}
            </span>
          </div>
        </div>

        {/* Unrealized Gain / Loss */}
        <div className={`glass-card metric-card ${isUnrealizedGainPositive ? 'success' : 'loss'}`}>
          <span className="metric-label">Unrealized Gain / Loss</span>
          <span className="metric-value" style={{ color: isUnrealizedGainPositive ? 'var(--color-success)' : 'var(--color-error)' }}>
            {formatCur(portfolioUnrealizedGain)}
          </span>
          <div className="metric-change" style={{ marginTop: '2px' }}>
            <span className={isUnrealizedGainPositive ? "change-up" : "change-down"} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '13px' }}>
              {isUnrealizedGainPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />} 
              {formatPct(portfolioUnrealizedGainPct)}
            </span>
          </div>
        </div>

        {/* Total Gain / Loss */}
        <div className={`glass-card metric-card ${isGainPositive ? 'success' : 'loss'}`}>
          <span className="metric-label">Total Return</span>
          <span className="metric-value" style={{ color: isGainPositive ? 'var(--color-success)' : 'var(--color-error)' }}>
            {formatPct(totalGainPct)}
          </span>
          <div className="metric-change" style={{ marginTop: '2px' }}>
            <span className={isGainPositive ? "change-up" : "change-down"} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '13px' }}>
              {isGainPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />} 
              {formatCur(totalGain)}
            </span>
          </div>
        </div>

        {/* Time-Weighted Return */}
        <div className="glass-card metric-card accent">
          <span className="metric-label">TWR Return</span>
          <span className="metric-value" style={{ color: twr >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
            {formatPct(twr)}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Asset compounded performance
          </span>
        </div>

        {/* Money-Weighted Return */}
        <div className="glass-card metric-card benchmark">
          <span className="metric-label">MWR Return</span>
          <span className="metric-value" style={{ color: mwr >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
            {formatPct(mwr)}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Internal Rate of Return (IRR)
          </span>
        </div>
      </div>

      {/* Middle Section: Integrated Performance TIMELINE COMPARISON CHART */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Performance Chart Header Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          
          {/* Left: TWR / MWR / SR calculation selectors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Performance Calculation
            </span>
            <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
              <button 
                onClick={() => setCalcMethod('TWR')}
                className="btn"
                style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', backgroundColor: calcMethod === 'TWR' ? 'var(--color-primary)' : 'transparent', color: calcMethod === 'TWR' ? '#fff' : 'var(--text-secondary)' }}
              >
                TWR
              </button>
              <button 
                onClick={() => setCalcMethod('MWR')}
                className="btn"
                style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', backgroundColor: calcMethod === 'MWR' ? 'var(--color-primary)' : 'transparent', color: calcMethod === 'MWR' ? '#fff' : 'var(--text-secondary)' }}
                title="Money-Weighted Return (IRR)"
              >
                MWR
              </button>
              <button 
                onClick={() => setCalcMethod('SR')}
                className="btn"
                style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', backgroundColor: calcMethod === 'SR' ? 'var(--color-primary)' : 'transparent', color: calcMethod === 'SR' ? '#fff' : 'var(--text-secondary)' }}
                title="Simple Return"
              >
                SR (Simple)
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Range</span>
            <div className="range-control">
              {['1M', '3M', '6M', '1Y', 'ALL'].map(range => (
                <button key={range} type="button" className={timeRange === range ? 'active' : ''} onClick={() => setTimeRange(range)}>{range}</button>
              ))}
            </div>
          </div>

          {/* Right: Benchmark Selection & Add Ticker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="benchmark-select" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Compare Benchmark</label>
              <select 
                id="benchmark-select"
                value={selectedBenchmark}
                onChange={(e) => setSelectedBenchmark(e.target.value)}
                className="select-field"
                style={{ height: '36px', padding: '6px 10px', fontSize: '13px', width: '160px', borderRadius: '8px' }}
              >
                {benchmarksList.map(b => (
                  <option key={b.symbol} value={b.symbol}>{b.symbol} - {b.name.substring(0, 15)}...</option>
                ))}
              </select>
            </div>

            <form onSubmit={handleAddCustomBenchmark} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="add-bench-input" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Add Custom ETF</label>
              <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
                <input 
                  id="add-bench-input"
                  type="text" 
                  placeholder="e.g. SCHG, SPMO"
                  value={newBenchmarkSymbol}
                  onChange={(e) => setNewBenchmarkSymbol(e.target.value)}
                  className="input-field"
                  style={{ height: '36px', width: '130px', fontSize: '13px', padding: '6px 10px', borderRadius: '8px' }}
                  required
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '0 12px', height: '36px', fontSize: '13px', borderRadius: '8px' }}>
                  <Plus size={14} />
                </button>
                {benchmarkAddStatus && (
                  <span style={{ position: 'absolute', bottom: '-18px', left: '4px', fontSize: '10px', color: benchmarkAddStatus.startsWith('Error') ? 'var(--color-error)' : 'var(--color-success)', whiteSpace: 'nowrap' }}>
                    {benchmarkAddStatus}
                  </span>
                )}
              </div>
            </form>
          </div>

        </div>

        {/* Info Banner on selected Return Method */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.01)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <Info size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          <span>
            {calcMethod === 'TWR' && <strong>Time-Weighted Return (TWR)</strong>}
            {calcMethod === 'MWR' && <strong>Money-Weighted Return (MWR / IRR)</strong>}
            {calcMethod === 'SR' && <strong>Simple Return (SR)</strong>}
            {calcMethod === 'TWR' && " measures compounded portfolio growth completely ignoring cash timing. Benchmark lines represent standard index returns."}
            {calcMethod === 'MWR' && " solves for internal rate of return. Benchmark line simulates investing your exact deposits/withdrawals in the benchmark asset."}
            {calcMethod === 'SR' && " calculates gain/loss relative to total deposits: (Current Value + Withdrawals - Deposits) / Deposits (where dividends are included in the Cash portion of Current Value)."}
          </span>
        </div>

        {/* Performance Chart Render */}
        {!isBenchmarkLoaded ? (
          <div style={{ height: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite', marginBottom: '12px' }} />
            Syncing benchmark price history for {selectedBenchmark}...
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: '20px', fontSize: '12px', fontWeight: '600', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f4f6f8' }} />
                Portfolio Return ({calcMethod})
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#7d8592' }} />
                {selectedBenchmark} Benchmark ({calcMethod})
              </span>
            </div>
            <div className="chart-container">
              <LineChart 
                data={visibleChartData}
                keys={['portfolioReturn', 'benchmarkReturn']}
                colors={{ portfolioReturn: '#f4f6f8', benchmarkReturn: '#7d8592' }}
                labels={{ portfolioReturn: 'Portfolio Return', benchmarkReturn: `${selectedBenchmark} Return` }}
                type="percentage"
                currency={currency}
              />
            </div>
          </div>
        )}

      </div>

      {/* Bottom Section: Holdings Table (Left) & Allocation Widget (Right) */}
      <div className="dashboard-bottom-grid" style={{ gap: '24px' }}>
        
        {/* Left: Holdings Table with clickable Sorting headers */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ledger-toolbar">
            <div className="ledger-tabs" role="tablist" aria-label="Holdings view">
              {['Overview', 'Cost', 'Gain', 'Price'].map(view => (
                <button key={view} type="button" className={ledgerView === view ? 'active' : ''} onClick={() => selectLedgerView(view)}>{view}</button>
              ))}
            </div>
            <button type="button" className={`ledger-filter-button ${showLedgerFilters ? 'active' : ''}`} onClick={() => setShowLedgerFilters(value => !value)}>
              <Filter size={14} /> Filters {Object.values(ledgerFilters).filter(Boolean).length > 0 && `(${Object.values(ledgerFilters).filter(Boolean).length})`}
            </button>
          </div>
          {showLedgerFilters && (
            <div className="ledger-filter-panel">
              <div className="ledger-filter-heading">
                <span>Filter every column</span>
                <button type="button" onClick={() => setLedgerFilters({})}>Clear all</button>
              </div>
              <p>Numbers accept an exact value, <code>&gt;10</code>, <code>&lt;0</code>, or a range such as <code>5-20</code>. Percentage fields use percent values.</p>
              <div className="ledger-filter-grid">
                {[
                  ['symbol', 'Ticker'], ['shares', 'Shares'], ['avgCost', 'Avg Cost'], ['price', 'Last Price'], ['value', 'Market Value'],
                  ['oneDayPct', '1D Gain %'], ['unrealizedPct', 'Unr. Gain %'], ['oneDayGain', '1D Gain'], ['unrealizedGain', 'Unr. Gain'], ['totalGainPct', 'Total Return %'], ['allocation', 'Allocation %']
                ].map(([key, label]) => (
                  <label key={key}>{label}<input value={ledgerFilters[key] || ''} onChange={event => setLedgerFilter(key, event.target.value)} placeholder={key === 'symbol' ? 'Search ticker' : 'e.g. >0'} /></label>
                ))}
              </div>
            </div>
          )}
          <div className="table-container">
            <table className="data-table ledger-table">
              <thead>
                <tr>
                  <th 
                    onClick={() => handleSort('SYMBOL')} 
                    style={{ cursor: 'pointer', userSelect: 'none', color: sortCol === 'SYMBOL' ? 'var(--color-accent)' : 'var(--text-secondary)' }}
                  >
                    Symbol {sortCol === 'SYMBOL' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th onClick={() => handleSort('SHARES')} style={{ cursor: 'pointer' }}>Shares</th>
                  <th onClick={() => handleSort('AVG_COST')} style={{ cursor: 'pointer' }}>Avg Cost</th>
                  <th onClick={() => handleSort('PRICE')} style={{ cursor: 'pointer' }}>Last Price</th>
                  <th 
                    onClick={() => handleSort('VALUE')} 
                    style={{ cursor: 'pointer', userSelect: 'none', color: sortCol === 'VALUE' ? 'var(--color-accent)' : 'var(--text-secondary)' }}
                  >
                    Total Value {sortCol === 'VALUE' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    onClick={() => handleSort('1D_GAIN')} 
                    style={{ cursor: 'pointer', userSelect: 'none', color: sortCol === '1D_GAIN' ? 'var(--color-accent)' : 'var(--text-secondary)' }}
                  >
                    1D Gain {sortCol === '1D_GAIN' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    onClick={() => handleSort('GAIN')} 
                    style={{ cursor: 'pointer', userSelect: 'none', color: sortCol === 'GAIN' ? 'var(--color-accent)' : 'var(--text-secondary)' }}
                  >
                    Unrealized Gain {sortCol === 'GAIN' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    onClick={() => handleSort('TOTAL_GAIN')} 
                    style={{ cursor: 'pointer', userSelect: 'none', color: sortCol === 'TOTAL_GAIN' ? 'var(--color-accent)' : 'var(--text-secondary)' }}
                  >
                    Total Gain {sortCol === 'TOTAL_GAIN' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th>Alloc</th>
                </tr>
              </thead>
              <tbody>
                {filteredHoldings.length > 0 ? (
                  visibleHoldings.map((hold) => {
                    const alloc = currentValue > 0 ? hold.currentValue / currentValue : 0;
                    const isStockGainPositive = hold.unrealizedGain >= 0;
                    return (
                      <tr key={hold.symbol}>
                        <td style={{ fontWeight: '700', color: 'var(--color-accent)' }}>{hold.symbol}</td>
                        <td>{hold.sharesOwned.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td>{formatCur(hold.avgCost)}</td>
                        <td>{formatCur(hold.currentPrice)}</td>
                        <td style={{ fontWeight: '600' }}>{formatCur(hold.currentValue)}</td>
                        
                        {/* 1D Gain Column */}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: '700', color: hold.oneDGain >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                              {formatCur(hold.oneDGain)}
                            </span>
                            <span style={{ fontSize: '11px', color: hold.oneDGain >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                              {hold.oneDGain >= 0 ? '+' : ''}{(hold.oneDGainPct * 100).toFixed(2)}%
                            </span>
                          </div>
                        </td>

                        {/* Unrealized Gain Column */}
                        <td>
                          <span style={{ fontWeight: '700', color: isStockGainPositive ? 'var(--color-success)' : 'var(--color-error)' }}>
                            {formatCur(hold.unrealizedGain)}
                          </span>
                        </td>

                        {/* Total Gain Column */}
                        <td>
                          <span style={{ fontWeight: '700', color: hold.totalGain >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                            {hold.totalGain >= 0 ? '+' : ''}{(hold.totalGainPct * 100).toFixed(2)}%
                          </span>
                        </td>

                        {/* Allocation Bar */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: '1', backgroundColor: 'rgba(255, 255, 255, 0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden', minWidth: '40px' }}>
                              <div style={{ backgroundColor: 'var(--color-primary)', height: '100%', width: `${alloc * 100}%` }} />
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: '600', width: '35px', textAlign: 'right' }}>
                              {((hold.currentValue / currentValue) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                      No holdings found. Connect your Google Sheet or add manual transactions to populate.
                    </td>
                  </tr>
                )}
                {currentCash > 0 && (
                  <tr>
                    <td style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>Cash ({currency})</td>
                    <td>-</td>
                    <td>-</td>
                    <td>{formatCur(1)}</td>
                    <td style={{ fontWeight: '600' }}>{formatCur(currentCash)}</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: '1', backgroundColor: 'rgba(255, 255, 255, 0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden', minWidth: '40px' }}>
                          <div style={{ backgroundColor: 'var(--text-secondary)', height: '100%', width: `${(currentCash / currentValue) * 100}%` }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '600', width: '35px', textAlign: 'right' }}>
                          {((currentCash / currentValue) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="ledger-pagination">
              <span>{filteredHoldings.length === 0 ? '0' : `${(Math.min(ledgerPage, ledgerPageCount) - 1) * ledgerPageSize + 1}-${Math.min(ledgerPage * ledgerPageSize, filteredHoldings.length)}`} of {filteredHoldings.length} holdings</span>
              <label>Rows <select value={ledgerPageSize} onChange={(event) => { setLedgerPageSize(Number(event.target.value)); setLedgerPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
              <button type="button" disabled={ledgerPage <= 1} onClick={() => setLedgerPage(page => page - 1)}>‹</button>
              <button type="button" disabled={ledgerPage >= ledgerPageCount} onClick={() => setLedgerPage(page => page + 1)}>›</button>
            </div>
          </div>
        </div>

        {/* Right: Allocation / Profit-Loss Visual Widget */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          
          {/* Widget Header Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <span style={{ fontSize: '15px', fontWeight: '700' }}>Visual Portfolio</span>
            <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <button 
                onClick={() => setAllocationMode('ALLOCATION')}
                className="btn"
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', backgroundColor: allocationMode === 'ALLOCATION' ? 'var(--color-primary)' : 'transparent', color: allocationMode === 'ALLOCATION' ? '#fff' : 'var(--text-secondary)' }}
              >
                Allocation
              </button>
              <button 
                onClick={() => setAllocationMode('PROFIT_LOSS')}
                className="btn"
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', backgroundColor: allocationMode === 'PROFIT_LOSS' ? 'var(--color-primary)' : 'transparent', color: allocationMode === 'PROFIT_LOSS' ? '#fff' : 'var(--text-secondary)' }}
              >
                Gains / Losses
              </button>
            </div>
          </div>

          {/* Widget Chart Content - Auto height to let legends and bar charts expand naturally without scrollbars */}
          <div style={{ display: 'flex', width: '100%', height: 'auto', minHeight: '240px' }}>
            {allocationMode === 'ALLOCATION' ? (
              <div style={{ width: '100%' }}>
                <DonutChart data={allocationDonutData} currency={currency} thbRate={thbRate} />
              </div>
            ) : (
              // Profit/Loss mode: SVG horizontal bar chart (displays all items without scrollbar)
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', padding: '10px 0' }}>
                {holdingsPerformance.length > 0 ? (
                  holdingsPerformance.map((item) => {
                    const isPos = item.unrealizedGain >= 0;
                    const absRatio = Math.abs(item.unrealizedGain) / maxAbsGain;
                    const barWidth = Math.max(absRatio * 45, 3); // min width 3% for visibility
                    
                    return (
                      <div key={item.symbol + '-bar'} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                          <span style={{ fontWeight: '700' }}>{item.symbol}</span>
                          <span style={{ fontWeight: '600', color: isPos ? 'var(--color-success)' : 'var(--color-error)' }}>
                            {formatCur(item.unrealizedGain)} ({isPos ? '+' : ''}{(item.unrealizedGainPct * 100).toFixed(1)}%)
                          </span>
                        </div>
                        <div style={{ display: 'flex', width: '100%', height: '22px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
                          
                          {isPos ? (
                            <div style={{
                              position: 'absolute',
                              left: '50%',
                              width: `${barWidth}%`,
                              height: '100%',
                              backgroundColor: 'rgba(16, 185, 129, 0.4)',
                              borderLeft: '2px solid var(--color-success)'
                            }} />
                          ) : (
                            <div style={{
                              position: 'absolute',
                              right: '50%',
                              width: `${barWidth}%`,
                              height: '100%',
                              backgroundColor: 'rgba(239, 68, 68, 0.4)',
                              borderRight: '2px solid var(--color-error)',
                              left: `${50 - barWidth}%`
                            }} />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', margin: 'auto' }}>
                    No stock data to display.
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Dividends & Yield Income Card */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderLeft: '4px solid var(--color-success)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)', flexShrink: 0 }}>
            <Award size={24} />
          </div>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '600' }}>Passive Dividend Income</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
              Accumulated earnings collected from dividends during the tracking period.
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-success)', fontFamily: 'var(--font-heading)' }}>
            {formatCur(currentDividends)}
          </span>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Yield on Cost: {currentInvested > 0 ? formatPct(currentDividends / currentInvested) : '0.00%'}
          </div>
        </div>
      </div>

    </div>
  );
}
