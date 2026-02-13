import { useState, useEffect } from 'react'
import type React from 'react'
import type { ApiKeyStatusResponse, CaptureScreenshotResponse } from '@shared/ipc-types'
import './App.css'

function App(): React.ReactElement {
  // Settings state
  const [apiKey, setApiKey] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatusResponse>({ hasKey: false })

  // Screenshot state
  const [screenshotResult, setScreenshotResult] = useState<string>('')
  const [screenshotPath, setScreenshotPath] = useState<string>('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('')
  const [screenshotLoading, setScreenshotLoading] = useState(false)

  // Chat state
  const [message, setMessage] = useState('')
  const [includeScreenshot, setIncludeScreenshot] = useState(false)
  const [chatResponse, setChatResponse] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [chatMetadata, setChatMetadata] = useState('')

  // Check API key status on mount
  useEffect(() => {
    window.electronAPI.getApiKeyStatus().then(status => {
      setApiKeyStatus(status)
    })
  }, [])

  // Handle screenshot capture
  const handleCaptureScreenshot = async (): Promise<void> => {
    setScreenshotLoading(true)
    setScreenshotResult('')
    setScreenshotPath('')
    setScreenshotDataUrl('')
    try {
      const result: CaptureScreenshotResponse = await window.electronAPI.captureScreenshot({})
      if (result.success && result.filePath && result.metadata && result.id) {
        setScreenshotResult(`✅ Screenshot captured!\n\nFile: ${result.filePath}\nDimensions: ${result.metadata.width}x${result.metadata.height}\nSize: ${(result.metadata.size / 1024).toFixed(2)} KB`)
        setScreenshotPath(result.filePath)

        // Fetch data URL for preview
        const dataUrl = await window.electronAPI.getScreenshotDataUrl(result.id)
        setScreenshotDataUrl(dataUrl)
      } else {
        setScreenshotResult(`❌ Error: ${result.error}`)
      }
    } catch (error) {
      setScreenshotResult(`❌ Error: ${error}`)
    } finally {
      setScreenshotLoading(false)
    }
  }

  // Handle API key save
  const handleSaveApiKey = async (): Promise<void> => {
    try {
      await window.electronAPI.setApiKey(apiKey)
      const status = await window.electronAPI.getApiKeyStatus()
      setApiKeyStatus(status)
      alert('API key saved!')
    } catch (error) {
      alert(`Error saving API key: ${error}`)
    }
  }

  // Handle send message
  const handleSendMessage = async (): Promise<void> => {
    if (!message.trim()) {
      alert('Please enter a message')
      return
    }

    if (!apiKeyStatus.hasKey) {
      alert('Please set your Claude API key first')
      return
    }

    setChatLoading(true)
    setChatResponse('')
    setStreamingContent('')
    setChatMetadata('')

    try {
      // Register streaming listeners
      const removeChunkListener = window.electronAPI.onMessageChunk((chunk) => {
        setStreamingContent(prev => prev + chunk.chunk)
      })

      const removeCompleteListener = window.electronAPI.onMessageComplete((complete) => {
        setChatResponse(`✅ Message complete!\n\nFull content:\n${complete.fullContent}`)
        setChatMetadata(`Tokens: ${complete.tokens} | Cached: ${complete.cached ? 'Yes ✅' : 'No'}`)
        setChatLoading(false)
      })

      const removeErrorListener = window.electronAPI.onMessageError((error) => {
        setChatResponse(`❌ Error: ${error.error}${error.code ? ` (${error.code})` : ''}`)
        setChatLoading(false)
      })

      // Send message
      await window.electronAPI.sendMessage({
        message: message,
        includeScreenshot: includeScreenshot,
        screenshotPath: includeScreenshot ? screenshotPath : undefined
      })

      // Cleanup listeners after a delay (they'll be cleaned up when component unmounts too)
      setTimeout(() => {
        removeChunkListener()
        removeCompleteListener()
        removeErrorListener()
      }, 30000) // 30 seconds timeout
    } catch (error) {
      setChatResponse(`❌ Error: ${error}`)
      setChatLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui', maxWidth: '800px' }}>
      <h1>🧪 STRAT Monitor - Test Interface</h1>
      <p style={{ color: '#666' }}>Temporary test UI for Epic 4 & 5 validation</p>

      {/* Settings Section */}
      <section style={{ marginTop: '30px', padding: '20px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h2>⚙️ Settings (Task 4.5)</h2>
        <p>API Key Status: <strong style={{ color: apiKeyStatus.hasKey ? 'green' : 'orange' }}>
          {apiKeyStatus.hasKey ? '✅ Set' : '❌ Not Set'}
          {apiKeyStatus.isValid !== undefined && ` (${apiKeyStatus.isValid ? 'Valid' : 'Invalid'})`}
        </strong></p>
        <div style={{ marginTop: '10px' }}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter Claude API key (sk-ant-...)"
            style={{ width: '400px', padding: '8px', marginRight: '10px' }}
          />
          <button onClick={handleSaveApiKey} style={{ padding: '8px 16px' }}>
            Save API Key
          </button>
        </div>
      </section>

      {/* Screenshot Section */}
      <section style={{ marginTop: '30px', padding: '20px', background: '#e8f4f8', borderRadius: '8px' }}>
        <h2>📸 Screenshot Capture (Task 5.5)</h2>
        <p>Test capturing the TradingView pane</p>
        <button
          onClick={handleCaptureScreenshot}
          disabled={screenshotLoading}
          style={{ padding: '12px 24px', fontSize: '16px', cursor: screenshotLoading ? 'wait' : 'pointer' }}
        >
          {screenshotLoading ? 'Capturing...' : '📸 Capture Screenshot'}
        </button>
        {screenshotResult && (
          <pre style={{ marginTop: '15px', padding: '10px', background: 'white', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
            {screenshotResult}
          </pre>
        )}
        {screenshotDataUrl && (
          <div style={{ marginTop: '15px' }}>
            <p><strong>Preview:</strong></p>
            <img src={screenshotDataUrl} alt="Screenshot preview" style={{ maxWidth: '100%', border: '2px solid #ccc', borderRadius: '4px' }} />
          </div>
        )}
      </section>

      {/* Claude API Section */}
      <section style={{ marginTop: '30px', padding: '20px', background: '#f0e8ff', borderRadius: '8px' }}>
        <h2>🤖 Claude API Integration (Task 4.7)</h2>
        <p>Test streaming chat with Claude</p>

        <div style={{ marginTop: '10px' }}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your message (e.g., 'What is The Strat methodology?')"
            style={{ width: '100%', height: '80px', padding: '8px', fontSize: '14px' }}
          />
        </div>

        <div style={{ marginTop: '10px' }}>
          <label>
            <input
              type="checkbox"
              checked={includeScreenshot}
              onChange={(e) => setIncludeScreenshot(e.target.checked)}
              disabled={!screenshotPath}
            />
            {' '}Include screenshot (capture one first)
          </label>
        </div>

        <button
          onClick={handleSendMessage}
          disabled={chatLoading}
          style={{ marginTop: '10px', padding: '12px 24px', fontSize: '16px', cursor: chatLoading ? 'wait' : 'pointer' }}
        >
          {chatLoading ? 'Sending...' : '💬 Send Message'}
        </button>

        {chatLoading && streamingContent && (
          <div style={{ marginTop: '15px', padding: '10px', background: 'white', borderRadius: '4px' }}>
            <strong>🔄 Streaming response:</strong>
            <div style={{ marginTop: '5px', color: '#0066cc', whiteSpace: 'pre-wrap' }}>
              {streamingContent}
              <span style={{ animation: 'blink 1s infinite' }}>▌</span>
            </div>
          </div>
        )}

        {chatResponse && (
          <div>
            <pre style={{ marginTop: '15px', padding: '10px', background: 'white', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
              {chatResponse}
            </pre>
            {chatMetadata && (
              <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>{chatMetadata}</p>
            )}
          </div>
        )}
      </section>

      <footer style={{ marginTop: '40px', padding: '20px', borderTop: '2px solid #ddd', color: '#666', fontSize: '14px' }}>
        <p><strong>Testing Checklist:</strong></p>
        <ul>
          <li>✅ Set API key and verify status shows "set"</li>
          <li>✅ Capture screenshot and verify it shows TradingView pane</li>
          <li>✅ Send message without screenshot (test basic streaming)</li>
          <li>✅ Send message with screenshot (test vision API)</li>
          <li>✅ Check terminal for prompt caching headers</li>
        </ul>
      </footer>
    </div>
  )
}

export default App