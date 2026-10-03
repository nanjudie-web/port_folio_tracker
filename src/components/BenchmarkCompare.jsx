import { useState, useMemo } from 'react';
import { Info, Plus } from 'lucide-react';
import LineChart from './LineChart';
import { calculateMWR } from '../utils/calculations';

export default function BenchmarkCompare({ 
  portfolioData, 
  benchmarksList = [], 
  onAddBenchmark 
}) {
  const [selectedBenchmark, setSelectedBenchmark] = useState('SPY');
  const [newBenchmarkSymbol, setNewBenchmarkSymbol] = useState('');
  const [addStatus, setAddStatus] = useState('');

  const { history, cashFlows, currentValue } = portfolioData;

  // 1. Calculate Portfolio metrics
  const portfolioTWR = history[history.length - 1]?.twr || 0;
  const portfolioMWR = useMemo(() => {
    const latestDateStr = history.length > 0 ? history[history.length - 1].date : '2026-06-07';
    return calculateMWR(cashFlows, currentValue, latestDateStr);
  }, [cashFlows, currentValue, history]);

  // 2. Calculate Benchmark metrics
  // Check if benchmark prices are loaded
  const hasBenchmarkPrices = useMemo(() => {
    const latestSnapshot = history[history.length - 1];
    return latestSnapshot && latestSnapshot.benchmarks && latestSnapshot.benchmarks[selectedBenchmark] !== undefined;
  }, [history, selectedBenchmark]);

  const benchmarkMWR = useMemo(() => {
    if (!hasBenchmarkPrices) return 0;
    const latestSnapshot = history[history.length - 1];
    const finalBenchValue = latestSnapshot?.benchmarks[selectedBenchmark] || 0;
    const latestDateStr = latestSnapshot?.date || '2026-06-07';
    return calculateMWR(cashFlows, finalBenchValue, latestDateStr);
  }, [cashFlows, history, selectedBenchmark, hasBenchmarkPrices]);

  const benchmarkTWR = useMemo(() => {
    if (!hasBenchmarkPrices) return 0;
    return history[history.length - 1]?.benchmarkTWR[selectedBenchmark] || 0;
  }, [history, selectedBenchmark, hasBenchmarkPrices]);

  // Differences
  const twrDiff = portfolioTWR - benchmarkTWR;
  const mwrDiff = portfolioMWR - benchmarkMWR;

  // Prepare double line chart data: Compounded Return (%) of Portfolio vs Benchmark
  const chartData = useMemo(() => {
    return history.map(h => ({
      date: h.date,
      portfolioReturn: h.twr,
      benchmarkReturn: h.benchmarkTWR[selectedBenchmark] || 0
    }));
  }, [history, selectedBenchmark]);

  // Format percent
  const formatPct = (val) => {
    const sign = val >= 0 ? '+' : '';
    return sign + (val * 100).toFixed(2) + '%';
  };

  const handleAddCustomBenchmark = async (e) => {
    e.preventDefault();
    const sym = newBenchmarkSymbol.trim().toUpperCase();
    if (!sym) return;

    setAddStatus('Fetching price history...');
    try {
      await onAddBenchmark(sym);
      setNewBenchmarkSymbol('');
      setSelectedBenchmark(sym); // Select it right away!
      setAddStatus('Added successfully!');
      setTimeout(() => setAddStatus(''), 3000);
    } catch (err) {
      setAddStatus(`Error: ${err.message || 'Verification failed'}`);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', fontFamily: 'var(--font-heading)' }}>Benchmark Comparison</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Evaluate your performance against index ETFs or assets on both MWR and TWR terms.
          </p>
        </div>

        {/* Add custom benchmark inline form */}
        <form onSubmit={handleAddCustomBenchmark} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="Add Benchmark (e.g. SPMO)" 
              value={newBenchmarkSymbol}
              onChange={(e) => setNewBenchmarkSymbol(e.target.value)}
              className="input-field"
              style={{ width: '220px', padding: '10px 14px', height: '42px', fontSize: '13px' }}
              required
            />
            {addStatus && (
              <span style={{ 
                position: 'absolute', 
                bottom: '-20px', 
                left: '4px', 
                fontSize: '11px', 
                color: addStatus.startsWith('Error') ? 'var(--color-error)' : 'var(--color-success)' 
              }}>
                {addStatus}
              </span>
            )}
          </div>
          <button 
            type="submit" 
            className="btn btn-primary"
            style={{ padding: '0 16px', height: '42px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Plus size={14} /> Add
          </button>
        </form>
      </div>

      {/* Info Banner on MWR & TWR */}
      <div className="info-banner">
        <Info size={20} style={{ color: 'var(--color-primary)', marginTop: '2px' }} />
        <div>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
            What is the difference between MWR and TWR?
          </strong>
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>
              <strong>Time-Weighted Return (TWR)</strong>: Measures the compounded growth rate of the assets, eliminating the effects of deposit/withdrawal timings. <em>Perfect for measuring investment selection skill.</em>
            </li>
            <li>
              <strong>Money-Weighted Return (MWR / IRR)</strong>: Reflects the actual rate of return based on the size and exact timing of cash additions and withdrawals. <em>Simulates your real bank account growth rate.</em>
            </li>
            <li>
              <strong>Benchmark MWR</strong> is simulated by executing the exact same cash deposit/withdrawal timeline into the benchmark ETF, making it a fair money-weighted comparison.
            </li>
          </ul>
        </div>
      </div>

      {/* Benchmark Selectors */}
      <div>
        <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '12px', fontWeight: '700' }}>
          Select Benchmark Asset
        </h4>
        <div className="benchmark-selector-grid">
          {benchmarksList.map(bench => (
            <div 
              key={bench.symbol}
              className={`benchmark-card ${selectedBenchmark === bench.symbol ? 'selected' : ''}`}
              onClick={() => setSelectedBenchmark(bench.symbol)}
            >
              <div>
                <span className="benchmark-name">{bench.name}</span>
                <div className="benchmark-desc">{bench.desc}</div>
              </div>
              {selectedBenchmark === bench.symbol && (
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)'
                }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {!hasBenchmarkPrices ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '16px', fontWeight: '500' }}>Loading price history for benchmark {selectedBenchmark}...</p>
          <p style={{ fontSize: '13px', marginTop: '6px' }}>If this persists, please make sure the symbol is valid and you have an active network connection.</p>
        </div>
      ) : (
        <>
          {/* TWR & MWR Return Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            
            {/* TWR Card */}
            <div className="glass-card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="metric-label">Time-Weighted Return (TWR)</span>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', marginTop: '8px' }}>
                    Portfolio: <span style={{ color: portfolioTWR >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{formatPct(portfolioTWR)}</span>
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
                    Benchmark: <strong style={{ color: 'var(--text-primary)' }}>{formatPct(benchmarkTWR)}</strong>
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>Outperformance</span>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: '800', 
                    marginTop: '4px',
                    color: twrDiff >= 0 ? 'var(--color-success)' : 'var(--color-error)' 
                  }}>
                    {twrDiff >= 0 ? '+' : ''}{(twrDiff * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            {/* MWR Card */}
            <div className="glass-card" style={{ borderLeft: '4px solid var(--color-benchmark)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="metric-label">Money-Weighted Return (MWR / IRR)</span>
                  <h3 style={{ fontSize: '24px', fontWeight: '800', marginTop: '8px' }}>
                    Portfolio: <span style={{ color: portfolioMWR >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{formatPct(portfolioMWR)}</span>
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
                    Benchmark: <strong style={{ color: 'var(--text-primary)' }}>{formatPct(benchmarkMWR)}</strong>
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>Outperformance</span>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: '800', 
                    marginTop: '4px',
                    color: mwrDiff >= 0 ? 'var(--color-success)' : 'var(--color-error)' 
                  }}>
                    {mwrDiff >= 0 ? '+' : ''}{(mwrDiff * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Benchmark Return Chart */}
          <div className="glass-card">
            <div className="card-title">
              <span>Performance Chart: Cumulative TWR Return (%)</span>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: '500' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }} />
                  Portfolio Return
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-benchmark)' }} />
                  {selectedBenchmark} Benchmark
                </span>
              </div>
            </div>
            
            <div className="chart-container">
              <LineChart 
                data={chartData} 
                keys={['portfolioReturn', 'benchmarkReturn']} 
                colors={{ portfolioReturn: 'var(--color-primary)', benchmarkReturn: 'var(--color-benchmark)' }} 
                labels={{ portfolioReturn: 'Portfolio Return', benchmarkReturn: `${selectedBenchmark} Return` }} 
                type="percentage"
              />
            </div>
          </div>
        </>
      )}

    </div>
  );
}
