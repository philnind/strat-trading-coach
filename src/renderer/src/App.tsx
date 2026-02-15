/**
 * Main Application Component
 * The Strat Coach - AI Trading Coach
 *
 * Now using assistant-ui for chat interface
 */

import type React from 'react';
import { TitleBar } from './components/TitleBar';
import { StratRuntimeProvider } from './components/StratRuntimeProvider';
import { GrokThread } from './components/GrokThread';
import { useTheme } from './hooks/use-theme';
import './App.css';

function App(): React.ReactElement {
  // Initialize theme detection
  useTheme();

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-[#141414] font-display">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Content - Chat with assistant-ui */}
      <div className="flex flex-1 overflow-hidden">
        <StratRuntimeProvider>
          <GrokThread />
        </StratRuntimeProvider>
      </div>
    </div>
  );
}

export default App;
