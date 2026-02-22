/**
 * Main Application Component
 * The Strat Coach - AI Trading Coach
 */

import { useState } from 'react';
import type React from 'react';
import { TitleBar } from './components/TitleBar';
import { StratRuntimeProvider } from './components/StratRuntimeProvider';
import { GrokThread } from './components/GrokThread';
import { ScreenerPanel } from './components/ScreenerPanel';
import { AuthGate } from './components/AuthGate';
import { useTheme } from './hooks/use-theme';
import './App.css';

type AppTab = 'coach' | 'screener';

function ChatIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ScreenerIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function App(): React.ReactElement {
  useTheme();

  const [activeTab, setActiveTab] = useState<AppTab>('coach');

  return (
    <AuthGate>
      <div className="flex h-screen flex-col bg-white dark:bg-[#141414] font-display">
        <TitleBar />

        {/* Tab Bar — 50/50 full width */}
        <div className="flex border-b border-neutral-200 dark:border-[#2a2a2a]">
          <button
            onClick={() => setActiveTab('coach')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'coach'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <ChatIcon />
            Coach
          </button>
          <button
            onClick={() => setActiveTab('screener')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'screener'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <ScreenerIcon />
            Screener
          </button>
        </div>

        {/* Main Content — both panels always mounted to preserve state */}
        <div className="flex flex-1 overflow-hidden">
          <div className={`flex flex-1 overflow-hidden ${activeTab === 'coach' ? '' : 'hidden'}`}>
            <StratRuntimeProvider>
              <GrokThread />
            </StratRuntimeProvider>
          </div>
          <div className={`flex flex-1 overflow-hidden ${activeTab === 'screener' ? '' : 'hidden'}`}>
            <div className="flex-1 overflow-hidden">
              <ScreenerPanel />
            </div>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}

export default App;
