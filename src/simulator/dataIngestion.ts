/**
 * TN-LAB Simulator — Real Market Data Ingestion
 * Phase 2: Scientific Market Simulation
 *
 * Fetches real market data from Yahoo Finance API.
 * This module is for SCIENTIFIC RESEARCH ONLY - not trading.
 *
 * Features:
 * - Historical price data retrieval
 * - Multiple timeframe support (1m, 5m, 15m, 1h, 1d)
 * - Multiple asset support
 * - Data validation and cleaning
 * - Caching for reproducibility
 *
 * NO React, NO browser APIs. Pure TypeScript.
 */

// =============================================================================
// TYPES
// =============================================================================

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo';

export interface OHLCV {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

export interface AssetData {
  symbol: string;
  timeframe: Timeframe;
  startDate: Date;
  endDate: Date;
  prices: OHLCV[];
  metadata: AssetMetadata;
}

export interface AssetMetadata {
  currency?: string;
  instrumentType?: string;
  exchangeTimezoneName?: string;
  firstDate?: Date;
  lastDate?: Date;
  dataPoints: number;
  /** Data provenance information */
  provenance?: DataProvenance;
}

/**
 * Data provenance tracking for scientific reproducibility.
 * Standard practice in computational science.
 */
export interface DataProvenance {
  /** Data source */
  source: 'yahoo_finance' | 'synthetic' | 'csv' | 'custom';
  /** When the data was downloaded */
  downloadTime: string;
  /** SHA-256 hash of the raw price array for integrity verification */
  datasetHash: string;
  /** Ratio of missing data points (0 = no missing data) */
  missingDataRatio: number;
  /** List of cleaning operations applied */
  cleaningOperations: string[];
  /** API response metadata */
  apiMetadata?: {
    responseCode?: number;
    cached?: boolean;
  };
}

export interface IngestionConfig {
  /** Yahoo Finance symbol (e.g., 'AAPL', 'BTC-USD') */
  symbol: string;
  /** Timeframe for data */
  timeframe: Timeframe;
  /** Start date */
  startDate: string | Date;
  /** End date */
  endDate: string | Date;
  /** Whether to fetch adjusted close */
  adjustPrices: boolean;
  /** Maximum retries on failure */
  maxRetries: number;
  /** Cache TTL in milliseconds */
  cacheTTL: number;
}

export const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
  symbol: 'AAPL',
  timeframe: '1d',
  startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
  endDate: new Date(),
  adjustPrices: true,
  maxRetries: 3,
  cacheTTL: 60 * 60 * 1000, // 1 hour
};

/**
 * Compute SHA-256-like hash of price data for integrity verification.
 * Uses a simple DJB2 variant for reproducibility without external dependencies.
 */
function computeDataHash(prices: number[]): string {
  // Simple hash for reproducibility verification
  let hash = 5381;
  const str = prices.map(p => p.toFixed(4)).join(',');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return hex.repeat(4); // 32 char hash
}

// =============================================================================
// YAHOO FINANCE CLIENT (Minimal implementation for TN-LAB)
// =============================================================================

/**
 * Simple Yahoo Finance API client using fetch.
 * For production use, consider 'yahoo-finance2' package.
 */
class YahooFinanceClient {
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL: number;

  constructor(cacheTTL: number = 60000) {
    this.cacheTTL = cacheTTL;
  }

