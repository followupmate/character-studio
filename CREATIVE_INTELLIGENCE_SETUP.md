# 🎭 Creative Intelligence Layer - Setup & Usage Guide

**AI Video Pipeline Optimizer** with Higgsfield Soul2 + Kling AI  
Manages evolving motion library based on Instagram Watch Time analytics

---

## 📋 What You Have

### Core Modules

1. **`creative_intelligence.py`** (1000+ lines)
   - `DynamicMotionLibrary` - Manages motion pattern database
   - `AnalyticalFeedbackLoop` - Correlates performance metrics
   - `MotionEvolution` - Mutates successful patterns (30% evolution)
   - `HiggsFieldOptimizer` - Optimizes visual prompts
   - `ProductionStrategyGenerator` - Creates 60/30/10 batch strategy

2. **`ig_analytics_adapter.py`** (400+ lines)
   - `InstagramAnalyticsAdapter` - Parses IG API responses
   - `IGDataEnricher` - Analyzes retention patterns
   - Converts raw IG metrics → VideoAnalytics objects

3. **`pipeline_orchestrator.py`** (500+ lines)
   - `HiggsFieldAPIAdapter` - First frame generation
   - `KlingAIAdapter` - Motion generation
   - `ProductionPipeline` - End-to-end orchestration
   - CLI interface with argparse

### Data Files

- **`data/motion_library.json`** - Seed patterns + evolved variants
- **`data/video_analytics.json`** - Historical performance metrics
- **`data/production_strategy.json`** - Next batch (20 videos)
- **`data/higgsfield_configs.json`** - Prompt configurations
- **`data/execution_plan.json`** - Job tracking
- **`data/intelligence_report.json`** - Comprehensive analysis

---

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
# Python 3.10+ required
pip install requests  # For API calls (optional, mocked for now)
```

### Step 2: Run the Pipeline (Planning Mode)

```bash
# Analyze IG data + generate production strategy
python lib/pipeline_orchestrator.py --batch-size 20

# Output:
# ✓ Processed 6 video analytics
# ✓ Batch generated: batch_1705329600
#   Proven: 12 videos
#   Evolution: 6 videos
#   Experiment: 2 videos
```

### Step 3: Review Generated Files

```bash
# All outputs in data/ folder:
ls -la data/
# - motion_library.json
# - production_strategy.json
# - intelligence_report.json
# - etc.
```

### Step 4: Inspect Strategy

```bash
# Pretty-print production strategy
cat data/production_strategy.json | python -m json.tool
```

---

## 📊 Understanding the Motion Library

### Seed Patterns (Pre-initialized)

```json
{
  "id": "editorial_walk_v1",
  "name": "The Editorial Walk",
  "description": "Dynamic movement toward camera, high engagement energy",
  "kling_prompt": "confident walking motion toward camera...",
  "avg_watch_time": 14.8,
  "success_rate": 0.91,
  "engagement_score": 0.062,
  "uses": 15,
  "metadata": {
    "category": "dynamic",
    "intensity": "high",
    "duration_sec": 10
  }
}
```

### Pattern Evolution

When a pattern performs well (>75% success rate), the system automatically:
1. **Mutates** it with controlled variations (speed, intensity, timing)
2. **Names** it with generation tracking
3. **Tracks** performance as new variant

Example evolved pattern:
```json
{
  "id": "editorial_walk_v1_mut_1705329600",
  "name": "The Editorial Walk (Evolved)",
  "metadata": {
    "parent": "editorial_walk_v1",
    "generation": "evolved"
  }
}
```

---

## 📈 Analytics Integration

### Expected Instagram API Format

```json
{
  "id": "17958647847123456",
  "timestamp": "2024-01-15T10:30:00Z",
  "metrics": {
    "impressions": 5420,
    "average_watch_time": 14.2,
    "likes": 260,
    "saves": 103,
    "retention_graph": [100, 96, 91, 82, 71, 58, 44, 30, 16, 5]
  },
  "content_metadata": {
    "motion_pattern_id": "editorial_walk_v1",
    "higgsfield_prompt_id": "config_001"
  }
}
```

### Adding New Videos

```python
from ig_analytics_adapter import InstagramAnalyticsAdapter

adapter = InstagramAnalyticsAdapter()

