# Testing Guide - Epic 4 & 5 Validation

**Date:** 2026-02-13
**Tasks:** 4.7 (Claude API Integration) & 5.5 (Screenshot Capture)

---

## Prerequisites

1. **Claude API Key**: You'll need your Claude API key (starts with `sk-ant-`)
2. **TradingView Account**: Optional, but helps to have a chart loaded

---

## Launch the App

```bash
cd /Users/phil/Projects/STRAT-trading-coach
npm run dev
```

The app should open with:
- **Left pane**: TradingView embed
- **Right pane**: Test interface with three sections

---

## Test 1: Settings & API Key Storage (Task 4.5)

### Steps:

1. **Check initial status**
   - Look at "Settings" section
   - Status should show: ❌ Not Set

2. **Save your API key**
   - Paste your Claude API key in the input field
   - Click "Save API Key"
   - You should see an alert: "API key saved!"
   - Status should update to: ✅ Set

3. **Verify persistence**
   - Quit the app (Cmd+Q)
   - Restart: `npm run dev`
   - Status should still show: ✅ Set
   - The key itself is NOT shown (secure storage working)

### ✅ Success Criteria:
- [ ] API key saves successfully
- [ ] Status updates from "Not Set" to "Set"
- [ ] Key persists after app restart
- [ ] Key is encrypted (not visible in UI)

---

## Test 2: Screenshot Capture (Task 5.5)

### Steps:

1. **Load TradingView chart**
   - In the left pane, navigate to a chart (e.g., SPY or TSLA)
   - Make sure a chart is visible

2. **Capture screenshot**
   - In the "Screenshot Capture" section, click "📸 Capture Screenshot"
   - Wait 1-2 seconds

3. **Verify results**
   - You should see:
     - ✅ Screenshot captured!
     - File path (e.g., `/Users/phil/Library/Application Support/STRAT Monitor/screenshots/screenshot-1234567890.png`)
     - Dimensions (e.g., `1568x882`)
     - File size (e.g., `234.56 KB`)
   - A preview image should appear below showing the captured chart

4. **Check image quality**
   - Verify the preview shows ONLY the TradingView pane (not the entire window)
   - Check that chart details are clear and readable
   - On Retina displays, verify high-DPI rendering

5. **Check optimization**
   - Largest dimension should be ≤1568px (Claude API limit)
   - File size should be <5MB (usually 200-800KB)

6. **Check terminal output**
   - Look for log messages about screenshot capture
   - No errors should appear

### ✅ Success Criteria:
- [ ] Screenshot captures TradingView pane only
- [ ] Image dimensions are correct (max 1568px)
- [ ] File is saved to disk
- [ ] Preview displays correctly
- [ ] HiDPI/Retina support works
- [ ] File size is optimized (<5MB)

---

## Test 3: Claude API Basic Streaming (Task 4.7 - Part 1)

### Steps:

1. **Send a simple message (no screenshot)**
   - In the "Claude API Integration" section
   - Type a message: "What is The Strat methodology in trading?"
   - Leave "Include screenshot" UNCHECKED
   - Click "💬 Send Message"

2. **Watch for streaming**
   - You should see:
     - "Sending..." status
     - A "🔄 Streaming response:" section appears
     - Text appears token-by-token with a blinking cursor
     - Streaming continues until complete

3. **Check completion**
   - When done, you should see:
     - "✅ Message complete!"
     - Full content displayed
     - Metadata showing: `Tokens: XXX | Cached: No`

4. **Check terminal output**
   - Look for console logs showing:
     - `[Claude API] Sending message...`
     - Stream events with chunks
     - Token counts
     - Cache status

### ✅ Success Criteria:
- [ ] Message sends successfully
- [ ] Streaming tokens appear in real-time
- [ ] Response completes without errors
- [ ] Token count is displayed
- [ ] Cache status shows (should be "No" on first message)

---

## Test 4: Claude API with Screenshot (Task 4.7 - Part 2)

