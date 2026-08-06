"""
Autonomous Background Optimizer
Runs daily: analyzes IG data, generates production strategy (no video generation)
User clicks in UI → THEN generates video
"""

import json
from pathlib import Path
from datetime import datetime
import sys
import os

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent))

from creative_intelligence import (
    CreativeIntelligenceOrchestrator,
    VideoAnalytics
)
from ig_analytics_adapter import InstagramAnalyticsAdapter


class AutonomousOptimizer:
    """
    Runs in background (cron job)
    - Ingests IG analytics
    - Generates production strategy
    - Updates motion library
    - NO video generation (saves money)
    """

    def __init__(self):
        self.ci_orchestrator = CreativeIntelligenceOrchestrator()
        self.ig_adapter = InstagramAnalyticsAdapter()
        self.data_dir = Path("data")
        self.data_dir.mkdir(exist_ok=True)

    def run_daily_optimization(self) -> dict:
        """
        Daily routine:
        1. Ingest new IG analytics
        2. Update motion library
        3. Generate production strategy
        4. Return results (no video generation)
        """

        print("\n" + "="*80)
        print("[AUTONOMOUS] Daily Creative Intelligence Optimization")
        print("="*80)
        print(f"Timestamp: {datetime.now().isoformat()}")

        # Step 1: Ingest IG analytics
        print("\n[1/4] Ingesting Instagram analytics...")
        analytics_list = self.ig_adapter.batch_convert()
        print(f"✓ Processed {len(analytics_list)} videos")

        for analytics in analytics_list:
            self.ci_orchestrator.process_new_analytics(analytics)

        # Step 2: Analyze performance
        print("\n[2/4] Analyzing pattern performance...")
        top_patterns = self.ci_orchestrator.get_top_patterns(5)
        correlations = self.ci_orchestrator.get_correlations()

        print(f"✓ Top pattern: {top_patterns[0]['name']}")
        print(f"  Success rate: {top_patterns[0]['success_rate']:.0%}")
        print(f"  Watch time: {top_patterns[0]['avg_watch_time']:.1f}s")

        # Step 3: Generate production strategy (PROMPTS ONLY)
        print("\n[3/4] Generating production strategy (PROMPTS ONLY)...")
        strategy = self.ci_orchestrator.generate_next_batch(batch_size=20)
        print(f"✓ Strategy generated: {strategy['batch_id']}")
        print(f"  Videos: {len(strategy['videos'])}")
        print(f"  - Proven: {len([v for v in strategy['videos'] if v['category'] == 'proven'])}")
        print(f"  - Evolution: {len([v for v in strategy['videos'] if v['category'] == 'evolution'])}")
        print(f"  - Experiment: {len([v for v in strategy['videos'] if v['category'] == 'experiment'])}")

        # Step 4: Generate report
        print("\n[4/4] Generating intelligence report...")
        report = self._generate_autonomous_report(analytics_list, strategy, top_patterns)
        self._save_report(report)
        print(f"✓ Report saved")

        # Return summary (for API/logging)
        return {
            "success": True,
            "batch_id": strategy["batch_id"],
            "videos_ready": len(strategy["videos"]),
            "top_pattern": top_patterns[0]["name"],
            "timestamp": datetime.now().isoformat(),
            "ready_for_generation": True  # Key: prompts ready, user clicks to generate
        }

    def _generate_autonomous_report(self, analytics, strategy, top_patterns) -> dict:
        """Generate optimization report"""
        return {
            "generated_at": datetime.now().isoformat(),
            "type": "autonomous_daily",
            "summary": {
                "videos_analyzed": len(analytics),
                "avg_completion_rate": sum(a.completion_rate for a in analytics) / len(analytics) if analytics else 0,
                "total_impressions": sum(a.impressions for a in analytics),
                "total_engagement": sum(a.likes + a.saves for a in analytics)
            },
            "batch": {
                "batch_id": strategy["batch_id"],
                "videos_ready": len(strategy["videos"]),
                "ready_for_click_generation": True
            },
            "top_patterns": [
                {
                    "name": p["name"],
                    "success_rate": p["success_rate"],
                    "watch_time": p["avg_watch_time"],
                    "uses": p["uses"]
                }
                for p in top_patterns[:3]
            ],
            "next_action": "User clicks video in UI → generates Higgsfield frame → Kling motion"
        }

    def _save_report(self, report: dict):
        """Save daily optimization report"""
        report_path = self.data_dir / "daily_optimization_report.json"
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

    def get_current_batch(self) -> dict:
        """Get current production batch (for UI)"""
        strategy_path = self.data_dir / "production_strategy.json"
        if not strategy_path.exists():
            return None

        with open(strategy_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def get_motion_library(self) -> dict:
        """Get motion library (for UI)"""
        lib_path = self.data_dir / "motion_library.json"
        if not lib_path.exists():
            return {}

        with open(lib_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def get_optimization_report(self) -> dict:
        """Get latest report (for UI dashboard)"""
        report_path = self.data_dir / "daily_optimization_report.json"
        if not report_path.exists():
            return None

        with open(report_path, 'r', encoding='utf-8') as f:
            return json.load(f)


def run_autonomous_daily():
    """Entry point for cron job"""
    try:
        optimizer = AutonomousOptimizer()
        result = optimizer.run_daily_optimization()

        print("\n" + "="*80)
        print("[SUCCESS] Autonomous optimization complete")
        print("="*80)
        print(f"Batch: {result['batch_id']}")
        print(f"Videos ready for generation: {result['videos_ready']}")
        print("\n→ Users can now click videos in UI to generate")

        return result

    except Exception as e:
        print(f"\n[ERROR] Autonomous optimization failed: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    run_autonomous_daily()
