# Railway Deployment Guide

**Task 1.8: Deploy to Railway + Set Up Database**

Complete step-by-step guide. Bookmark this page - you can return anytime.

---

## Progress Checklist

Track your progress as you go:

- [ ] Step 1: Railway account created
- [ ] Step 2: Project created
- [ ] Step 3: PostgreSQL added
- [ ] Step 4: Redis added
- [ ] Step 5: Backend service added
- [ ] Step 6: Environment variables configured
- [ ] Step 7: Deployment successful
- [ ] Step 8: Migrations completed
- [ ] Step 9: Verification tests passed

**Time estimate:** 30-60 minutes

---

## Step 1: Create Railway Account

1. Go to **https://railway.app**
2. Click **"Start a New Project"**
3. **Sign up with GitHub** (recommended)
4. Verify your email
5. **Check:** You should see the Railway dashboard

**Pricing:** Free tier includes $5/month credit (sufficient for testing)

---

## Step 2: Create New Project

1. From dashboard, click **"New Project"**
2. Choose **"Empty Project"**
3. Name it: **`strat-coach-api`**
4. **Check:** You should see an empty project canvas

---

## Step 3: Add PostgreSQL Database

1. In your project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Wait ~30 seconds for provisioning
4. **Check:** PostgreSQL service shows green "Active" status

### Copy Database URL

1. Click on the PostgreSQL service (purple icon)
2. Click **"Variables"** tab
3. Find **`DATABASE_URL`**
4. Click the copy icon (📋)
5. **Save this URL temporarily** - format:
   ```
   postgresql://postgres:xxxxx@containers-us-west-xyz.railway.app:1234/railway
   ```

**Note:** Keep this Railway tab open - you'll need it.

---

## Step 4: Add Redis

1. In your project, click **"+ New"** again
2. Select **"Database"** → **"Redis"**
3. Wait ~30 seconds for provisioning
4. **Check:** Redis service shows green "Active" status

### Copy Redis URL

1. Click on the Redis service (red icon)
2. Click **"Variables"** tab
3. Find **`REDIS_URL`**
4. Click the copy icon (📋)
5. **Save this URL temporarily** - format:
   ```
   redis://default:xxxxx@containers-us-west-xyz.railway.app:5678
   ```

---

## Step 5: Deploy Backend Service

### Option A: Deploy from GitHub (Recommended)

**5.1 Push code to GitHub first:**

```bash
cd /Users/phil/projects/strat-trading-coach

# Check what will be committed
git status

# Add backend code
git add strat-coach-api/

# Commit
git commit -m "Add backend API - Phase 1 complete"

# Push to GitHub
git push origin main
```

**5.2 Connect to Railway:**

1. In Railway project, click **"+ New"**
2. Select **"GitHub Repo"**
3. Authorize Railway to access your GitHub
4. Choose repository: **`strat-trading-coach`**
5. **Important:** Set **Root Directory** to: **`strat-coach-api`**
6. Click **"Deploy"**

**5.3 Monitor build:**

Railway will automatically:
- Detect Node.js
- Run `npm install`
- Run `npm run build`
- Start the server

Watch the **"Build Logs"** tab for progress.

### Option B: Deploy from CLI (Alternative)

```bash
cd /Users/phil/projects/strat-trading-coach/strat-coach-api

# Install Railway CLI
npm install -g railway

# Login
railway login

# Link to your project
railway link

# Deploy
railway up
```

**Check:** Build logs should show:
```
Installing dependencies...
Building TypeScript...
Build complete!
```

---

## Step 6: Configure Environment Variables

1. Click on your **backend service** (Node.js icon)
2. Go to **"Variables"** tab
3. Click **"Raw Editor"** (easier for bulk paste)

### Paste All Variables

Copy and paste this, then **replace placeholders**:

```bash
# Server
PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Database (Railway internal reference)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (Railway internal reference)
REDIS_URL=${{Redis.REDIS_URL}}

# Anthropic (REPLACE WITH YOUR KEY)
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE

# Clerk (REPLACE WITH YOUR KEYS)
CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE
CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE

# CORS (allow Electron app)
CORS_ORIGIN=http://localhost:5173

# Backend URL (REPLACE AFTER STEP 7)
BACKEND_URL=https://WILL_UPDATE_IN_STEP_7
```

### How to Get Missing Keys

