# Monetization Research Report: AI Strat Trading Coach
## Comprehensive Analysis of Commercialization Paths

*Compiled: 2026-02-13*
*Constraint: Must retain TradingView chart integration with custom Strat indicators*

---

## Table of Contents

1. [TradingView Integration Analysis](#1-tradingview-integration-analysis)
2. [Competitor Landscape](#2-competitor-landscape)
3. [Recommended Architecture](#3-recommended-architecture)
4. [Monetization Strategy](#4-monetization-strategy)
5. [Legal/Compliance Considerations](#5-legalcompliance-considerations)
6. [Action Plan](#6-action-plan)

---

## 1. TradingView Integration Analysis

### The Core Problem

TradingView has **no public REST API** for accessing chart snapshots or custom indicators. Their official APIs are limited to:
- **Broker Integration API** (for brokers to connect backend trading systems)
- **Charting Library** (JavaScript library for embedding charts on your own site -- but **cannot load Pine Script indicators**)
- **Webhooks** (alert-based HTTP POST, no chart images)

Custom Pine Script indicators like "TheStrat Teach V2" **only render on TradingView's own platform**. They cannot be exported, embedded via the Charting Library, or accessed through any official API.

### All Viable Technical Methods

#### Method A: Browser Extension (RECOMMENDED for MVP)

**How it works:** Chrome/Firefox extension runs alongside user's open TradingView tab. When user requests coaching, extension captures visible chart area (DOM screenshot or `html2canvas`), sends image to backend for Claude analysis.

**Precedent products:**
- **TTA Alert Detector** -- Chrome extension that captures TradingView chart screenshots on alert triggers, sends to Telegram/Discord
- **n8n + Chrome Extension** -- Captures TradingView screenshots, sends to webhook, processes with OpenAI vision. Full architecture: Extension -> Webhook -> AI analysis -> Response
- **IndiSnap** -- Chrome extension for capturing TradingView indicator settings

**Pros:**
- Captures EXACTLY what user sees, including all custom Pine Script indicators
- No credential storage needed (user is already logged in)
- Low development cost (Chrome extension + backend API)
- Users keep their own TradingView subscription and settings
- Relatively fast to build (weeks, not months)

**Cons:**
- User must have TradingView tab open
- Extension-only capture (cannot schedule analysis without user action)
- Chrome Web Store review process (1-3 weeks)
- TOS grey area (see Legal section)

**TOS Risk: MODERATE.** The extension captures what the user can already see on their own screen. It does not scrape data feeds, bypass authentication, or access TradingView's servers programmatically. This is analogous to a user taking a screenshot and pasting it into ChatGPT. However, automating this at commercial scale may attract TradingView's attention.

**Estimated development: 2-4 weeks**

---

#### Method B: User-Initiated Screenshot Upload (SIMPLEST, SAFEST)

**How it works:** User takes screenshot of their TradingView chart (using TradingView's built-in snapshot feature or OS screenshot), uploads to web app, Claude analyses the image.

**TradingView's built-in snapshot feature** generates shareable URLs like `https://s3.tradingview.com/snapshots/m/[id].png`. Users can share these directly. The product could accept either uploaded images or TradingView snapshot URLs.

**Pros:**
- ZERO TOS risk (user voluntarily shares their own screenshot)
- No extension needed
- Works immediately with any TradingView plan
- All custom indicators visible
- Simplest to build

**Cons:**
- Manual friction (user must screenshot, upload, wait)
- Not suitable for real-time coaching during fast markets
- Image quality varies by user's screen/method
- Multi-step UX for each analysis

**Estimated development: 1-2 weeks for MVP**

---

#### Method C: Desktop App (Electron/Tauri) with Screen Capture

**How it works:** Desktop application runs alongside TradingView. Can capture specific windows or screen regions. Integrates Claude AI directly.

**Pros:**
- More control than browser extension
- Can capture any window (TradingView desktop app or browser)
- Subscription model natural for desktop software
- Can add offline features (trade journal, review tools)
- Tauri = 2-10 MB installer vs Electron's 80-150 MB

**Cons:**
- Requires user to install software
- OS-level screen capture permissions (macOS especially restrictive)
- More complex development (4-8 weeks)
- Distribution and auto-update infrastructure needed
- TOS grey area similar to extension

**Estimated development: 6-10 weeks**

---

#### Method D: Headless Browser with User Sessions (CURRENT APPROACH)

**How it works:** Backend Playwright/Puppeteer logs into TradingView using user's session cookies, navigates to their chart layout, captures screenshot with all indicators rendered.

**This is how the current MCP server works.** Existing open-source implementations:
- `ertugrul59/tradingview-chart-mcp` -- Optimized MCP server with browser pooling
- `ali-rajabpour/tradingview-mcp` -- Playwright snapshots
- `aeron7/tradingview-screenshot` -- Selenium-based capture

**Pros:**
- Proven to work (you already use this)
- Can schedule automated analysis
- Server-side control over capture quality/timing

**Cons:**
- **HIGH TOS RISK** for commercial use -- collecting and using user credentials violates TradingView TOS
- Security liability (storing session tokens)
- 2FA breaks this approach
- Sessions expire, requiring frequent refresh
- Does not scale well (one browser instance per user)

**Verdict: NOT RECOMMENDED for commercial product.** Works for personal use but unacceptable risk for a business.

---

#### Method E: CHART-IMG API (Third-Party Service)

**How it works:** chart-img.com provides a REST API for generating TradingView chart screenshots with standard technical indicators.

**Pricing:** Free tier available; paid plans exist but pricing not publicly detailed.

**Critical limitation: Cannot render custom Pine Script indicators.** Only supports standard TradingView built-in indicators and studies. Since "TheStrat Teach V2" is a custom Pine Script, CHART-IMG **cannot capture it**.

**Verdict: NOT VIABLE for this product** (fails the core requirement of custom indicator visibility).

---

#### Method F: TradingView Charting Library Embed

**How it works:** Embed TradingView's free Charting Library in your own web app, users configure indicators, use `takeClientScreenshot()` to capture.

**Critical limitation: The Charting Library does NOT support Pine Script.** You would need to re-implement all Strat indicators in JavaScript. This defeats the purpose -- users want THEIR TradingView setup with THEIR indicators.

**Verdict: NOT VIABLE without massive re-implementation effort.**

---

#### Method G: Hybrid -- Extension + TradingView Snapshot URLs

**How it works:** Combine approaches. Primary method: browser extension for one-click capture. Fallback: user shares TradingView snapshot URL (which the backend fetches and analyses).

TradingView snapshot URLs are publicly accessible images. When a user clicks "Share" > "Copy Image Link" in TradingView, they get a URL like `https://s3.tradingview.com/snapshots/m/abc123.png`. Your backend can fetch this URL and send to Claude.

**Pros:**
- Two capture methods for flexibility
- Snapshot URLs are TOS-compliant (user explicitly shares)
- Extension provides convenience for power users
- Graceful fallback if extension has issues

**Verdict: RECOMMENDED as primary architecture.**

---

### Integration Method Summary

| Method | Custom Indicators | TOS Risk | UX Quality | Dev Time | Scaling |
|--------|-------------------|----------|------------|----------|---------|
| **Browser Extension** | YES | Moderate | Good | 2-4 wks | Good |
| **Screenshot Upload** | YES | None | Fair | 1-2 wks | Excellent |
| **Desktop App** | YES | Moderate | Very Good | 6-10 wks | Good |
| **Headless Browser** | YES | **HIGH** | N/A | Done | Poor |
| **CHART-IMG API** | **NO** | None | N/A | 1 wk | Excellent |
| **Charting Library** | **NO** | None | N/A | 12+ wks | Excellent |
| **Hybrid Ext+Snapshot** | YES | Low-Mod | Very Good | 3-5 wks | Good |

---

## 2. Competitor Landscape

### Direct Competitors (Strat-Specific)

#### StratAlerts.ai
- **What:** Strat pattern scanner (not coaching)
- **Pricing:** Lite $67/mo, Standard $250/mo, Pro (upcoming, includes AI)
- **Chart integration:** Own scanner UI, no TradingView chart analysis
- **Gap:** No AI coaching, no personalised feedback, no chart visual analysis
- **Takeaway:** Validates market willingness to pay $67-250/mo for Strat tools

#### Rob Smith / Ticker Tocker
- **What:** Live trading room, course ($599 one-time)
- **Pricing:** ~$150-300/mo estimated for live room (annual subscription includes course)
- **Gap:** Human-only coaching (not scalable), no AI, no asynchronous analysis
- **Takeaway:** Price anchor for Strat education -- people pay $599+ for course alone

#### TheStrat-Indicators.com
- **What:** Scans, multi-timeframe charts, trade plans
- **Pricing:** Not publicly listed
- **Gap:** No AI coaching or personalised feedback

### Adjacent Competitors (Trading Journals + AI)

#### Tradezella ($29-49/mo)
- **TradingView integration:** CSV import only. No chart capture.
- **Chart method:** Manual drawing import via Object Tree feature
- **Gap:** No AI analysis of charts, no coaching

#### TradesViz
- **TradingView integration:** No direct chart capture. Import trades via broker CSV.
- **Gap:** No AI coaching, no chart analysis

#### TrendSpider ($52-83/mo)
- **What:** AI-powered automated chart pattern recognition
- **Own charting platform** (not TradingView dependent)
- **Gap:** Not Strat-specific, no coaching methodology

### AI Trading Analysis Tools

#### n8n + Chrome Extension + OpenAI
- **Open-source workflow** for TradingView chart AI analysis
- **Architecture:** Chrome extension captures chart -> webhook -> OpenAI vision analysis
- **Not a product** -- a workflow template
- **Takeaway:** Proves the extension+AI architecture works

#### Various GPT Trading Bots
- No products found with TradingView custom indicator integration
- Most use data APIs, not chart vision
- No Strat-specific AI coaching products exist

### Market Gap Analysis

**No product currently combines:**
1. TradingView chart visual analysis (with custom indicators)
2. AI-powered coaching (not just signals)
3. The Strat methodology specifically
4. Personalised feedback and learning progression

**This is a genuine white space.** The closest analogues are either Strat scanners (no AI), trading journals (no coaching), or generic AI tools (no Strat expertise).

### Pricing Benchmarks

| Product | Price | What You Get |
|---------|-------|--------------|
| StratAlerts.ai Lite | $67/mo | Strat scanner only |
| StratAlerts.ai Standard | $250/mo | Advanced scanner + customisation |
| Tradezella Premium | $49/mo | Trade journal + analytics |
| TrendSpider | $52-83/mo | Automated charting (own platform) |
| Rob Smith Course | $599 one-time | Video course |
| Rob Smith Live Room | ~$200/mo est. | Live trading room access |
| Generic AI coaching SaaS | $50-140/mo | AI sales/business coaching |

**Sweet spot for this product: $49-99/mo** (more than a journal, less than a scanner + room).

---

## 3. Recommended Architecture

### Top 3 Approaches (Ranked)

#### RANK 1: Browser Extension + Web App (Hybrid)

**Architecture:**
```
User's Browser (TradingView open)
    |
    v
Chrome Extension (captures chart on demand)
    |
    v
Backend API (Node.js/Python)
    |
    +--> Image Storage (S3/Cloudflare R2)
    |
    +--> Claude API (Sonnet 4.5 for analysis)
    |
    v
Web App Dashboard (coaching UI, trade journal, learning progress)
```

**Fallback path:** User pastes TradingView snapshot URL or uploads screenshot manually.

**Why #1:**
- Preserves custom indicator visibility (the non-negotiable)
- Proven architecture (n8n template, TTA Alert Detector)
- Moderate development effort
- Natural subscription model
- Extension is the differentiator; web app provides ongoing value

**Implementation complexity:** Medium
**Development time:** 4-6 weeks for MVP
**Monthly infrastructure cost:** ~$50-100/mo (hosting + storage)

---

#### RANK 2: Desktop App (Tauri) + Cloud Backend

**Architecture:**
```
Tauri Desktop App
    |
    +--> Screen capture (OS APIs)
    +--> Local trade journal
    +--> Settings/preferences
    |
    v
Cloud Backend API
    |
    +--> Claude API (analysis)
    +--> User data sync
    |
    v
Optional Web Dashboard (history, analytics)
```

**Why #2:**
- Premium feel (desktop app = perceived higher value)
- More control over UX and capture quality
- Can work alongside TradingView desktop app or browser
- Tauri = small installer (2-10 MB), fast startup
- Natural for subscription pricing

**Implementation complexity:** High
**Development time:** 8-12 weeks for MVP
**Monthly infrastructure cost:** ~$50-100/mo

---

#### RANK 3: Pure Web App + Manual Upload (Fastest to Market)

**Architecture:**
```
Web App
    |
    +--> Upload interface (drag-drop screenshot or paste URL)
    +--> Claude API analysis
    +--> Coaching conversation UI
    +--> Trade journal
    +--> Learning progress tracking
```

**Why #3:**
- Fastest to build and validate market
- Zero TOS risk
- Can launch in 1-2 weeks
- Test pricing and demand before building extension
- Upgrade path: add extension later

**Implementation complexity:** Low
**Development time:** 1-3 weeks for MVP
**Monthly infrastructure cost:** ~$30-50/mo

---

### Recommended Implementation Sequence

**Phase 1 (Weeks 1-3): Web App MVP**
- Upload-based chart analysis
- Strat coaching AI (Claude with system prompt from your guardrails doc)
- Simple trade journal
- Validate demand with 10-20 beta users
- Price: Free beta or $29/mo early access

**Phase 2 (Weeks 4-8): Browser Extension**
- One-click chart capture from TradingView
- Seamless integration with web app
- Multi-timeframe capture (user clicks through D/4H/1H, extension captures each)
- Price: $49-79/mo (extension users get premium features)

**Phase 3 (Weeks 9-16): Advanced Features**
- Learning progression tracking
- Trade pattern analysis (win/loss by setup type)
- Session replay (review past coaching sessions)
- Community features (anonymised setup sharing)
- Optional: Desktop app for power users
- Price: $99/mo for full platform

---

## 4. Monetization Strategy

### Recommended Pricing Model: Tiered SaaS Subscription

#### Tier 1: "Student" -- $29/mo (or $249/yr)
- 30 chart analyses per month
- Upload/URL-based chart input
- Basic Strat coaching AI
- Trade journal (manual entry)
- Learning progress dashboard

#### Tier 2: "Trader" -- $69/mo (or $599/yr)
- Unlimited chart analyses
- Browser extension (one-click capture)
- Advanced coaching (multi-timeframe analysis, setup grading)
- Trade journal with auto-linking to analyses
- Performance analytics (win rate by setup, by timeframe)
- Priority AI response time

#### Tier 3: "Pro" -- $129/mo (or $999/yr)
- Everything in Trader
- Custom coaching focus areas
- Session replay and review
- Export reports (PDF trade reviews)
- API access for custom integrations
- Priority support

### Unit Economics

**Cost per analysis session (assuming Claude Sonnet 4.5):**

| Component | Tokens/Cost |
|-----------|-------------|
| Chart image input | ~2,750 tokens |
| System prompt (Strat rules) | ~4,000 tokens |
| User context (trade history) | ~2,000 tokens |
| AI response | ~1,500 tokens |
| **Total input tokens** | **~8,750** |
| **Total output tokens** | **~1,500** |
| **Cost per session** | **~$0.049** |
| | ($8,750 * $3/1M + $1,500 * $15/1M) |

With prompt caching (system prompt + Strat rules cached):
- Cached read: ~4,000 tokens * $0.30/1M = $0.0012
- Fresh input: ~4,750 tokens * $3/1M = $0.014
- Output: ~1,500 tokens * $15/1M = $0.023
- **Cost per session with caching: ~$0.038**

**Monthly cost scenarios:**

| Tier | Analyses/mo | AI Cost | Infra | Total Cost | Revenue | Margin |
|------|-------------|---------|-------|------------|---------|--------|
| Student (30) | 30 | $1.14 | $2 | $3.14 | $29 | 89% |
| Trader (100 avg) | 100 | $3.80 | $3 | $6.80 | $69 | 90% |
| Pro (200 avg) | 200 | $7.60 | $5 | $12.60 | $129 | 90% |

**Gross margins are excellent (89-90%)** because Claude API costs for chart analysis are very low (~$0.04/session).

### Revenue Projections (Conservative)

**Year 1 targets:**

| Month | Users | MRR | Notes |
|-------|-------|-----|-------|
| 1-3 | 10-20 | $300-600 | Beta, free/discounted |
| 4-6 | 50-100 | $2,500-5,000 | Post-extension launch |
| 7-9 | 100-200 | $5,000-10,000 | Content marketing kicks in |
| 10-12 | 200-400 | $10,000-20,000 | Word of mouth, community |

**Year 1 total:** $50,000-100,000 ARR (realistic for solo founder)

### Target Market Size

- TradingView has 90M+ registered users (2024)
- "The Strat" community estimated at 50,000-200,000 active practitioners
- Options traders who use The Strat: estimated 10,000-50,000
- Addressable market at $69/mo average: $8M-41M/yr TAM
- Realistic capture (1-2% of addressable): $80K-800K/yr

### Go-to-Market Approach

1. **Strat community presence** -- Post on FinTwit (#TheStrat), Forex Factory Strat thread, TradingView Strat scripts community
2. **Content marketing** -- YouTube videos showing AI coaching a Strat trade in real-time
3. **Rob Smith ecosystem** -- Offer to Ticker Tocker community (not competing, complementing)
4. **Trading education influencers** -- Affiliate/partnership deals
5. **Product Hunt / Indie Hackers** -- Launch for initial visibility
6. **SEO** -- "The Strat trading AI", "Strat coaching tool", "TradingView AI analysis"

---

## 5. Legal/Compliance Considerations

### Classification: Educational Tool, NOT Financial Advice

**The product must be positioned as an educational tool that helps users learn The Strat methodology, NOT a trading signal service or financial advisor.**

Key distinctions:
- **Educational:** "Here's how this chart shows a 2-1-2 continuation pattern with FTFC alignment"
- **Financial advice:** "Buy AAPL $230 calls expiring Feb 21"
- **Your product does the former.** It teaches pattern recognition, validates user analysis, and explains Strat concepts. It does not recommend specific trades.

### UK (FCA) Requirements

**Current status (pre-April 2026):**
- Educational trading tools providing general information are NOT regulated as financial advice
- No FCA authorisation required for educational content
- Must not provide "personal recommendations" tailored to individual investment circumstances

**Post-April 2026 changes:**
- New "targeted support" category becomes a regulated activity
- This covers tools that provide suggestions to help consumers make investment decisions
- Your product MAY fall under this if it provides specific setup recommendations
- **Action required:** Monitor FCA PS25/22 and consult a fintech solicitor before April 2026

**Mitigations:**
- Frame all output as educational ("this pattern is called X, historically it works Y% of the time")
- Never recommend specific trades, strike prices, or position sizes in AI output
- Include prominent disclaimers
- Consider FCA Pre-Application Support Service (PASS) for clarity

### US (SEC/CFTC) Requirements

**For stock options education:**
- No SEC/CFTC registration required for educational software
- Must NOT provide personalised investment recommendations
- CFTC Rule 4.41 disclaimer required if showing any simulated/hypothetical performance
- A "not financial advice" disclaimer helps but does NOT guarantee legal protection

**Key case law:** *Taucher v. Born* -- CFTC's attempt to regulate financial software/information was struck down on First Amendment grounds for non-personalised tools.

**Mitigations:**
- Include standard financial disclaimer on every page/response
- No backtested or simulated performance claims
- No guarantees of profitability
- Recommend users consult a licensed financial advisor

### EU (MiFID II) Requirements

**Educational tools are generally exempt if:**
- Output is general/educational, not personalised recommendations
- No execution of trades
- No suitability assessments performed
- Content is "openly available" (not gated behind investment requirements)

### TradingView Terms of Service

**Key TOS provisions:**
- Prohibits sublicensing, selling, or providing third-party access to TradingView systems
- Prohibits automated scraping of chart data
- Prohibits commercial exploitation of TradingView materials

**Risk assessment by integration method:**

| Method | TOS Risk | Reasoning |
|--------|----------|-----------|
| Screenshot upload | **NONE** | User voluntarily shares their own screenshot |
| Snapshot URL sharing | **LOW** | User shares public URL (intended feature) |
| Browser extension | **MODERATE** | Automates what user can do manually; grey area |
| Session credential capture | **HIGH** | Clearly violates automated access provisions |
| CHART-IMG / third-party API | **LOW** | Third party's risk, not yours |

**Recommended approach:** Start with upload/URL (zero risk), add extension (moderate risk) once you have legal review.

**CYA measures:**
- Extension only captures on explicit user action (click button)
- Never store TradingView credentials
- Never access TradingView servers directly
- Include TradingView attribution in product
- Consider reaching out to TradingView about partnership once at scale

### Required Disclaimers

Every page and AI response should include (or link to):

```
DISCLAIMER: [Product Name] is an educational tool designed to help
traders learn The Strat methodology. It does not constitute financial
advice, investment advice, or trading recommendations. All analysis
is for educational purposes only. Trading stocks and options involves
substantial risk of loss. Past performance does not guarantee future
results. Consult a qualified financial advisor before making investment
decisions. [Product Name] is not affiliated with TradingView or
Rob Smith / The Strat.
```

### Browser Extension Distribution

**Chrome Web Store:**
- No specific prohibition on trading tool extensions
- Must have single, clear purpose
- Must have privacy policy and data handling disclosures
- Review process: 1-3 weeks
- No paid extension option currently (use external subscription)

**Firefox Add-ons:**
- Similar policies, generally faster review
- Good secondary distribution channel

---

## 6. Action Plan

### Phase 0: Validate Demand (Weeks 1-2)

**Goal:** Confirm people will pay for this before building anything.

- [ ] Create a landing page with product description and "Join Waitlist" button
- [ ] Post in Strat communities (FinTwit, Forex Factory, TradingView)
- [ ] Target: 50+ email signups in 2 weeks
- [ ] Conduct 5-10 user interviews with Strat traders
- [ ] Key questions: "Would you pay $49-69/mo for AI Strat coaching with chart analysis?"
- **Cost:** $0 (use free landing page tools)
- **Risk:** Minimal

### Phase 1: Web App MVP (Weeks 3-5)

**Goal:** Functional product with manual screenshot upload.

- [ ] Build web app (Next.js or similar)
- [ ] Implement Claude API integration with Strat coaching system prompt
- [ ] Upload interface (drag-drop image, paste TradingView URL)
- [ ] Basic trade journal
- [ ] User authentication (email/password or OAuth)
- [ ] Stripe subscription integration
- [ ] Deploy to production
- **Cost:** ~$100 (hosting + domain)
- **Revenue target:** 10 paying beta users at $29/mo = $290 MRR

### Phase 2: Browser Extension (Weeks 6-9)

**Goal:** One-click chart capture from TradingView.

- [ ] Build Chrome extension (Manifest V3)
- [ ] One-click capture of active TradingView chart
- [ ] Multi-timeframe capture workflow (D -> 4H -> 1H with one flow)
- [ ] Submit to Chrome Web Store
- [ ] Integrate with web app backend
- [ ] Launch Trader tier ($69/mo)
- **Cost:** ~$5 (Chrome Web Store developer fee)
- **Revenue target:** 30-50 users, $2,000-3,500 MRR

### Phase 3: Growth Features (Weeks 10-16)

**Goal:** Retention and expansion revenue.

- [ ] Learning progression system (track mastery of Strat concepts)
- [ ] Performance analytics (win rate by setup type, by timeframe)
- [ ] Session history and replay
- [ ] Trade pattern recognition (identify recurring mistakes)
- [ ] Community features (anonymised setup gallery)
- [ ] Launch Pro tier ($129/mo)
- **Revenue target:** 100+ users, $5,000-7,000 MRR

### Phase 4: Scale (Months 5-12)

**Goal:** Grow to $10K+ MRR.

- [ ] Content marketing (YouTube, blog, social)
- [ ] Affiliate programme for trading educators
- [ ] Consider white-label for other trading methodologies
- [ ] Optional: Desktop app (Tauri) for power users
- [ ] Optional: TradingView partnership outreach
- [ ] Explore licensing to Strat educators/communities
- **Revenue target:** $10,000-20,000 MRR

### Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| TradingView blocks extension | Low-Medium | High | Fallback to upload/URL; reach out proactively |
| Low demand | Medium | High | Validate with waitlist before building |
| Claude API cost increase | Low | Medium | Can switch to Haiku for simple analyses |
| Competitor launches similar | Low | Medium | First-mover advantage; deep Strat expertise |
| Regulatory challenge | Low | High | Legal review before launch; strong disclaimers |
| TradingView TOS change | Low | Medium | Multiple capture methods; not dependent on one |

### Key Metrics to Track

- **MRR** (Monthly Recurring Revenue)
- **Churn rate** (target <5% monthly)
- **Analyses per user per month** (engagement indicator)
- **Cost per analysis** (monitor Claude API spending)
- **NPS** (Net Promoter Score, survey quarterly)
- **Conversion rate** (free trial to paid)
- **Extension install rate** (of total users)

---

## Appendix: Key Reference Links

### TradingView Documentation
- Charting Library Docs: https://www.tradingview.com/charting-library-docs/
- Snapshots API: https://www.tradingview.com/charting-library-docs/latest/ui_elements/Snapshots/
- Free Charting Libraries: https://www.tradingview.com/free-charting-libraries/
- TOS/Policies: https://www.tradingview.com/policies/
- Broker API Docs: https://www.tradingview.com/broker-api-docs/

### Technical References
- n8n TradingView + AI Workflow: https://n8n.io/workflows/2642
- TradingView MCP Server: https://github.com/ertugrul59/tradingview-chart-mcp
- CHART-IMG API: https://chart-img.com
- TradingView Screenshot (Python): https://github.com/aeron7/tradingview-screenshot

### Competitor Products
- StratAlerts.ai: https://stratalerts.ai
- Tradezella: https://www.tradezella.com
- TrendSpider: https://trendspider.com

### Claude API Pricing
- Current pricing: https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration
- Vision docs: https://platform.claude.com/docs/en/build-with-claude/vision

### Legal/Regulatory
- FCA Targeted Support: https://www.fca.org.uk/publications/policy-statements/ps25-22
- CFTC Rule 4.41 (hypothetical performance): https://www.nfa.futures.org/rulebooksql/rules.aspx?Section=4&RuleID=RULE+2-29
- MiFID II Exemptions: https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-2-exemptions

---

*This report was compiled from extensive research across TradingView documentation, competitor analysis, regulatory sources, and technical feasibility studies. All pricing and regulatory information is current as of February 2026 but should be verified before making business decisions.*
