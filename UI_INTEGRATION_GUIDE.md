# 🎭 Creative Intelligence UI Integration Guide

**Your AI video pipeline with autonomous backend + click-to-generate frontend**

---

## 🎯 Architecture Overview

```
BACKGROUND (Runs autonomously)          FRONTEND (User clicks)
════════════════════════════════════════════════════════════

[6 AM Daily] ─────────────────►  Analyzes IG data
GitHub Actions Cron              Updates motion library
(or node-schedule)               Generates batch strategy
                                 
                    ↓
                    
            production_strategy.json
            (20 video prompts ready)
            
                    ↓
                    
        UI Dashboard displays
        all 20 videos
        
                    ↓
                    
        User clicks "Generate"
                    ↓
        API calls Higgsfield
        (first frame)
                    ↓
        API calls Kling AI
        (motion video)
                    ↓
        Ready for upload!
```

---

## 📦 What's Been Set Up

### Backend Files

✅ **lib/autonomous_optimizer.py** - Runs daily, generates batch strategy (no video generation)
✅ **app/api/creative-intelligence/daily-batch/route.ts** - GET current batch
✅ **app/api/creative-intelligence/generate-video/route.ts** - POST triggers Higgsfield + Kling
✅ **app/api/creative-intelligence/trigger-optimizer/route.ts** - POST manual optimizer trigger
✅ **lib/cron-setup.ts** - Cron job configuration
✅ **.github/workflows/creative-intelligence-daily.yml** - GitHub Actions daily run

### Frontend Files

✅ **components/CreativeIntelligenceDashboard.tsx** - Full UI component
✅ **app/dashboard/creative-intelligence/page.tsx** - Dashboard page

### Configuration

✅ **data/production_strategy.json** - Current batch (auto-generated)
✅ **data/daily_optimization_report.json** - Daily report (auto-generated)

---

## 🚀 How to Deploy

### Step 1: Add to Your Next.js App

#### 1a. Copy Python modules (if not already there)
```bash
# Already in your project:
# - lib/creative_intelligence.py
# - lib/ig_analytics_adapter.py
# - lib/autonomous_optimizer.py
```

#### 1b. Copy Next.js API routes
```bash
# Already copied to app/api/creative-intelligence/
```

#### 1c. Copy React component
```bash
# Already in components/CreativeIntelligenceDashboard.tsx
```

#### 1d. Add to your navigation/layout
```typescript
// In your layout or navigation component
import Link from 'next/link';

export default function Navigation() {
  return (
    <nav>
      {/* ... other links ... */}
      <Link href="/dashboard/creative-intelligence">
        Creative Intelligence
      </Link>
    </nav>
  );
}
```

### Step 2: Setup GitHub Actions (Recommended)

The workflow file is already created at `.github/workflows/creative-intelligence-daily.yml`

#### Enable it:
1. Commit the files
2. Push to GitHub
3. Go to "Actions" tab in GitHub
4. Workflow runs daily at 6 AM UTC

#### Optional: Setup Slack notifications
```bash
# In GitHub repo Settings → Secrets → New repository secret
# Name: SLACK_WEBHOOK_URL
# Value: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Step 3: Add API Keys to Environment

```bash
# .env.local (for local development)
HIGGSFIELD_API_KEY=your_api_key_here
KLING_API_KEY=your_api_key_here

# Or GitHub Secrets for Actions
# Settings → Secrets → New repository secret
```

### Step 4: Test Locally

```bash
# 1. Run optimizer once
python lib/autonomous_optimizer.py

# 2. Start Next.js
npm run dev

# 3. Go to http://localhost:3000/dashboard/creative-intelligence
```

---

## 🎬 User Workflow

### Day 1 (Setup)

```
1. Click "Run Now" button
   ↓
2. Optimizer runs (60 sec)
   ↓
3. Dashboard loads 20 videos
   ├─ 12 Proven (green badges)
   ├─ 6 Evolution (blue badges)
   └─ 2 Experiment (purple badges)
```

### Days 2-7 (Daily Autonomous + Manual)

```
06:00 AM (automatic)
  ├─ GitHub Actions triggers
  ├─ Python optimizer runs
  ├─ Analyzes yesterday's IG metrics
  ├─ Updates motion_library.json
  └─ Generates new production_strategy.json

During Day
  ├─ User opens dashboard
  ├─ Sees 20 new video prompts
  ├─ Clicks "Generate Video" on one
  │  ├─ Calls Higgsfield API
  │  ├─ Gets first frame image
  │  ├─ Calls Kling AI API
  │  ├─ Gets motion video
  │  └─ Shows ready for upload
  └─ User uploads to Instagram
```

---

## 🔌 Connecting to Real APIs

### Higgsfield Soul2 Integration

In `app/api/creative-intelligence/generate-video/route.ts`, update:

```typescript
async function callHiggsField(params: { prompt: string; configId: string }) {
  const response = await fetch('https://api.higgsfield.ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}`
    },
    body: JSON.stringify({
      model: 'soul2',
      prompt: params.prompt,
      negative_prompt: 'blurry, low quality, distorted',
      height: 1080,
      width: 1080,
      steps: 50,
      guidance_scale: 7.5
    })
  });

  const data = await response.json();
  return {
    job_id: data.job_id,
    status: data.status
  };
}