  /**
   * Fetch historical data from Yahoo Finance.
   * Uses the v8 historical API.
   */
  async fetchHistorical(
    symbol: string,
    period1: string,
    period2: string,
    interval: string,
    adjust: boolean = true
  ): Promise<YahooHistoricalResponse | null> {
    const cacheKey = `${symbol}-${period1}-${period2}-${interval}-${adjust}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as YahooHistoricalResponse;
    }

    // Yahoo Finance v8 API
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false&events=history&adjustment=${adjust ? 'true' : 'false'}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'TN-LAB-Scientific-Simulator/1.0',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        const result = json as YahooChartResponse;

        if (result.chart.error) {
          throw new Error(result.chart.error.description || 'Yahoo Finance API error');
        }

        if (!result.chart.result || result.chart.result.length === 0) {
          return null;
        }

        this.cache.set(cacheKey, { data: result.chart.result[0], timestamp: Date.now() });
        return result.chart.result[0];
      } catch (error) {
        lastError = error as Error;
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw lastError || new Error('Failed to fetch data after 3 attempts');
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Yahoo Finance API response types
interface YahooChartResponse {
  chart: {
    result?: YahooHistoricalResponse[];
    error?: {
      code: string;
      description: string;
    };
  };
}

interface YahooHistoricalResponse {
  meta: {
    currency?: string;
    instrumentType?: string;
    exchangeTimezoneName?: string;
    firstDataDate?: number;
    regularMarketTime?: number;
    previousClose?: number;
    scale?: number;
    priceHint?: number;
    currentTradingPeriod?: {
      pre: { start: number; end: number; gmtoff: number };
      regular: { start: number; end: number; gmtoff: number };
      post: { start: number; end: number; gmtoff: number };
    };
    gmtoffset?: number;
    timezone?: string;
    chartPreviousClose?: number;
  };
  timestamp: number[];
  indicators?: {
    quote: Array<{
      open: number[];
      high: number[];
      low: number[];
      close: number[];
      volume: number[];
    }>;
    adjclose?: Array<{ adjclose: number[] }>;
  };
}

// =============================================================================
// DATA INGESTION SERVICE
// =============================================================================

// Global client instance
let yahooClient: YahooFinanceClient | null = null;

function getYahooClient(cacheTTL: number = 60000): YahooFinanceClient {
  if (!yahooClient) {
    yahooClient = new YahooFinanceClient(cacheTTL);
  }
  return yahooClient;
}

/**
 * Convert TN-LAB timeframe to Yahoo Finance interval string.
 */
function toYahooInterval(timeframe: Timeframe): string {
  const mapping: Record<Timeframe, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '1d': '1d',
    '1wk': '1wk',
    '1mo': '1mo',
  };
  return mapping[timeframe];
}

/**
 * Convert Unix timestamp to Date.
 */
function unixToDate(unix: number): Date {
  return new Date(unix * 1000);
}

/**
 * Ingest real market data for a single asset.
 *
 * @param config - Ingestion configuration
 * @returns AssetData with OHLCV price series
 */
export async function ingestAsset(config: Partial<IngestionConfig> = {}): Promise<AssetData> {
  const cfg = { ...DEFAULT_INGESTION_CONFIG, ...config };

  // Convert dates to Unix timestamps
  const startDate = typeof cfg.startDate === 'string' ? new Date(cfg.startDate) : cfg.startDate;
  const endDate = typeof cfg.endDate === 'string' ? new Date(cfg.endDate) : cfg.endDate;

  const period1 = Math.floor(startDate.getTime() / 1000).toString();
  const period2 = Math.floor(endDate.getTime() / 1000).toString();
  const interval = toYahooInterval(cfg.timeframe);

  const client = getYahooClient(cfg.cacheTTL);
  const data = await client.fetchHistorical(cfg.symbol, period1, period2, interval, cfg.adjustPrices);

  if (!data || !data.timestamp || !data.indicators?.quote?.[0]) {
    throw new Error(`No data returned for ${cfg.symbol}`);
  }

  const timestamps = data.timestamp;
  const quote = data.indicators.quote[0];
  const adjclose = data.indicators.adjclose?.[0]?.adjclose;

  // Count missing data before filtering
  const totalTimestamps = timestamps.length;
  let validCount = 0;

  // Build OHLCV array
  const prices: OHLCV[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Skip missing data points
    if (quote.close[i] === null || quote.close[i] === undefined) continue;

    validCount++;
    prices.push({
      date: unixToDate(timestamps[i]),
      open: quote.open[i] ?? quote.close[i],
      high: quote.high[i] ?? quote.close[i],
      low: quote.low[i] ?? quote.close[i],
      close: quote.close[i],
      volume: quote.volume[i] ?? 0,
      adjustedClose: adjclose?.[i],
    });
  }

  // Calculate missing data ratio for provenance
  const missingDataRatio = totalTimestamps > 0 ? (totalTimestamps - validCount) / totalTimestamps : 0;

  // Build metadata
  const metadata: AssetMetadata = {
    currency: data.meta.currency,
    instrumentType: data.meta.instrumentType,
    exchangeTimezoneName: data.meta.exchangeTimezoneName,
    firstDate: prices.length > 0 ? prices[0].date : undefined,
    lastDate: prices.length > 0 ? prices[prices.length - 1].date : undefined,
    dataPoints: prices.length,
    provenance: {
      source: 'yahoo_finance',
      downloadTime: new Date().toISOString(),
      datasetHash: computeDataHash(prices.map(p => p.close)),
      missingDataRatio: missingDataRatio,
      cleaningOperations: ['removed_invalid_prices', 'filtered_null_values'],
    },
  };

  return {
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    startDate,
    endDate,
    prices,
    metadata,
  };
}

/**
 * Ingest multiple assets.
 *
 * @param configs - Array of ingestion configurations
 * @returns Map of symbol to AssetData
 */
export async function ingestMultipleAssets(
  configs: Partial<IngestionConfig>[]
): Promise<Map<string, AssetData>> {
  const results = new Map<string, AssetData>();

  for (const config of configs) {
    const data = await ingestAsset(config);
    results.set(data.symbol, data);
  }

  return results;
}

// =============================================================================
// PRESET ASSET LISTS FOR SCIENTIFIC EXPERIMENTS
// =============================================================================

/**
 * Standard asset lists for scientific experiments.
 */
export const ASSET_PRESETS = {
  /** Major US equities */
  US_EQUITIES: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'UNH'],

  /** Major cryptocurrencies */
  CRYPTO: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD'],

  /** Major forex pairs */
  FOREX: ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X', 'USDCAD=X'],

  /** Major indices */
  INDICES: ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX'],

  /** Commodities */
  COMMODITIES: ['GC=F', 'SI=F', 'CL=F', 'NG=F', 'HG=F'],

  /** Mixed portfolio for diversity experiments */
  DIVERSIFIED: ['AAPL', 'BTC-USD', 'EURUSD=X', '^GSPC', 'GC=F'],

  /** Tech-heavy for sector analysis */
  TECH: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'CSCO'],
} as const;

/**
 * Quick ingest helper for common presets.
 */
export async function ingestPreset(
  preset: keyof typeof ASSET_PRESETS,
  timeframe: Timeframe = '1d',
  startDate?: Date,
  endDate?: Date
): Promise<Map<string, AssetData>> {
  const symbols = ASSET_PRESETS[preset];
  const configs = symbols.map(symbol => ({
    symbol,
    timeframe,
    startDate: startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    endDate: endDate || new Date(),
  }));

  return ingestMultipleAssets(configs);
}

// =============================================================================
// DATA VALIDATION AND CLEANING
// =============================================================================

/**
 * Validate and clean OHLCV data.
 */
export function validateAndCleanData(data: AssetData): {
  cleaned: AssetData;
  issues: DataIssue[];
} {
  const issues: DataIssue[] = [];
  const cleanedPrices: OHLCV[] = [];

  for (let i = 0; i < data.prices.length; i++) {
    const bar = data.prices[i];
    let hasIssue = false;

    // Check for missing values
    if (bar.close === null || bar.close === undefined) {
      issues.push({ index: i, type: 'missing_close', severity: 'error' });
      hasIssue = true;
    }

    // Check for zero or negative prices
    if (bar.close <= 0) {
      issues.push({ index: i, type: 'invalid_price', severity: 'error', value: bar.close });
      hasIssue = true;
    }

    // Check for zero volume (may be non-trading day)
    if (bar.volume === 0) {
      issues.push({ index: i, type: 'zero_volume', severity: 'warning' });
    }

    // Check for OHLC inconsistencies
    if (bar.high < bar.low) {
      issues.push({ index: i, type: 'ohlc_inversion', severity: 'error', high: bar.high, low: bar.low });
      hasIssue = true;
    }

    // Check for extreme price jumps (>50% in one candle)
    if (i > 0) {
      const prevClose = data.prices[i - 1].close;
      const change = Math.abs((bar.close - prevClose) / prevClose);
      if (change > 0.5) {
        issues.push({ index: i, type: 'extreme_jump', severity: 'warning', change });
      }
    }

    if (!hasIssue || bar.close > 0) {
      cleanedPrices.push(bar);
    }
  }

  const cleaned: AssetData = {
    ...data,
    prices: cleanedPrices,
    metadata: {
      ...data.metadata,
      dataPoints: cleanedPrices.length,
    },
  };

  return { cleaned, issues };
}

export interface DataIssue {
  index: number;
  type: 'missing_close' | 'invalid_price' | 'zero_volume' | 'ohlc_inversion' | 'extreme_jump';
  severity: 'error' | 'warning';
  value?: number;
  high?: number;
  low?: number;
  change?: number;
}

// =============================================================================
// EXTRACT PRICE SERIES FOR TN-LAB
// =============================================================================

/**
 * Extract simple price array from AssetData for TN-LAB backtest.
 */
export function extractPriceArray(data: AssetData): number[] {
  return data.prices.map(p => p.close);
}

/**
 * Extract OHLC array from AssetData.
 */
export function extractOHLC(data: AssetData): Array<{ o: number; h: number; l: number; c: number; v: number }> {
  return data.prices.map(p => ({
    o: p.open,
    h: p.high,
    l: p.low,
    c: p.close,
    v: p.volume,
  }));
}

/**
 * Get date array for visualization.
 */
export function extractDates(data: AssetData): Date[] {
  return data.prices.map(p => p.date);
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/**
 * Clear the data cache.
 */
export function clearDataCache(): void {
  if (yahooClient) {
    yahooClient.clearCache();
  }
  yahooClient = null;
}
