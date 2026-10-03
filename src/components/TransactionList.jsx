import { useState } from 'react';
import { Plus, Trash2, Calendar, FileText, Download, HelpCircle } from 'lucide-react';
import { fetchAndParseGoogleSheet } from '../utils/googleSheets';

export default function TransactionList({ 
  transactions, 
  onAddTransaction, 
  onDeleteTransaction,
  onImportTransactions,
  currency = 'USD',
  thbRate = 1
}) {
  const [form, setForm] = useState({
    type: 'DEPOSIT',
    date: '2026-06-07',
    symbol: '',
    shares: '',
    price: '',
    fee: '0',
    amount: '',
    memo: ''
  });

  const [error, setError] = useState('');
  
  // Google Sheet Import States
  const [showImport, setShowImport] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [importMode, setImportMode] = useState('APPEND'); // APPEND or OVERWRITE
  const [importStatus, setImportStatus] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const formatCur = (val) => {
    const scale = currency === 'THB' ? thbRate : 1;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(val * scale);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const updated = { ...prev, [name]: value };
      
      // Auto-calculate amount for BUY/SELL
      if (name === 'shares' || name === 'price' || name === 'fee' || name === 'type') {
        const sh = parseFloat(name === 'shares' ? value : prev.shares) || 0;
        const pr = parseFloat(name === 'price' ? value : prev.price) || 0;
        const fe = parseFloat(name === 'fee' ? value : prev.fee) || 0;
        const type = name === 'type' ? value : prev.type;
        
        if (type === 'BUY') {
          updated.amount = (sh * pr + fe).toFixed(2);
        } else if (type === 'SELL') {
          updated.amount = (sh * pr - fe).toFixed(2);
        }
      }
      return updated;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const { type, date, symbol, shares, price, fee, amount, memo } = form;

    if (!date) {
      setError('Date is required');
      return;
    }

    let parsedTx = {
      id: Date.now().toString(),
      date,
      type,
      memo: memo || `${type} transaction`
    };

    if (type === 'DEPOSIT' || type === 'WITHDRAW') {
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) {
        setError('Please enter a valid amount');
        return;
      }
      parsedTx.symbol = '-';
      parsedTx.shares = 0;
      parsedTx.price = 0;
      parsedTx.fee = 0;
      parsedTx.amount = amt;
    } else if (type === 'BUY' || type === 'SELL') {
      const sh = parseFloat(shares);
      const pr = parseFloat(price);
      const fe = parseFloat(fee) || 0;
      
      if (!symbol) {
        setError('Symbol (e.g. SPY, QQQ, AAPL) is required');
        return;
      }
      if (isNaN(sh) || sh <= 0) {
        setError('Shares must be greater than 0');
        return;
      }
      if (isNaN(pr) || pr <= 0) {
        setError('Price must be greater than 0');
        return;
      }
      
      parsedTx.symbol = symbol.toUpperCase();
      parsedTx.shares = sh;
      parsedTx.price = pr;
      parsedTx.fee = fe;
      parsedTx.amount = type === 'BUY' ? (sh * pr + fe) : (sh * pr - fe);
    } else if (type === 'DIVIDEND') {
      const amt = parseFloat(amount);
      if (!symbol) {
        setError('Symbol is required for dividend attribution');
        return;
      }
      if (isNaN(amt) || amt <= 0) {
        setError('Please enter a valid dividend amount');
        return;
      }
      parsedTx.symbol = symbol.toUpperCase();
      parsedTx.shares = 0;
      parsedTx.price = 0;
      parsedTx.fee = 0;
      parsedTx.amount = amt;
    }

    onAddTransaction(parsedTx);
    
    // Reset Form (keep date same for convenience)
    setForm({
      type: 'BUY',
      date: date,
      symbol: '',
      shares: '',
      price: '',
      fee: '0',
      amount: '',
      memo: ''
    });
  };

  // Google Sheet Import Parser
  const handleGoogleSheetImport = async (e) => {
    e.preventDefault();
    setIsImporting(true);
    setImportStatus('Fetching Google Sheet data...');
    setError('');

    try {
      const parsedTransactions = await fetchAndParseGoogleSheet(sheetUrl);
      if (parsedTransactions.length === 0) {
        throw new Error('No valid rows were parsed from the sheet. Check column header formats.');
      }
      onImportTransactions(parsedTransactions, importMode);
      setImportStatus(`Success! Imported ${parsedTransactions.length} transactions successfully.`);
      setSheetUrl('');
      return;

      /* Legacy inline parser retained below temporarily for source-history context.
      const url = sheetUrl.trim();
      if (!url) throw new Error('Please enter a Google Sheet URL');

      // Extract sheetId
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) throw new Error('Invalid URL. Make sure it contains the Google Sheet ID (e.g., /d/xxxxxxxxxxx)');
      const sheetId = match[1];

      // Extract gid
      const gidMatch = url.match(/gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : '0';

      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error('Failed to download the sheet. Please make sure the sheet is shared as "Anyone with the link can view".');
      }

      const csvText = await response.text();
      
      // Parse CSV (handles commas, double quotes, and empty rows correctly)
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result.map(c => c.replace(/^["']|["']$/g, '').trim());
      };

      const rows = csvText.split(/\r?\n/)
        .map(line => parseCSVLine(line))
        .filter(r => r.length > 0 && r.some(c => c !== ''));

      if (rows.length < 2) {
        throw new Error('Spreadsheet has no data or header row');
      }

      const headers = rows[0].map(h => h.toLowerCase());
      
      const findColIndex = (keywords) => {
        // 1. Try exact match first to prevent collision
        let idx = headers.findIndex(h => keywords.some(k => h === k));
        if (idx !== -1) return idx;
        
        // 2. Try fallback matches with safety exclusions (e.g. "จำนวน" shouldn't match "จำนวนเงิน")
        return headers.findIndex(h => keywords.some(k => {
          if (h.includes(k)) {
            if (k === 'จำนวน' && (h.includes('เงิน') || h.includes('บาท') || h.includes('price') || h.includes('ราคา'))) return false;
            if ((k === 'shares' || k === 'qty' || k === 'quantity') && (h.includes('amount') || h.includes('price') || h.includes('fee'))) return false;
            return true;
          }
          return false;
        }));
      };

      // Find indices based on headers
      const dateIdx = findColIndex(['date', 'วัน']);
      const typeIdx = findColIndex(['type', 'action', 'ประเภท', 'รายการ']);
      const symbolIdx = findColIndex(['symbol', 'ticker', 'หุ้น', 'สินทรัพย์']);
      const sharesIdx = findColIndex(['shares', 'qty', 'quantity', 'จำนวน']);
      const priceIdx = findColIndex(['price', 'ราคา']);
      const feeIdx = findColIndex(['fee', 'commission', 'ค่าธรรมเนียม', 'คอม']);
      const amountIdx = findColIndex(['amount', 'cash', 'total', 'ยอดเงิน', 'เงิน']);
      const memoIdx = findColIndex(['memo', 'note', 'notes', 'บันทึก', 'หมายเหตุ']);

      if (dateIdx === -1 || typeIdx === -1) {
        throw new Error('Required columns "Date" or "Type/Action" not found. Check that your header names match (e.g. Date, Action, Ticker, Shares, Price).');
      }

      // Robust date parser to handle DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
      const parseCleanDate = (dateStr) => {
        if (!dateStr) return '';
        const cleanStr = String(dateStr).trim();
        
        // Try native parse first (handles YYYY-MM-DD and standard ISO format)
        let d = new Date(cleanStr);
        if (!isNaN(d.getTime()) && cleanStr.includes('-')) {
          return d.toISOString().split('T')[0];
        }
        
        // Split on slash or dot
        if (cleanStr.includes('/') || cleanStr.includes('.')) {
          const parts = cleanStr.split(/[\/\.]/);
          if (parts.length === 3) {
            let p0 = parseInt(parts[0], 10);
            let p1 = parseInt(parts[1], 10);
            let p2 = parseInt(parts[2], 10);
            
            if (p2 < 100) {
              p2 += p2 < 50 ? 2000 : 1900;
            }
            
            let day, month;
            if (p0 > 12) {
              // Must be DD/MM/YYYY
              day = p0;
              month = p1;
            } else if (p1 > 12) {
              // Must be MM/DD/YYYY
              day = p1;
              month = p0;
            } else {
              // Ambiguous, assume DD/MM/YYYY as standard non-US Google Sheets locale default
              day = p0;
              month = p1;
            }
            
            const testDate = new Date(p2, month - 1, day);
            if (!isNaN(testDate.getTime())) {
              const yyyy = testDate.getFullYear();
              const mm = String(testDate.getMonth() + 1).padStart(2, '0');
              const dd = String(testDate.getDate()).padStart(2, '0');
              return `${yyyy}-${mm}-${dd}`;
            }
          }
        }
        
        // Fallback native parse
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
        return '';
      };

      const parsedTransactions = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        let dateVal = row[dateIdx] || '';
        if (!dateVal) continue; // Skip rows without date
        
        const formattedDate = parseCleanDate(dateVal);
        if (!formattedDate) continue; // Skip rows with invalid date

        // Parse Type (supports EN & TH)
        let rawType = (row[typeIdx] || '').toUpperCase();
        let typeVal = '';
        if (rawType.includes('BUY') || rawType.includes('ซื้อ')) typeVal = 'BUY';
        else if (rawType.includes('SELL') || rawType.includes('ขาย')) typeVal = 'SELL';
        else if (rawType.includes('DEPOSIT') || rawType.includes('ฝาก')) typeVal = 'DEPOSIT';
        else if (rawType.includes('WITHDRAW') || rawType.includes('ถอน')) typeVal = 'WITHDRAW';
        else if (rawType.includes('DIVIDEND') || rawType.includes('ปันผล')) typeVal = 'DIVIDEND';
        
        if (!typeVal) continue; // Skip rows with invalid type

        // Parse Symbol
        let symbolVal = '-';
        if (typeVal !== 'DEPOSIT' && typeVal !== 'WITHDRAW') {
          symbolVal = (row[symbolIdx] || '').trim().toUpperCase();
        }

        // Clean and parse numbers (removes commas, dollar signs, and currency formatting)
        const parseCleanFloat = (val) => {
          if (!val) return 0;
          const cleaned = String(val).replace(/[^0-9.-]/g, '');
          const parsed = parseFloat(cleaned);
          return isNaN(parsed) ? 0 : parsed;
        };

        const sharesVal = parseCleanFloat(row[sharesIdx]);
        const priceVal = parseCleanFloat(row[priceIdx]);
        const feeVal = parseCleanFloat(row[feeIdx]);
        let amountVal = parseCleanFloat(row[amountIdx]);
        const memoVal = row[memoIdx] || '';

        // Auto-calculate amount if not provided
        if (amountVal === 0) {
          if (typeVal === 'BUY') amountVal = sharesVal * priceVal + feeVal;
          else if (typeVal === 'SELL') amountVal = sharesVal * priceVal - feeVal;
          else if (typeVal === 'DEPOSIT' || typeVal === 'WITHDRAW' || typeVal === 'DIVIDEND') {
            amountVal = priceVal || sharesVal || 0;
          }
        }

        parsedTransactions.push({
          id: `sheet-${Date.now()}-${i}`,
          date: formattedDate,
          type: typeVal,
          symbol: symbolVal,
          shares: sharesVal,
          price: priceVal,
          fee: feeVal,
          amount: parseFloat(amountVal.toFixed(2)),
          memo: memoVal || 'Google Sheet Import'
        });
      }

      if (parsedTransactions.length === 0) {
        throw new Error('No valid rows were parsed from the sheet. Check column header formats.');
      }

      onImportTransactions(parsedTransactions, importMode);
      setImportStatus(`Success! Imported ${parsedTransactions.length} transactions successfully.`);
      setSheetUrl('');
      */
    } catch (err) {
      console.error(err);
      setImportStatus(`Error: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', fontFamily: 'var(--font-heading)' }}>Transaction Log</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Record your trades, cash additions, and dividends to recalculate your returns.
          </p>
        </div>

        {/* Toggle Google Sheet Import */}
        <button 
          onClick={() => setShowImport(!showImport)}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Download size={16} />
          {showImport ? 'Hide Google Sheets Import' : 'Import from Google Sheets'}
        </button>
      </div>

      {/* Google Sheets Import Panel */}
      {showImport && (
        <div className="glass-card animate-fade-in" style={{ borderLeft: '4px solid var(--color-accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={18} style={{ color: 'var(--color-accent)' }} />
              Google Sheets Link Integration
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <HelpCircle size={12} />
              CORS-free direct fetch
            </span>
          </div>

          <form onSubmit={handleGoogleSheetImport} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              
              <div className="form-group" style={{ flex: '1', minWidth: '300px' }}>
                <label htmlFor="sheet-url">Google Sheet Sharing URL</label>
                <input 
                  id="sheet-url"
                  type="text" 
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="form-group" style={{ width: '180px' }}>
                <label htmlFor="import-mode">Import Mode</label>
                <select 
                  id="import-mode"
                  value={importMode} 
                  onChange={(e) => setImportMode(e.target.value)} 
                  className="select-field"
                >
                  <option value="APPEND">Append (เพิ่มต่อท้าย)</option>
                  <option value="OVERWRITE">Overwrite (ลบของเก่าทั้งหมด)</option>
                </select>
              </div>

            </div>

            {importStatus && (
              <div 
                className={`badge ${importStatus.startsWith('Error') ? 'badge-error' : 'badge-success'}`}
                style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', display: 'block', width: 'fit-content' }}
              >
                {importStatus}
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--color-accent)', boxShadow: '0 4px 14px rgba(6, 182, 212, 0.3)' }}
                disabled={isImporting}
              >
                {isImporting ? 'Processing...' : 'Fetch & Parse Sheet'}
              </button>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '500px', lineHeight: '1.4' }}>
                <strong>How to setup Sheet:</strong>
                <ol style={{ paddingLeft: '16px', marginTop: '4px' }}>
                  <li>In Google Sheets, click <strong>Share</strong> and select <strong>"Anyone with link can view"</strong></li>
                  <li>Copy your browser URL and paste above</li>
                  <li>Ensure headers include: <strong>Date, Type, Symbol, Shares, Price, Fee, Memo</strong> (or Thai equivalents)</li>
                </ol>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Add Transaction Form (Manual) */}
      <div className="glass-card">
        <h3 className="card-title" style={{ marginBottom: '16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} style={{ color: 'var(--color-primary)' }} />
            Add Transaction Manually
          </span>
        </h3>
        
        {error && (
          <div className="badge badge-error" style={{ marginBottom: '16px', display: 'block', padding: '10px 16px', borderRadius: '8px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            
            {/* Type */}
            <div className="form-group">
              <label htmlFor="tx-type">Type</label>
              <select 
                id="tx-type"
                name="type" 
                value={form.type} 
                onChange={handleChange} 
                className="select-field"
              >
                <option value="DEPOSIT">DEPOSIT CASH</option>
                <option value="WITHDRAW">WITHDRAW CASH</option>
                <option value="BUY">BUY ASSET</option>
                <option value="SELL">SELL ASSET</option>
                <option value="DIVIDEND">RECEIVE DIVIDEND</option>
              </select>
            </div>

            {/* Date */}
            <div className="form-group">
              <label htmlFor="tx-date">Date</label>
              <input 
                id="tx-date"
                type="date" 
                name="date" 
                value={form.date} 
                onChange={handleChange} 
                className="input-field"
                required
              />
            </div>

            {/* Symbol - conditional */}
            {form.type !== 'DEPOSIT' && form.type !== 'WITHDRAW' && (
              <div className="form-group">
                <label htmlFor="tx-symbol">Symbol</label>
                <input 
                  id="tx-symbol"
                  type="text" 
                  name="symbol" 
                  placeholder="AAPL, SPY, QQQ..." 
                  value={form.symbol} 
                  onChange={handleChange} 
                  className="input-field"
                />
              </div>
            )}

            {/* Shares - conditional */}
            {(form.type === 'BUY' || form.type === 'SELL') && (
              <div className="form-group">
                <label htmlFor="tx-shares">Shares</label>
                <input 
                  id="tx-shares"
                  type="number" 
                  name="shares" 
                  step="any"
                  placeholder="Quantity" 
                  value={form.shares} 
                  onChange={handleChange} 
                  className="input-field"
                />
              </div>
            )}

            {/* Price - conditional */}
            {(form.type === 'BUY' || form.type === 'SELL') && (
              <div className="form-group">
                <label htmlFor="tx-price">Price ($)</label>
                <input 
                  id="tx-price"
                  type="number" 
                  name="price" 
                  step="any"
                  placeholder="Per Share" 
                  value={form.price} 
                  onChange={handleChange} 
                  className="input-field"
                />
              </div>
            )}

            {/* Fee - conditional */}
            {(form.type === 'BUY' || form.type === 'SELL') && (
              <div className="form-group">
                <label htmlFor="tx-fee">Fee ($)</label>
                <input 
                  id="tx-fee"
                  type="number" 
                  name="fee" 
                  step="any"
                  placeholder="Commission" 
                  value={form.fee} 
                  onChange={handleChange} 
                  className="input-field"
                />
              </div>
            )}

            {/* Total Amount (input for deposits/withdrawals/dividends, read-only for trades) */}
            <div className="form-group">
              <label htmlFor="tx-amount">
                {form.type === 'BUY' || form.type === 'SELL' ? 'Estimated Total ($)' : 'Amount ($)'}
              </label>
              <input 
                id="tx-amount"
                type="number" 
                name="amount" 
                step="any"
                placeholder="Total cash amount" 
                value={form.amount} 
                onChange={handleChange} 
                className="input-field"
                readOnly={form.type === 'BUY' || form.type === 'SELL'}
                style={form.type === 'BUY' || form.type === 'SELL' ? { backgroundColor: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' } : {}}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1', minWidth: '240px' }}>
              <label htmlFor="tx-memo">Memo / Notes</label>
              <input 
                id="tx-memo"
                type="text" 
                name="memo" 
                placeholder="Broker name, reason for trade, etc." 
                value={form.memo} 
                onChange={handleChange} 
                className="input-field"
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: '45px' }}>
              <Plus size={16} /> Save Transaction
            </button>
          </div>
        </form>
      </div>

      {/* Transactions Table Log */}
      <div className="glass-card">
        <h3 className="card-title">Transaction History ({transactions.length})</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Symbol</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Fee</th>
                <th>Net Amount</th>
                <th>Memo</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...transactions].sort((a, b) => b.date.localeCompare(a.date)).map((tx) => {
                let badgeClass = 'badge-success';
                if (tx.type === 'SELL') badgeClass = 'badge-warning';
                if (tx.type === 'WITHDRAW') badgeClass = 'badge-error';
                if (tx.type === 'DIVIDEND') badgeClass = 'badge-success';
                if (tx.type === 'DEPOSIT') badgeClass = 'badge-success';

                return (
                  <tr key={tx.id}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                        <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                        {tx.date}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{tx.type}</span>
                    </td>
                    <td style={{ fontWeight: '700', color: tx.symbol !== '-' ? 'var(--color-accent)' : 'var(--text-muted)' }}>
                      {tx.symbol}
                    </td>
                    <td>{tx.shares > 0 ? tx.shares.toLocaleString() : '-'}</td>
                    <td>{tx.price > 0 ? formatCur(tx.price) : '-'}</td>
                    <td>{tx.fee > 0 ? formatCur(tx.fee) : '-'}</td>
                    <td style={{ fontWeight: '600' }}>
                      {formatCur(tx.amount)}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileText size={12} style={{ color: 'var(--text-muted)' }} />
                        {tx.memo || '-'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        onClick={() => onDeleteTransaction(tx.id)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', borderRadius: '6px', color: 'var(--color-error)' }}
                        title="Delete transaction"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
