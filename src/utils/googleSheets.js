/**
 * Google Sheets CSV Fetcher & Parser Utility
 * Extracts transactions in English/Thai layouts from sharing URLs.
 */

export async function fetchAndParseGoogleSheet(url) {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new Error('Please enter a Google Sheet URL');
  }

  // Extract Spreadsheet ID
  const match = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('Invalid URL format. Make sure it contains the Google Sheet ID (e.g., /d/xxxxxxxxxxx)');
  }
  const sheetId = match[1];

  // Extract gid (sheet tab ID)
  const gidMatch = cleanUrl.match(/gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  // The export endpoint may return a cached spreadsheet revision. The Google
  // visualization endpoint reflects the active sheet revision more reliably.
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}&cacheBust=${Date.now()}`;
  
  const response = await fetch(csvUrl, { cache: 'no-store' });
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
    throw new Error('Spreadsheet is empty or has no data rows.');
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

  // Locate columns based on standard keywords
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
      const parts = cleanStr.split(/[/.]/);
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

    // Clean Type (supports English & Thai keywords)
    let rawType = (row[typeIdx] || '').toUpperCase();
    let typeVal = '';
    if (rawType.includes('BUY') || rawType.includes('ซื้อ')) typeVal = 'BUY';
    else if (rawType.includes('SELL') || rawType.includes('ขาย')) typeVal = 'SELL';
    else if (rawType.includes('DEPOSIT') || rawType.includes('ฝาก')) typeVal = 'DEPOSIT';
    else if (rawType.includes('WITHDRAW') || rawType.includes('ถอน')) typeVal = 'WITHDRAW';
    else if (rawType.includes('DIVIDEND') || rawType.includes('ปันผล')) typeVal = 'DIVIDEND';
    
    if (!typeVal) continue; // Skip rows with invalid type

    // Clean Symbol
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
      id: `sheet-${[formattedDate, typeVal, symbolVal, sharesVal, priceVal, feeVal, amountVal, memoVal].join('|')}`,
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

  return parsedTransactions;
}