# Add metadata to existing video
adapter.add_motion_metadata(
    video_id="17958647847123456",
    motion_pattern_id="editorial_walk_v1",
    higgsfield_prompt_id="config_001"
)
```

---

## 🎬 Production Strategy (60/30/10)

### What Gets Generated

When you run `generate_next_batch(20)`, you get:

**60% PROVEN** (12 videos)
- Top-performing patterns from library
- Highest success rates (>0.85)
- Reliable engagement
- Minimal risk

**30% EVOLUTION** (6 videos)
- Mutations of successful patterns
- Controlled experimentation
- Capture emerging trends
- Medium risk

**10% EXPERIMENT** (2 videos)
- Random combinations
- New motion+visual pairings
- Discover breakthrough moments
- High risk, high reward

### Example Batch Structure

```json
{
  "batch_id": "batch_1705329600",
  "videos": [
    {
      "video_id": "proven_editorial_walk_v1_1705329600",
      "category": "proven",
      "motion_pattern": {
        "kling_prompt": "confident walking motion toward camera...",
        "expected_performance": {
          "watch_time_avg": 14.8,
          "engagement_score": 0.062
        }
      },
      "higgsfield_config": {
        "prompt": "Professional influencer shot, The Editorial Walk, golden hour sunlight...",
        "lighting": "golden_hour",
        "color_palette": ["#FFB84D", "#D4A574", "#8B6F47", "#FFF8DC"]
      },
      "production_priority": "high"
    },
    // ... more videos
  ]
}
```

---

## 🎨 Higgsfield Prompt Optimization

### Lighting-Aware Prompts

The optimizer automatically enhances prompts based on lighting:

```python
from creative_intelligence import HiggsFieldOptimizer

optimizer = HiggsFieldOptimizer(feedback_loop)

config = optimizer.create_optimized_prompt(
    base_prompt="Professional influencer shot",
    motion_pattern=editorial_walk,
    lighting="golden_hour"  # ← Determines palette + enhancements
)

# Result:
# "Professional influencer shot, The Editorial Walk, golden hour sunlight, 
#  warm tones, soft shadows, cinematic glow"
```

### Available Lighting Profiles

- **golden_hour**: Warm sunlight, +15% engagement boost
- **soft_studio**: Professional, +8% engagement boost
- **dramatic_backlit**: Moody, +12% engagement boost
- **rim_light**: Silhouette, +10% engagement boost

---

## 🔗 Visual-Motion Correlations

The system analyzes which motion patterns pair best with which lighting:

```bash
python lib/pipeline_orchestrator.py --analyze-correlations
```

Outputs:
```
Pattern: editorial_walk_v1
  Recommended Lighting: golden_hour
  Recommended Intensity: high
  Avg Completion Rate: 78.5%
  Avg Saves: 5.2
```

---

## 💾 Data Persistence

All data is automatically saved to JSON:

```
data/
├── motion_library.json            (Your motion patterns)
├── video_analytics.json           (Historical performance)
├── production_strategy.json       (Next batch)
├── higgsfield_configs.json        (Prompt configs)
├── execution_plan.json            (Job tracking)
├── intelligence_report.json       (Analysis report)
└── ig_raw_analytics.json          (Raw IG data)
```

---

## 🔧 Advanced Usage

### Running Tests

```bash
python lib/creative_intelligence.py  # Demo mode
python lib/ig_analytics_adapter.py   # IG adapter demo
python lib/pipeline_orchestrator.py  # Full pipeline
```

### Custom Pattern Creation

```python
from creative_intelligence import MotionPattern, DynamicMotionLibrary

dml = DynamicMotionLibrary()

# Create custom pattern
new_pattern = MotionPattern(
    id="my_custom_v1",
    name="My Custom Motion",
    description="Custom description",
    kling_prompt="my detailed kling prompt here",
    metadata={"category": "custom", "intensity": "medium"}
)

dml.add_pattern(new_pattern)
```

### Batch Processing Historical Data

```python
from ig_analytics_adapter import InstagramAnalyticsAdapter

adapter = InstagramAnalyticsAdapter("data/ig_raw_analytics.json")
analytics_list = adapter.batch_convert()

# Process all
orchestrator.ingest_ig_analytics()
```

---

## 🌐 Integration with TypeScript

Since main project is Next.js/TypeScript, create Node.js wrapper:

```typescript
// lib/creative-intelligence-runner.ts
import { execSync } from 'child_process';
import * as fs from 'fs';

