import { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ListTodo, 
  LineChart as ChartIcon, 
  Zap,
  Loader2,
  AlertTriangle,
  Database
} from 'lucide-react';
import { INITIAL_TRANSACTIONS } from './utils/mockData';
import { calculateDailyPortfolio, calculateMWR } from './utils/calculations';
import { fetchYahooFinanceData } from './utils/yahooFinance';
import { fetchExchangeRate } from './utils/currency';
import { fetchAndParseGoogleSheet } from './utils/googleSheets';
import Dashboard from './components/Dashboard';
import TransactionList from './components/TransactionList';
import BenchmarkCompare from './components/BenchmarkCompare';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // 1. Core State
  // State for live market prices of holdings and benchmarks.
  const [customAssets, setCustomAssets] = useState({});
  const [pendingFetches, setPendingFetches] = useState([]);
  const [fetchError, setFetchError] = useState('');

  // Currency conversion state
  const [currency, setCurrency] = useState('THB');
  const [thbRate, setThbRate] = useState(36.50);

  // Google Sheets connected URL and Sync Status
  const [connectedSheetUrl, setConnectedSheetUrl] = useState(() => {
    return localStorage.getItem('apexport_connected_sheet_url') || '';
  });
  const [lastSynced, setLastSynced] = useState(() => {
    return localStorage.getItem('apexport_last_synced') || '';
  });
  const [isSheetSyncing, setIsSheetSyncing] = useState(false);
  const [sheetSyncError, setSheetSyncError] = useState('');

  // Benchmarks list
  const [benchmarksList, setBenchmarksList] = useState([
    { symbol: 'SPY', name: 'S&P 500 ETF (SPY)', desc: 'US Large Cap Stocks' },
    { symbol: 'QQQ', name: 'Nasdaq 100 ETF (QQQ)', desc: 'Tech-heavy Growth Stocks' },
    { symbol: 'SPMO', name: 'Invesco S&P 500 Momentum ETF (SPMO)', desc: 'US Large Cap Momentum' }
  ]);

  // Initialize transactions from localStorage or default list
  const [transactions, setTransactions] = useState(() => {
    const saved = localStorage.getItem('apexport_transactions');
    if (!saved) return INITIAL_TRANSACTIONS;
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : INITIAL_TRANSACTIONS;
    } catch {
      localStorage.removeItem('apexport_transactions');
      return INITIAL_TRANSACTIONS;
    }
  });

  // 2. Google Sheets sync function
  const syncGoogleSheet = async (url) => {
    setIsSheetSyncing(true);
    setSheetSyncError('');
    try {
      const parsedTransactions = await fetchAndParseGoogleSheet(url);
      
      setTransactions(parsedTransactions);
      localStorage.setItem('apexport_transactions', JSON.stringify(parsedTransactions));
      
      const nowStr = new Date().toLocaleString('th-TH', { 
        day: 'numeric', month: 'short', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      });
      setLastSynced(nowStr);
      localStorage.setItem('apexport_last_synced', nowStr);
      localStorage.setItem('apexport_connected_sheet_url', url);
      setConnectedSheetUrl(url);
    } catch (err) {
      console.error('Sync error:', err);
      setSheetSyncError(`Sync failed: ${err.message}`);
    } finally {
      setIsSheetSyncing(false);
    }
  };

  const disconnectGoogleSheet = () => {
    setConnectedSheetUrl('');
    setLastSynced('');
    localStorage.removeItem('apexport_connected_sheet_url');
    localStorage.removeItem('apexport_last_synced');
    setTransactions(INITIAL_TRANSACTIONS);
    localStorage.setItem('apexport_transactions', JSON.stringify(INITIAL_TRANSACTIONS));
    setCustomAssets({});
  };

  // 3. Load USD/THB exchange rate & Trigger initial Google Sheet sync on mount
  useEffect(() => {
    const loadData = async () => {
      // Fetch exchange rate
      const rate = await fetchExchangeRate();
      setThbRate(rate);

      // Auto-sync Google Sheet if connected
      const savedSheet = localStorage.getItem('apexport_connected_sheet_url');
      if (savedSheet) {
        syncGoogleSheet(savedSheet);
      }
    };
    loadData();
  }, []);

  // 4. Identify and fetch custom symbols from transactions
  const uniqueSymbols = useMemo(() => {
    return [...new Set(transactions.map(t => t.symbol).filter(s => s && s !== '-' && s !== ''))];
  }, [transactions]);

  // Dynamic fetcher for custom holdings & benchmarks
  useEffect(() => {
    const benchmarkSymbols = benchmarksList.map(b => b.symbol);
    const allRequiredSymbols = [...new Set([...uniqueSymbols, ...benchmarkSymbols])];

    const toFetch = allRequiredSymbols.filter(sym => 
      !customAssets[sym] && 
      !pendingFetches.includes(sym)
    );

    if (toFetch.length > 0) {
      void Promise.resolve().then(async () => {
        setPendingFetches(prev => [...prev, ...toFetch]);
        setFetchError('');

        const queue = [...toFetch];
        const worker = async () => {
          while (queue.length > 0) {
            const sym = queue.shift();
            if (!sym) return;
            try {
              const data = await fetchYahooFinanceData(sym);
              setCustomAssets(prev => ({ ...prev, [sym]: data }));
            } catch (err) {
              console.error(`Failed to fetch market data for ${sym}:`, err);
              setCustomAssets(prev => ({
                ...prev,
                [sym]: { name: `${sym} (Failed)`, prices: {}, latestPrice: 0, failed: true }
              }));
              setFetchError(`Could not resolve market data for "${sym}". Please verify the symbol is correct.`);
            } finally {
              setPendingFetches(prev => prev.filter(s => s !== sym));
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
      });
    }
  }, [uniqueSymbols, benchmarksList, customAssets, pendingFetches]);

  // 5. Merge only live price series. If a feed fails, do not fall back to a
  // simulated quote; the UI should remain honest about unavailable market data.
  const mergedPrices = useMemo(() => {
    const merged = {};

    // Merge fetched asset prices
    Object.entries(customAssets).forEach(([symbol, assetData]) => {
      if (assetData.failed) return;
      Object.entries(assetData.prices).forEach(([date, price]) => {
        if (!merged[date]) {
          merged[date] = {};
        }
        merged[date][symbol] = price;
      });
    });

    // Clean up missing dates (forward-fill) to ensure mathematical calculation integrity
    const allDates = Object.keys(merged).sort();
    const lastKnownPrices = {};
    const allSymbols = [
      'SPY', 'QQQ', 'SPMO',
      ...Object.keys(customAssets)
    ];

    allDates.forEach(date => {
      const dayPrices = merged[date];
      allSymbols.forEach(sym => {
        if (dayPrices[sym] !== undefined) {
          lastKnownPrices[sym] = dayPrices[sym];
        } else if (lastKnownPrices[sym] !== undefined) {
          dayPrices[sym] = lastKnownPrices[sym];
        }
      });
    });

    return merged;
  }, [customAssets]);

  // 6. Calculate Portfolio snapshot on merged prices
  const portfolioData = useMemo(() => {
    return calculateDailyPortfolio(transactions, mergedPrices, benchmarksList.map(b => b.symbol));
  }, [transactions, mergedPrices, benchmarksList]);

  // Compounded returns
  const twr = useMemo(() => {
    const history = portfolioData.history;
    return history[history.length - 1]?.twr || 0;
  }, [portfolioData]);

  const mwr = useMemo(() => {
    const history = portfolioData.history;
    const latestDateStr = history.length > 0 ? history[history.length - 1].date : '2026-06-07';
    return calculateMWR(portfolioData.cashFlows, portfolioData.currentValue, latestDateStr);
  }, [portfolioData]);

  // 7. Handlers for manual edits
  const handleAddTransaction = (newTx) => {
    setTransactions(prev => {
      const updated = [...prev, newTx];
      localStorage.setItem('apexport_transactions', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteTransaction = (id) => {
    setTransactions(prev => {
      const updated = prev.filter(tx => tx.id !== id);
      localStorage.setItem('apexport_transactions', JSON.stringify(updated));
      return updated;
    });
  };

  // Google Sheet manual trigger from Transactions view
  const handleImportTransactions = (importedTxs, mode) => {
    setTransactions(prev => {
      let updated;
      if (mode === 'OVERWRITE') {
        updated = importedTxs;
      } else {
        const transactionKey = (tx) => [tx.date, tx.type, tx.symbol, tx.shares, tx.price, tx.fee, tx.amount, tx.memo].join('|');
        const existingKeys = new Set(prev.map(transactionKey));
        const filteredImported = importedTxs.filter(t => !existingKeys.has(transactionKey(t)));
        updated = [...prev, ...filteredImported];
      }
      localStorage.setItem('apexport_transactions', JSON.stringify(updated));
      return updated;
    });
  };

  // Custom benchmark adder
  const handleAddBenchmark = async (symbol) => {
    const cleanSym = symbol.trim().toUpperCase();
    if (!cleanSym) return;

    if (benchmarksList.some(b => b.symbol === cleanSym)) {
      throw new Error(`Benchmark "${cleanSym}" is already in the list.`);
    }

    const data = await fetchYahooFinanceData(cleanSym);
    setCustomAssets(prev => ({ ...prev, [cleanSym]: data }));

    setBenchmarksList(prev => [
      ...prev,
      { symbol: cleanSym, name: data.name, desc: 'User Custom ETF / Stock' }
    ]);
  };

  const isSyncing = pendingFetches.length > 0 || isSheetSyncing;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          {/* Brand Logo */}
          <div className="brand">
            <div className="brand-icon">ห</div>
            <span className="brand-name">หุ้นล้านเด้ง</span>
          </div>

          {/* Syncing status */}
          {isSyncing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', backgroundColor: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.15)', marginBottom: '20px', fontSize: '12px', color: 'var(--color-accent)' }}>
              <Loader2 size={14} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
              {isSheetSyncing ? 'Syncing Google Sheet...' : `Syncing stock prices (${pendingFetches.length})...`}
            </div>
          )}

          {fetchError && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', marginBottom: '20px', fontSize: '11px', color: 'var(--color-error)' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{fetchError}</div>
            </div>
          )}

          {connectedSheetUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.15)', marginBottom: '20px', fontSize: '12px', color: 'var(--color-success)' }}>
              <Database size={14} />
              Connected: Google Sheet
            </div>
          )}

          {/* Nav Links */}
          <nav className="nav-links">
            <button 
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={18} />
              Home
            </button>
            <button 
              className={`nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
              onClick={() => setActiveTab('transactions')}
            >
              <ListTodo size={18} />
              Transactions
            </button>
            <button 
              className={`nav-item ${activeTab === 'benchmark' ? 'active' : ''}`}
              onClick={() => setActiveTab('benchmark')}
            >
              <ChartIcon size={18} />
              Performance
            </button>
          </nav>
        </div>

        {/* Sidebar Footer info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 16px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <Zap size={14} style={{ color: 'var(--color-accent)' }} />
            Powered by React 19
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            หุ้นล้านเด้ง v1.2.0 (FX Convert)
          </span>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard 
            portfolioData={portfolioData}
            transactions={transactions}
            mwr={mwr}
            twr={twr}
            currency={currency}
            setCurrency={setCurrency}
            thbRate={thbRate}
            connectedSheetUrl={connectedSheetUrl}
            syncGoogleSheet={syncGoogleSheet}
            disconnectGoogleSheet={disconnectGoogleSheet}
            isSheetSyncing={isSheetSyncing}
            sheetSyncError={sheetSyncError}
            lastSynced={lastSynced}
            benchmarksList={benchmarksList}
            onAddBenchmark={handleAddBenchmark}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionList 
            transactions={transactions}
            onAddTransaction={handleAddTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onImportTransactions={handleImportTransactions}
            currency={currency}
            thbRate={thbRate}
          />
        )}

        {activeTab === 'benchmark' && (
          <BenchmarkCompare 
            portfolioData={portfolioData}
            benchmarksList={benchmarksList}
            onAddBenchmark={handleAddBenchmark}
          />
        )}
      </main>

      {/* Add spin animation style helper */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
