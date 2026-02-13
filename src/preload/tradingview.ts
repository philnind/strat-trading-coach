/**
 * TradingView preload script
 * Minimal preload for the TradingView WebContentsView
 *
 * This view doesn't need IPC access - it just displays TradingView's website.
 * The preload is required for security (contextIsolation) but doesn't expose any APIs.
 *
 * No APIs are exposed to TradingView view.
 * All IPC communication happens through the Chat renderer.
 */