**Anthropic API Key:**
- You should already have this
- Format: `sk-ant-api03-...`

**Clerk Keys:**
1. Go to **https://dashboard.clerk.com**
2. Create account (free)
3. Create application: **"The Strat Coach"**
4. Go to **"API Keys"**
5. Copy:
   - `CLERK_SECRET_KEY` (starts with `sk_test_`)
   - `CLERK_PUBLISHABLE_KEY` (starts with `pk_test_`)

**Important Notes:**
- `${{Postgres.DATABASE_URL}}` is Railway's internal reference - leave as-is
- `${{Redis.REDIS_URL}}` is Railway's internal reference - leave as-is
- We'll update `BACKEND_URL` in Step 7

Click **"Deploy"** to apply changes.

---

## Step 7: Get Your Deployment URL

1. Still in your backend service, go to **"Settings"** tab
2. Scroll to **"Networking"** section
3. Click **"Generate Domain"**
4. Railway assigns a URL like:
   ```
   https://strat-coach-api-production-xxxx.railway.app
   ```
5. **Copy this URL**

### Update BACKEND_URL Variable

1. Go back to **"Variables"** tab
2. Find `BACKEND_URL`
3. Update it with your Railway URL
4. Click **"Deploy"** to apply

Railway will redeploy with the updated variable.

---

## Step 8: Run Database Migrations

**Important:** Wait for deployment to finish (Step 7) before running migrations.

### Using Railway CLI:

```bash
cd /Users/phil/projects/strat-trading-coach/strat-coach-api

# Make sure you're linked to Railway
railway link

# Run migrations on Railway's database
railway run npm run db:migrate
```

**Expected output:**

```
🔄 Starting database migrations...

▶️  Running migration 001_initial.sql...
✅ Migration 001_initial.sql completed

🎉 All migrations completed successfully
```

### If CLI doesn't work:

Connect to Railway PostgreSQL directly:

```bash
# Get the DATABASE_URL from Railway
# Then run locally but pointing to Railway DB:

DATABASE_URL="<paste-railway-database-url>" npm run db:migrate
```

**Check:** No errors, migrations complete successfully.

---

## Step 9: Verify Deployment

### 9.1 Check Deployment Status

In Railway:
1. Go to your backend service
2. Click **"Deployments"** tab
3. Latest deployment should show **"Success"** (green checkmark)

### 9.2 Check Logs

1. Click on the latest deployment
2. View **"Deploy Logs"**
3. **Look for these messages:**
   ```
   🚀 Server listening on http://0.0.0.0:3001
   📊 Database connected (Xms latency)
   📡 Redis connected
   🔐 Auth plugin initialized
   ⏱️  Rate limiter plugin initialized
   🤖 Claude service initialized
   ```

**If you see errors**, scroll to **Troubleshooting** section below.

### 9.3 Test Health Endpoint

```bash
# Replace with your Railway URL
curl https://your-app.railway.app/api/v1/health
```

**Expected response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-02-18T...",
  "uptime": 42
}
```

### 9.4 Test Status Endpoint

```bash
curl https://your-app.railway.app/api/v1/status
```

**Expected response:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "environment": "production",
  "dependencies": {
    "database": {
      "status": "connected",
      "latency_ms": 3
    },
    "redis": {
      "status": "connected"
    },
    "anthropic": {
      "status": "pending"
    },
    "stripe": {
      "status": "pending"
    }
  }
}
```

**Check:**
- ✅ `database.status` = `"connected"`
- ✅ `redis.status` = `"connected"`

---

## Troubleshooting

### Build Fails

**Error:** `Cannot find module 'fastify'`

**Fix:**
- Check that `package.json` exists in `strat-coach-api/`
- Verify Root Directory is set to `strat-coach-api`
- Redeploy

---

**Error:** `TypeScript compilation failed`

**Fix:**
1. Check build logs for specific error
2. Run locally first: `npm run typecheck`
3. Fix any TypeScript errors
4. Commit and push
5. Railway auto-redeploys

---

### Database Connection Fails

**Error in logs:** `Database connection failed`

**Fix:**
1. Check PostgreSQL service is running (green in Railway)
2. Verify `DATABASE_URL` variable:
   - Should be `${{Postgres.DATABASE_URL}}`
   - NOT a hardcoded URL
3. Click **"Restart"** on PostgreSQL service
4. Redeploy backend