### Steps:

1. **Capture a screenshot first**
   - Use the screenshot section to capture the current TradingView chart
   - Verify it captured successfully

2. **Send message with screenshot**
   - Type a message: "Analyze this chart using The Strat methodology. What's the current setup?"
   - CHECK the "Include screenshot" checkbox
   - Click "💬 Send Message"

3. **Watch for vision API**
   - Streaming should work as before
   - Response should reference the chart (proving Claude received the image)
   - Claude should analyze the chart patterns

4. **Check terminal output**
   - Look for:
     - `[Claude API] Sending message with screenshot`
     - Image data being sent
     - Vision API request

### ✅ Success Criteria:
- [ ] Message sends with screenshot attached
- [ ] Claude analyzes the actual chart (not generic response)
- [ ] Streaming works with vision API
- [ ] No errors in terminal

---

## Test 5: Prompt Caching (Task 4.7 - Part 3)

### Steps:

1. **Send first message**
   - Send: "What is The Strat?"
   - Note the token count

2. **Send second message (same conversation)**
   - Send: "How do I identify a 2-2 reversal?"
   - Check metadata

3. **Look for caching**
   - Second message should show: `Cached: Yes ✅`
   - This proves prompt caching is working

4. **Check terminal output**
   - Look for cache headers in API responses
   - Should see cache hit indicators

### ✅ Success Criteria:
- [ ] First message shows "Cached: No"
- [ ] Subsequent messages show "Cached: Yes"
- [ ] Token counts reflect caching (lower for cached)

---

## Test 6: Error Handling

### Steps:

1. **Test with invalid API key**
   - Clear your API key
   - Set a fake key: "sk-ant-invalid"
   - Try sending a message
   - Should see: ❌ Error with authentication message

2. **Test without API key**
   - Don't set an API key
   - Try sending a message
   - Should see: "Please set your Claude API key first"

3. **Test rate limiting** (optional)
   - Send many messages rapidly
   - Should handle rate limit errors gracefully

### ✅ Success Criteria:
- [ ] Invalid key shows clear error
- [ ] Missing key prevents sending
- [ ] Errors are user-friendly (not raw stack traces)

---

## Common Issues & Solutions

### Screenshot shows blank/white image
- **Solution**: Make sure TradingView chart is loaded first
- **Solution**: Wait a few seconds after TradingView loads

### API key won't save
- **Solution**: Check terminal for errors
- **Solution**: Make sure key starts with `sk-ant-`

### No streaming tokens appear
- **Solution**: Check that API key is valid
- **Solution**: Check internet connection
- **Solution**: Look for errors in terminal

### App crashes on screenshot
- **Solution**: Check terminal for error messages
- **Solution**: Try restarting the app

---

## What to Report Back

For each test, let me know:

1. ✅ **Pass** - Works as expected
2. ❌ **Fail** - Doesn't work, with details:
   - What happened vs. what you expected
   - Any error messages (from UI or terminal)
   - Screenshot if helpful

### Example Report Format:

```
Test 2: Screenshot Capture
Status: ✅ Pass
Notes: Screenshot captured TradingView perfectly, 1568x882, 345KB file size, preview looks great!

Test 3: Claude API Streaming
Status: ❌ Fail
Issue: Streaming stops halfway through response
Error: "Connection timeout" in terminal
```

---

## Terminal Monitoring Tips

Keep an eye on the terminal where you ran `npm run dev`. Look for:

- `[Renderer Console]` - Messages from React app
- `[Claude API]` - Claude service logs
- `[Screenshot]` - Screenshot service logs
- `[IPC]` - Communication between main and renderer
- Any error stack traces

---

## Next Steps After Testing

Once all tests pass:
- ✅ Mark Task 4.7 complete
- ✅ Mark Task 5.5 complete
- 🚀 Move to Epic 6 - Chat UI (the real UI!)

---

**Good luck! Let me know how it goes!** 🚀