async function pollHiggsField(jobId: string) {
  // Implement polling logic with your Higgsfield API
  const response = await fetch(
    `https://api.higgsfield.ai/jobs/${jobId}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}`
      }
    }
  );

  const data = await response.json();

  if (data.status === 'completed') {
    return {
      success: true,
      imageUrl: data.result.image_url,
      jobId: jobId
    };
  }

  // Keep polling if not ready
  await new Promise(r => setTimeout(r, 2000));
  return pollHiggsField(jobId);
}
```

### Kling AI Integration

Similar to Higgsfield:

```typescript
async function callKling(params: { imageUrl: string; motionPrompt: string; duration: number }) {
  const response = await fetch('https://api.kling.ai/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.KLING_API_KEY}`
    },
    body: JSON.stringify({
      model: 'kling-v1',
      image_url: params.imageUrl,
      prompt: params.motionPrompt,
      duration: params.duration,
      resolution: '1080p'
    })
  });

  const data = await response.json();
  return {
    job_id: data.id,
    status: data.status
  };
}

async function pollKling(jobId: string) {
  const response = await fetch(
    `https://api.kling.ai/v1/videos/generations/${jobId}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.KLING_API_KEY}`
      }
    }
  );

  const data = await response.json();

  if (data.status === 'succeeded') {
    return {
      success: true,
      videoUrl: data.video_url,
      duration: data.duration,
      jobId: jobId
    };
  }

  await new Promise(r => setTimeout(r, 5000));
  return pollKling(jobId);
}
```

---

## 📊 Monitoring & Debugging

### Check Daily Optimizer Results

```bash
# See what the daily optimizer generated
cat data/production_strategy.json | python -m json.tool | head -50

# See the analysis report
cat data/daily_optimization_report.json | python -m json.tool

# See motion library (updated patterns)
cat data/motion_library.json | python -m json.tool
```

### Manual Trigger

```bash
# Run optimizer from command line
python lib/autonomous_optimizer.py

# Or via API
curl -X POST http://localhost:3000/api/creative-intelligence/trigger-optimizer
```

### View Dashboard

```
http://localhost:3000/dashboard/creative-intelligence
```

---

## 🔧 Customization

### Change Daily Schedule

**GitHub Actions:**
Edit `.github/workflows/creative-intelligence-daily.yml`
```yaml
schedule:
  - cron: '0 6 * * *'  # Change to your preferred time (UTC)
```

**Local (node-schedule):**
Edit `lib/cron-setup.ts`
```typescript
schedule.scheduleJob('0 6 * * *', async () => {
  // 0 6 = 6:00 AM
  // Change hour (0-23) and minute (0-59)
});
```

### Change Batch Size

**In dashboard component:**
```typescript
const triggerOptimizer = async () => {
  const res = await fetch('/api/creative-intelligence/trigger-optimizer', {
    method: 'POST',
    body: JSON.stringify({ batchSize: 30 })  // Change from 20 to 30
  });
};
```

### Change Strategy Composition

**In lib/autonomous_optimizer.py:**
```python
# Instead of 60/30/10, use 50/40/10
strategy = self.ci_orchestrator.generate_next_batch(
    batch_size=20,
    proven_pct=0.50,      # Changed from 0.60
    evolution_pct=0.40,   # Changed from 0.30
    experiment_pct=0.10
)
```

---

## 📝 Environment Variables

Create `.env.local`:

```bash
# API Keys
HIGGSFIELD_API_KEY=your_higgsfield_key
KLING_API_KEY=your_kling_key

# Notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Database (if using Supabase)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key

# Instagram API (for real analytics ingestion)
INSTAGRAM_BUSINESS_ACCOUNT_ID=your_account_id
INSTAGRAM_ACCESS_TOKEN=your_access_token
```

---

## 🚨 Troubleshooting

### "No batch generated yet"
```bash
# Solution: Run optimizer manually
python lib/autonomous_optimizer.py
```

### "API key not found"
```bash
# Add to .env.local
HIGGSFIELD_API_KEY=your_key
KLING_API_KEY=your_key
```

### "Generation takes too long"
- Higgsfield: ~45 seconds typically
- Kling: ~120 seconds typically
- Total: ~3 minutes for complete pipeline

### "Motion library not updating"
```bash
# Check if IG analytics are being ingested
cat data/video_analytics.json

# Verify pattern has >5 uses and >75% success rate
python -c "import json; lib=json.load(open('data/motion_library.json')); 
[print(f\"{k}: uses={v['uses']}, success={v['success_rate']:.0%}\") for k,v in lib.items()]"
```

---

## ✅ Checklist

- [ ] Files copied to project
- [ ] GitHub Actions enabled (or local cron setup)
- [ ] API keys in `.env.local`
- [ ] Dashboard page accessible at `/dashboard/creative-intelligence`
- [ ] Higgsfield & Kling API integration completed
- [ ] First optimizer run successful (`python lib/autonomous_optimizer.py`)
- [ ] Dashboard shows 20 videos
- [ ] Click "Generate Video" works (requires API keys)
- [ ] Generated videos ready for upload

---

## 📞 Support

### For Python backend issues:
```bash
# Debug autonomous optimizer
python lib/autonomous_optimizer.py --debug

# Check file permissions
ls -la data/
```

### For UI issues:
```bash
# Check Next.js logs
npm run dev

# Check browser console (F12 DevTools)
```

### For API integration:
- Verify API keys are set
- Check API response format matches expectations
- Test with mock data first (already implemented)
- Then switch to real API calls

---

## 🎉 You Now Have

✅ **Autonomous daily optimization** (6 AM every day)
✅ **20 video prompts generated** (ready for click-to-generate)
✅ **Full UI dashboard** (monitor + control)
✅ **Click-to-generate workflow** (user clicks → Higgsfield + Kling)
✅ **GitHub Actions integration** (auto-runs, no manual setup needed)
✅ **Slack notifications** (optional, for status updates)

**Cost-efficient:** Only generates videos user clicks on, not all 20!

---

Start here: `http://localhost:3000/dashboard/creative-intelligence`