---

**Error:** `ECONNREFUSED` or `timeout`

**Fix:**
- Railway services use **internal networking**
- Make sure you're using `${{Postgres.DATABASE_URL}}` not the public URL
- The internal URL has `.railway.internal` in it

---

### Redis Connection Fails

**Error in logs:** `Redis connection error`

**Fix:**
1. Check Redis service is running (green in Railway)
2. Verify `REDIS_URL` variable is set to `${{Redis.REDIS_URL}}`
3. **Note:** Server will continue running with rate limiting disabled (graceful degradation)

---

### Migrations Fail

**Error:** `Migration failed` or `relation already exists`

**Fix:**
1. Check if migrations already ran:
   ```bash
   railway run psql -c "SELECT * FROM migrations;"
   ```
2. If migrations exist, skip this step
3. If error persists, check migration SQL syntax

---

### Server Won't Start

**Error:** `Port 3001 already in use`

**Fix:**
- This shouldn't happen on Railway
- Railway auto-assigns a port via `process.env.PORT`
- Your code already handles this correctly

---

**Error:** `Missing required environment variable`

**Fix:**
1. Go to Variables tab
2. Check all required variables are set:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `ANTHROPIC_API_KEY`
   - `CLERK_SECRET_KEY`
   - `CLERK_PUBLISHABLE_KEY`
3. Click **"Deploy"** after adding missing vars

---

### Can't Access Deployment URL

**Error:** `This site can't be reached`

**Fix:**
1. Check deployment status is "Success"
2. Check logs show server started
3. Verify domain was generated in Settings → Networking
4. Wait 1-2 minutes for DNS propagation
5. Try incognito/private browser window

---

## Success Criteria

Before considering deployment complete, verify:

- [ ] Railway dashboard shows all 3 services as "Active" (green)
- [ ] Latest deployment shows "Success"
- [ ] Deploy logs show server started successfully
- [ ] No error messages in logs
- [ ] Health endpoint returns 200 OK
- [ ] Status endpoint shows database connected
- [ ] Status endpoint shows Redis connected
- [ ] Migrations completed successfully

---

## Post-Deployment: Update Electron App

Once backend is deployed, update your Electron app:

```bash
cd /Users/phil/projects/strat-trading-coach

# Edit .env
nano .env
```

Add/update:
```env
BACKEND_URL=https://your-app.railway.app
```

Now your Electron app can connect to the deployed backend!

---

## Railway Dashboard Quick Reference

**Service Status:**
- 🟢 Green = Running
- 🟡 Yellow = Building/Deploying
- 🔴 Red = Failed

**Tabs:**
- **Deployments** - View build logs, redeploy
- **Variables** - Environment configuration
- **Settings** - Domain, networking, scaling
- **Metrics** - CPU, memory, network usage
- **Logs** - Runtime logs

**Useful Commands:**
```bash
railway logs           # View live logs
railway status         # Check service status
railway run <cmd>      # Run command in Railway environment
railway open           # Open dashboard in browser
```

---

## Cost Monitoring

**Free Tier:**
- $5/month included credit
- ~500 execution hours
- Sufficient for development

**Check Usage:**
1. Railway dashboard → Project Settings → Usage
2. Monitor credit consumption
3. Upgrade to Pro ($20/mo) when needed

**Current usage estimate:**
- Backend: ~$2-3/month
- PostgreSQL: ~$2/month
- Redis: ~$1/month
- **Total: ~$5-6/month**

---

## Next Steps

After deployment is complete:

1. **Mark Task 1.8 as Complete** ✅
2. **Task 1.9:** Write integration tests
3. **Phase 2:** Billing integration (Stripe)
4. **Phase 3:** Connect Electron app to backend

---

## Need to Pause?

**Save your progress:**
- Railway URL: _______________________
- Database URL: (in Railway Variables)
- Deployment status: _______________________
- Last completed step: Step # _______

**To resume:**
1. Go to https://railway.app/dashboard
2. Open your `strat-coach-api` project
3. Check which step you're on (use checklist at top)
4. Continue from there

---

## Support

**Railway Issues:**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway

**Backend Issues:**
- Check `IMPLEMENTATION-STATUS.md`
- Check deploy logs in Railway
- Review error messages in logs

---

**Last Updated:** 2026-02-18
**Guide Created By:** Claude Code
