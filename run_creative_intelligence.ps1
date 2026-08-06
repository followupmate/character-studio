# Creative Intelligence Layer - Quick Run Script
# Usage: .\run_creative_intelligence.ps1 -Mode "analyze" -BatchSize 20

param(
    [ValidateSet("analyze", "execute", "demo", "clean")]
    [string]$Mode = "analyze",

    [int]$BatchSize = 20,

    [switch]$Verbose
)

Write-Host "=" * 80
Write-Host "🎭 CREATIVE INTELLIGENCE LAYER - AI VIDEO PIPELINE"
Write-Host "=" * 80

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Python detected: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python not found. Please install Python 3.10+" -ForegroundColor Red
    exit 1
}

# Ensure data directory exists
New-Item -ItemType Directory -Force -Path "data" | Out-Null
New-Item -ItemType Directory -Force -Path "config" | Out-Null
New-Item -ItemType Directory -Force -Path "logs" | Out-Null

Write-Host "`n📋 Running mode: $Mode"
Write-Host "🎬 Batch size: $BatchSize"
Write-Host ""

switch ($Mode) {
    "demo" {
        Write-Host "🎬 Running DEMO mode..."
        Write-Host "   • Testing DynamicMotionLibrary"
        Write-Host "   • Testing IG Analytics Adapter"
        Write-Host "   • Testing Production Strategy"
        Write-Host ""

        python lib/creative_intelligence.py
        Write-Host "`n" + "=" * 80
        python lib/ig_analytics_adapter.py
    }

    "analyze" {
        Write-Host "📊 Running ANALYSIS mode..."
        Write-Host "   • Ingesting Instagram analytics"
        Write-Host "   • Analyzing motion patterns"
        Write-Host "   • Optimizing Higgsfield prompts"
        Write-Host "   • Generating production strategy (60/30/10)"
        Write-Host ""

        python lib/pipeline_orchestrator.py `
            --batch-size $BatchSize `
            --config config/pipeline.json

        Write-Host "`n✅ Analysis complete!"
        Write-Host "`n📁 Output files generated:"
        Write-Host "   • data/motion_library.json"
        Write-Host "   • data/production_strategy.json"
        Write-Host "   • data/intelligence_report.json"
        Write-Host "   • data/higgsfield_configs.json"
        Write-Host ""

        # Show summary
        if (Test-Path "data/intelligence_report.json") {
            Write-Host "📊 Intelligence Report Summary:" -ForegroundColor Cyan
            $report = Get-Content "data/intelligence_report.json" | ConvertFrom-Json
            Write-Host "   Total videos analyzed: $($report.summary.total_videos_analyzed)"
            Write-Host "   Avg completion rate: $([Math]::Round($report.summary.avg_completion_rate * 100, 1))%"
            Write-Host "   Total impressions: $($report.summary.total_impressions)"
            Write-Host "   Total engagement: $($report.summary.total_engagement)"

            if ($report.top_insights) {
                Write-Host "`n💡 Key Insights:" -ForegroundColor Yellow
                foreach ($insight in $report.top_insights) {
                    Write-Host "   • $insight"
                }
            }
        }
    }

    "execute" {
        Write-Host "🚀 Running EXECUTION mode..."
        Write-Host "   ⚠️  This will call Higgsfield Soul2 + Kling AI APIs"
        Write-Host "   ⚠️  Requires: HIGGSFIELD_API_KEY, KLING_API_KEY"
        Write-Host ""

        # Check for API keys
        if (-not $env:HIGGSFIELD_API_KEY) {
            Write-Host "✗ HIGGSFIELD_API_KEY not set" -ForegroundColor Red
        } else {
            Write-Host "✓ HIGGSFIELD_API_KEY found" -ForegroundColor Green
        }

        if (-not $env:KLING_API_KEY) {
            Write-Host "✗ KLING_API_KEY not set" -ForegroundColor Red
        } else {
            Write-Host "✓ KLING_API_KEY found" -ForegroundColor Green
        }

        Write-Host ""
        $confirm = Read-Host "Proceed with video generation? (yes/no)"

        if ($confirm -eq "yes") {
            python lib/pipeline_orchestrator.py `
                --batch-size $BatchSize `
                --config config/pipeline.json `
                --execute

            Write-Host "`n✅ Production batch submitted!"
            Write-Host "   Check data/execution_plan.json for job status"
        } else {
            Write-Host "Cancelled." -ForegroundColor Yellow
        }
    }

    "clean" {
        Write-Host "🧹 Cleaning up..."

        $confirm = Read-Host "Delete all generated data? (yes/no)"

        if ($confirm -eq "yes") {
            Remove-Item -Path "data/*.json" -Exclude "ig_raw_analytics.json" -Force
            Remove-Item -Path "logs/*" -Force -ErrorAction SilentlyContinue
            Write-Host "✓ Cleaned up" -ForegroundColor Green
        } else {
            Write-Host "Cancelled." -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "📚 For detailed documentation, see: CREATIVE_INTELLIGENCE_SETUP.md"
Write-Host ""
