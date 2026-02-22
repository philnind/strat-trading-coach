/**
 * ScreenerPanel — Stock Screener UI
 *
 * Displays FTFC (Full Timeframe Continuity) scan results for a user-managed
 * watchlist stored in SQLite. Timeframes adapt to the active trading style.
 *
 * Auto-refresh schedule:
 *   Day Trade     → :05 and :35 past each hour, market hours only
 *   Swing Trade   → :05 past each hour, market hours only
 *   Position Trade → :05 at 4 PM ET (daily candle close + buffer)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type {
  ScreenerSymbolResult,
  ScreenerScanResponse,
  StratCandleType,
  StratDirection,
  StratAlignment,
  TimeframeCheck,
  ScreenerTradingStyle,
} from '../../../shared/ipc-types';

// ─────────────────────────────────────────────────────────────────────────────
// Trading style helper
// ─────────────────────────────────────────────────────────────────────────────

function getStoredStyle(): ScreenerTradingStyle {
  const saved = localStorage.getItem('strat-trading-style');
  if (saved === 'day-trade' || saved === 'swing-trade' || saved === 'position-trade') return saved;
  return 'swing-trade';
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-refresh schedule helpers
// ─────────────────────────────────────────────────────────────────────────────

function getETComponents(): { day: number; hour: number; minute: number } {
  const etDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { day: etDate.getDay(), hour: etDate.getHours(), minute: etDate.getMinutes() };
}

function msUntilNextCheckpoint(): number {
  const { minute } = getETComponents();
  const msIntoMinute = Date.now() % 60_000;
  const TARGETS = [5, 35];
  const next = TARGETS.find((t) => t > minute) ?? TARGETS[0] + 60;
  return (next - minute) * 60_000 - msIntoMinute;
}

function shouldAutoScan(style: ScreenerTradingStyle): boolean {
  const { day, hour, minute } = getETComponents();
  if (day === 0 || day === 6) return false;
  const minOfDay = hour * 60 + minute;
  const OPEN  = 9 * 60 + 30;
  const CLOSE = 16 * 60;
  const inMarket = minOfDay >= OPEN && minOfDay < CLOSE;
  if (style === 'day-trade')      return inMarket;
  if (style === 'swing-trade')    return inMarket && minute === 5;
  if (style === 'position-trade') return hour === 16 && minute === 5;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtCandleType(type: StratCandleType | null): string {
  if (type === null) return '—';
  if (type === '2-up') return '2↑';
  if (type === '2-down') return '2↓';
  return type;
}

function fmtTimeframeCell(check: TimeframeCheck): string {
  if (check.candle1 === null || check.candle2 === null) return '—';
  return `${fmtCandleType(check.candle1)} ${fmtCandleType(check.candle2)}`;
}

function fmtTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function RefreshIcon({ spinning }: { spinning: boolean }): React.ReactElement {
  return (
    <svg className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <polyline points="23 20 23 14 17 14" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}

function AlignmentBadge({ alignment }: { alignment: StratAlignment }): React.ReactElement {
  if (alignment === 'full-ftfc')
    return <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">Full FTFC</span>;
  if (alignment === 'partial')
    return <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">△ Partial</span>;
  return <span className="text-xs text-neutral-500">— None</span>;
}

function DirectionCell({ direction }: { direction: StratDirection }): React.ReactElement {
  if (direction === 'bullish') return <span className="font-medium text-emerald-400">▲ Bullish</span>;
  if (direction === 'bearish') return <span className="font-medium text-red-400">▼ Bearish</span>;
  return <span className="text-neutral-500">—</span>;
}

function TimeframeCell({ check }: { check: TimeframeCheck }): React.ReactElement {
  return (
    <span className={check.direction === 'bullish' ? 'text-emerald-400' : check.direction === 'bearish' ? 'text-red-400' : 'text-neutral-400'}>
      {fmtTimeframeCell(check)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorting & filtering
// ─────────────────────────────────────────────────────────────────────────────

const ALIGNMENT_ORDER: Record<StratAlignment, number> = { 'full-ftfc': 0, partial: 1, none: 2 };

function sortResults(results: ScreenerSymbolResult[]): ScreenerSymbolResult[] {
  return [...results].sort((a, b) => {
    const d = ALIGNMENT_ORDER[a.alignment] - ALIGNMENT_ORDER[b.alignment];
    if (d !== 0) return d;
    const o = (v: StratDirection) => (v === 'bullish' ? 0 : v === 'bearish' ? 1 : 2);
    return o(a.direction) - o(b.direction);
  });
}

type FilterTab = 'all' | 'bullish' | 'bearish' | 'full-ftfc';

function applyFilter(results: ScreenerSymbolResult[], tab: FilterTab): ScreenerSymbolResult[] {
  if (tab === 'all') return results;
  if (tab === 'full-ftfc') return results.filter((r) => r.alignment === 'full-ftfc');
  return results.filter((r) => r.direction === tab);
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist editor sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistEditorProps {
  symbols: string[];
  onAdd: (symbol: string) => Promise<void>;
  onRemove: (symbol: string) => Promise<void>;
  onClose: () => void;
}

function WatchlistEditor({ symbols, onAdd, onRemove, onClose }: WatchlistEditorProps): React.ReactElement {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = async (): Promise<void> => {
    const sym = input.trim().toUpperCase();
    if (!sym || symbols.includes(sym)) { setInput(''); return; }
    setBusy(true);
    await onAdd(sym);
    setInput('');
    setBusy(false);
  };

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') void handleAdd();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="flex flex-col gap-3 border-b border-neutral-200 dark:border-[#2a2a2a] px-4 py-3">
      {/* Add input */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          placeholder="Add ticker…"
          maxLength={10}
          className="flex-1 rounded-md border border-neutral-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] px-2.5 py-1.5 text-xs font-mono text-neutral-900 dark:text-white placeholder-neutral-400 outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600"
        />
        <button
          onClick={() => void handleAdd()}
          disabled={busy || !input.trim()}
          className="rounded-md bg-neutral-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 disabled:opacity-40 hover:opacity-80 transition-opacity"
        >
          Add
        </button>
      </div>

      {/* Chip list */}
      <div className="flex flex-wrap gap-1.5">
        {symbols.map((sym) => (
          <span
            key={sym}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 dark:border-[#2a2a2a] px-2 py-0.5 text-xs font-mono text-neutral-700 dark:text-neutral-300"
          >
            {sym}
            <button
              onClick={() => void onRemove(sym)}
              title={`Remove ${sym}`}
              className="ml-0.5 text-neutral-400 hover:text-red-400 transition-colors leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ScreenerPanel(): React.ReactElement {
  const [watchlist, setWatchlist]   = useState<string[]>([]);
  const [scanData, setScanData]     = useState<ScreenerScanResponse | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<FilterTab>('full-ftfc');
  const [showEditor, setShowEditor] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load watchlist from DB on mount
  useEffect(() => {
    void window.electronAPI.getWatchlist().then(setWatchlist);
  }, []);

  const handleAdd = useCallback(async (symbol: string): Promise<void> => {
    const updated = await window.electronAPI.addToWatchlist(symbol);
    setWatchlist(updated);
  }, []);

  const handleRemove = useCallback(async (symbol: string): Promise<void> => {
    const updated = await window.electronAPI.removeFromWatchlist(symbol);
    setWatchlist(updated);
  }, []);

  const runScan = useCallback(async (symbols?: string[]): Promise<void> => {
    const style = getStoredStyle();
    setLoading(true);
    setError(null);
    try {
      // Always fetch latest watchlist unless called with an explicit override
      const list = symbols ?? await window.electronAPI.getWatchlist();
      const result = await window.electronAPI.screenerScan({ tradingStyle: style, symbols: list });
      setScanData(result);
      setFilter('full-ftfc');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh scheduler
  useEffect(() => {
    function scheduleNext(): void {
      const delay = msUntilNextCheckpoint();
      timerRef.current = setTimeout(() => {
        if (shouldAutoScan(getStoredStyle())) void runScan();
        scheduleNext();
      }, delay);
    }
    scheduleNext();
    return () => { if (timerRef.current !== null) clearTimeout(timerRef.current); };
  }, [runScan]);

  const displayResults = scanData ? sortResults(applyFilter(scanData.results, filter)) : [];
  const tfLabels = scanData?.timeframeLabels ?? [];

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#141414] text-sm">

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-neutral-200 dark:border-[#2a2a2a] px-3 py-2">
        {(
          [
            { id: 'full-ftfc', label: 'Full FTFC' },
            { id: 'bullish',   label: 'Bullish' },
            { id: 'bearish',   label: 'Bearish' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter((prev) => prev === tab.id ? 'all' : tab.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === tab.id
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Last scan time + auto pulse */}
        {scanData && (
          <span className="flex items-center gap-1.5 text-xs text-neutral-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {fmtTime(scanData.scannedAt)}
          </span>
        )}

        {/* Watchlist edit toggle */}
        <button
          onClick={() => setShowEditor((v) => !v)}
          title="Edit watchlist"
          className={`flex items-center justify-center p-1.5 transition-colors ${
            showEditor
              ? 'text-neutral-900 dark:text-white'
              : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
          }`}
        >
          {/* List-edit icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>

        {/* Refresh */}
        <button
          onClick={() => void runScan()}
          disabled={loading}
          title="Scan watchlist"
          className="flex items-center justify-center p-1.5 text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-40"
        >
          <RefreshIcon spinning={loading} />
        </button>
      </div>

      {/* Watchlist editor (collapsible) */}
      {showEditor && (
        <WatchlistEditor
          symbols={watchlist}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onClose={() => setShowEditor(false)}
        />
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Table / empty states */}
      <div className="flex-1 overflow-auto">
        {!scanData && !loading && !error && (
          <div className="flex h-full items-center justify-center">
            <button
              onClick={() => void runScan()}
              className="flex flex-col items-center gap-3 text-neutral-500 hover:text-neutral-300 transition-colors group"
            >
              <svg className="h-8 w-8 opacity-40 group-hover:opacity-70 transition-opacity" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <polyline points="23 20 23 14 17 14" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
              <span className="text-sm font-medium">Run scan</span>
            </button>
          </div>
        )}

        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-500">
            <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm">Scanning {watchlist.length} symbols…</p>
          </div>
        )}

        {scanData && !loading && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-neutral-200 dark:border-[#2a2a2a] bg-white dark:bg-[#141414] text-neutral-500 text-left">
                <th className="px-4 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Direction</th>
                {tfLabels.map((label) => (
                  <th key={label} className="px-3 py-2 font-medium text-center">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayResults.length === 0 ? (
                <tr>
                  <td colSpan={2 + tfLabels.length} className="px-4 py-8 text-center text-neutral-500">
                    No symbols match this filter
                  </td>
                </tr>
              ) : (
                displayResults.map((row) => (
                  <tr key={row.symbol}
                    className="border-b border-neutral-100 dark:border-[#1f1f1f] hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-2.5 font-mono font-semibold text-neutral-900 dark:text-white">
                      {row.symbol}
                      {row.error && <span title={row.error} className="ml-1 cursor-help text-red-400">⚠</span>}
                    </td>
                    <td className="px-3 py-2.5"><DirectionCell direction={row.direction} /></td>
                    {row.timeframes.map((tf) => (
                      <td key={tf.label} className="px-3 py-2.5 text-center font-mono whitespace-nowrap">
                        <TimeframeCell check={tf.check} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
