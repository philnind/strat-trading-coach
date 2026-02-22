/**
 * Stock Screener Service
 *
 * Scans a watchlist for Full Timeframe Continuity (FTFC) signals using
 * Yahoo Finance as the data source. Supports three trading styles, each
 * with its own set of three timeframes:
 *
 *  day-trade:      1H / 4H / 1D   (4H aggregated from 1H)
 *  swing-trade:    1H / 4H / 1D   (4H aggregated from 1H)
 *  position-trade: 1D / 1W / 1M
 */

import type {
  StratCandleType,
  StratDirection,
  StratAlignment,
  TimeframeCheck,
  ScreenerTimeframeResult,
  ScreenerSymbolResult,
  ScreenerScanResponse,
  ScreenerTradingStyle,
} from '@shared/ipc-types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const WATCHLIST_TIER1 = ['AAPL', 'AMZN', 'GOOGL', 'META', 'MSFT', 'NVDA', 'TSLA', 'SPY', 'QQQ'];
const WATCHLIST_TIER2 = ['BABA', 'COIN', 'HOOD', 'NFLX', 'ROKU', 'SHOP', 'SNOW', 'UBER'];

export const DEFAULT_SYMBOLS = [...WATCHLIST_TIER1, ...WATCHLIST_TIER2];

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 600;
const FETCH_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type YahooInterval = '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo';

interface DirectSource {
  kind: 'direct';
  interval: YahooInterval;
  range: string;
}

interface AggregateSource {
  kind: 'aggregate';
  sourceInterval: YahooInterval;
  sourceRange: string;
  factor: number;
}

interface TimeframeDef {
  label: string;
  source: DirectSource | AggregateSource;
}

interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface YahooQuote {
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: { quote: YahooQuote[] };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trading style → timeframe configs
// ─────────────────────────────────────────────────────────────────────────────

const STYLE_TIMEFRAMES: Record<ScreenerTradingStyle, TimeframeDef[]> = {
  'day-trade': [
    { label: '1H', source: { kind: 'direct',    interval: '1h', range: '15d' } },
    { label: '4H', source: { kind: 'aggregate', sourceInterval: '1h', sourceRange: '15d', factor: 4 } },
    { label: '1D', source: { kind: 'direct',    interval: '1d', range: '30d' } },
  ],
  'swing-trade': [
    { label: '1H', source: { kind: 'direct',    interval: '1h',  range: '15d' } },
    { label: '4H', source: { kind: 'aggregate', sourceInterval: '1h', sourceRange: '15d', factor: 4 } },
    { label: '1D', source: { kind: 'direct',    interval: '1d',  range: '30d' } },
  ],
  'position-trade': [
    { label: '1D', source: { kind: 'direct', interval: '1d',  range: '30d' } },
    { label: '1W', source: { kind: 'direct', interval: '1wk', range: '2y'  } },
    { label: '1M', source: { kind: 'direct', interval: '1mo', range: '5y'  } },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Yahoo Finance fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchYahoo(
  symbol: string,
  interval: YahooInterval,
  range: string
): Promise<OhlcCandle[]> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance HTTP ${res.status} for ${symbol} (${interval})`);
    }

    const data = (await res.json()) as YahooChartResponse;

    if (!data.chart.result || data.chart.result.length === 0) {
      throw new Error(`No chart data returned for ${symbol} (${interval})`);
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];

    const candles: OhlcCandle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open[i];
      const high = quote.high[i];
      const low = quote.low[i];
      const close = quote.close[i];
      const volume = quote.volume[i];

      if (open == null || high == null || low == null || close == null) continue;

      candles.push({
        timestamp: timestamps[i],
        open,
        high,
        low,
        close,
        volume: volume ?? 0,
      });
    }

    return candles;
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Candle aggregation (groups source candles by `factor`)
// ─────────────────────────────────────────────────────────────────────────────

function aggregateCandles(source: OhlcCandle[], factor: number): OhlcCandle[] {
  const groups: OhlcCandle[] = [];
  for (let i = 0; i + factor - 1 < source.length; i += factor) {
    const group = source.slice(i, i + factor);
    groups.push({
      timestamp: group[0].timestamp,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candle classification — The Strat rules
// ─────────────────────────────────────────────────────────────────────────────

function classifyCandle(curr: OhlcCandle, prev: OhlcCandle): StratCandleType {
  if (curr.high > prev.high && curr.low >= prev.low) return '2-up';
  if (curr.low < prev.low && curr.high <= prev.high) return '2-down';
  if (curr.high > prev.high && curr.low < prev.low) return '3';
  return '1'; // Inside bar
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeframe check — last 2 completed candles
// ─────────────────────────────────────────────────────────────────────────────

function checkTimeframe(candles: OhlcCandle[]): TimeframeCheck {
  if (candles.length < 3) {
    return { candle1: null, candle2: null, direction: null };
  }

  const n = candles.length;
  const type1 = classifyCandle(candles[n - 2], candles[n - 3]);
  const type2 = classifyCandle(candles[n - 1], candles[n - 2]);

  let direction: StratDirection = null;
  if (type1 === '2-up' && type2 === '2-up') direction = 'bullish';
  else if (type1 === '2-down' && type2 === '2-down') direction = 'bearish';

  return { candle1: type1, candle2: type2, direction };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alignment across all timeframes
// ─────────────────────────────────────────────────────────────────────────────

function calcAlignment(checks: TimeframeCheck[]): { alignment: StratAlignment; direction: StratDirection } {
  const bullish = checks.filter((r) => r.direction === 'bullish').length;
  const bearish = checks.filter((r) => r.direction === 'bearish').length;
  const max = Math.max(bullish, bearish);

  const direction: StratDirection =
    bullish > bearish && bullish >= 2
      ? 'bullish'
      : bearish > bullish && bearish >= 2
        ? 'bearish'
        : null;

  const alignment: StratAlignment =
    max === 3 ? 'full-ftfc' : max === 2 ? 'partial' : 'none';

  return { alignment, direction };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-symbol scan (with fetch deduplication within the call)
// ─────────────────────────────────────────────────────────────────────────────

async function scanSymbol(
  symbol: string,
  defs: TimeframeDef[]
): Promise<ScreenerSymbolResult> {
  // Cache promises so duplicate sources (e.g. 1H shared between '1H' and '4H') fetch once
  const fetchCache = new Map<string, Promise<OhlcCandle[]>>();

  const getCandles = (source: DirectSource | AggregateSource): Promise<OhlcCandle[]> => {
    if (source.kind === 'direct') {
      const key = `${source.interval}:${source.range}`;
      if (!fetchCache.has(key)) {
        fetchCache.set(key, fetchYahoo(symbol, source.interval, source.range));
      }
      return fetchCache.get(key)!;
    }

    // Aggregate: get source candles then group
    const srcKey = `${source.sourceInterval}:${source.sourceRange}`;
    if (!fetchCache.has(srcKey)) {
      fetchCache.set(srcKey, fetchYahoo(symbol, source.sourceInterval, source.sourceRange));
    }
    const aggKey = `agg:${srcKey}:${source.factor}`;
    if (!fetchCache.has(aggKey)) {
      fetchCache.set(
        aggKey,
        fetchCache.get(srcKey)!.then((candles) => aggregateCandles(candles, source.factor))
      );
    }
    return fetchCache.get(aggKey)!;
  };

  try {
    // Kick off all fetches in parallel (deduped by cache)
    const allCandles = await Promise.all(defs.map((def) => getCandles(def.source)));

    const timeframes: ScreenerTimeframeResult[] = defs.map((def, i) => ({
      label: def.label,
      check: checkTimeframe(allCandles[i]),
    }));

    const { alignment, direction } = calcAlignment(timeframes.map((t) => t.check));

    return { symbol, direction, timeframes, alignment };
  } catch (error) {
    const emptyCheck = (): TimeframeCheck => ({ candle1: null, candle2: null, direction: null });
    return {
      symbol,
      direction: null,
      timeframes: defs.map((def) => ({ label: def.label, check: emptyCheck() })),
      alignment: 'none',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function scanWatchlist(
  symbols: string[] = DEFAULT_SYMBOLS,
  tradingStyle: ScreenerTradingStyle = 'swing-trade'
): Promise<ScreenerScanResponse> {
  const startTime = Date.now();
  const defs = STYLE_TIMEFRAMES[tradingStyle];
  const results: ScreenerSymbolResult[] = [];

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((sym) => scanSymbol(sym, defs)));
    results.push(...batchResults);

    if (i + BATCH_SIZE < symbols.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return {
    results,
    scannedAt: new Date().toISOString(),
    duration: Date.now() - startTime,
    tradingStyle,
    timeframeLabels: defs.map((d) => d.label),
  };
}