export async function generateProductionBatch(batchSize: number = 20) {
  // Run Python orchestrator
  execSync(`python lib/pipeline_orchestrator.py --batch-size ${batchSize}`);
  
  // Load result
  const strategy = JSON.parse(
    fs.readFileSync('data/production_strategy.json', 'utf-8')
  );
  
  return strategy;
}

export function getMotionLibrary() {
  return JSON.parse(
    fs.readFileSync('data/motion_library.json', 'utf-8')
  );
}
```

Then in Next.js route:
```typescript
// app/api/generate-batch/route.ts
import { generateProductionBatch } from '@/lib/creative-intelligence-runner';

export async function POST(req: Request) {
  const batch = await generateProductionBatch(20);
  return Response.json(batch);
}
```

---

## 📊 Expected Output Flow

```
Instagram Analytics
    ↓
[IG Analytics Adapter]
    ↓
VideoAnalytics objects
    ↓
[Analytical Feedback Loop]
    ↓
Pattern Performance Metrics + Visual-Motion Correlations
    ↓
[Motion Evolution + Higgsfield Optimizer]
    ↓
Enhanced Patterns + Optimized Prompts
    ↓
[Production Strategy Generator]
    ↓
Batch Strategy (60% Proven + 30% Evolution + 10% Experiment)
    ↓
[Higgsfield Soul2] → First Frames
    ↓
[Kling AI] → Motion Videos
    ↓
Production Complete
```

---

## 🚨 Common Workflows

### 1. Weekly Optimization Cycle

```bash
# Monday: Ingest weekend analytics + generate week's batch
python lib/pipeline_orchestrator.py --batch-size 20 --week 3
```

### 2. A/B Test New Pattern

```python
from creative_intelligence import MotionEvolution, DynamicMotionLibrary

dml = DynamicMotionLibrary()
evolution = MotionEvolution(dml)

# Create variant
variant = evolution.mutate_pattern("editorial_walk_v1", mutation_intensity=0.5)

# Mark for testing
variant.metadata["test_group"] = "variant_a"
```

### 3. Emergency Rollback

```python
# Revert to seed patterns only
dml = DynamicMotionLibrary()
dml.patterns = {k: v for k, v in dml.patterns.items() 
                if "parent" not in v.metadata}
dml.save()
```

---

## 📚 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│     Creative Intelligence Layer (Python)                │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Dynamic Motion Library (DML)                    │   │
│  │ • Seed Patterns: Cinematic, Glance, Editorial   │   │
│  │ • Evolution: Mutation + Performance Tracking    │   │
│  └─────────────────────────────────────────────────┘   │
│           ↓                           ↓                  │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │ IG Analytics Adapter │  │ Analytical Feedback  │    │
│  │ • Parse IG API       │  │ • Correlations       │    │
│  │ • Retention Analysis │  │ • Pattern Performance│    │
│  └──────────────────────┘  └──────────────────────┘    │
│           ↓                           ↓                  │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │ Higgsfield Optimizer │  │ Motion Evolution     │    │
│  │ • Prompt Generation  │  │ • Mutation Strategies│    │
│  │ • Lighting Pairing   │  │ • Performance Eval   │    │
│  └──────────────────────┘  └──────────────────────┘    │
│           ↓                           ↓                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Production Strategy Generator                   │   │
│  │ • 60% Proven + 30% Evolution + 10% Experiment   │   │
│  │ • Batch Composition & Prioritization            │   │
│  └──────────────────────────────────────────────────┘   │
│           ↓                                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Pipeline Orchestrator                           │   │
│  │ • Higgsfield API integration                    │   │
│  │ • Kling AI API integration                      │   │
│  │ • Execution planning & tracking                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Next Steps

1. **Generate your first batch**: `python lib/pipeline_orchestrator.py`
2. **Review production_strategy.json** for video specs
3. **Connect to Higgsfield API** (set `HIGGSFIELD_API_KEY`)
4. **Connect to Kling AI API** (set `KLING_API_KEY`)
5. **Run with `--execute` flag** to actually generate videos
6. **Monitor Watch Time** on Instagram → Feed back into system
7. **Weekly optimization cycle** to evolve patterns

---

## 📧 Questions?

This Creative Intelligence Layer is:
- **Modular**: Use individual components or full pipeline
- **Extensible**: Add new mutation strategies, lighting profiles, etc.
- **Trackable**: Full JSON audit trail of all decisions
- **Autonomous**: Self-improving based on real IG metrics

Enjoy your AI video pipeline! 🎬✨
