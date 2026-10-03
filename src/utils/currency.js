/**
 * Currency Exchange Rate Fetcher
 * Retrieves real-time USD/THB exchange rate from open.er-api.com
 */

export async function fetchExchangeRate() {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) {
      throw new Error('Exchange rate API response not OK');
    }
    const data = await response.json();
    return data.rates?.THB || 36.50; // Return THB rate, fallback to 36.50
  } catch (error) {
    console.error('Error fetching USD/THB exchange rate:', error);
    return 36.50; // Fallback exchange rate
  }
}
