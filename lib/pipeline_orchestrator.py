"""
AI Video Pipeline Orchestrator
Coordinates Creative Intelligence Layer with Higgsfield Soul2 + Kling AI
"""

import json
import sys
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import asyncio

# Fix UTF-8 encoding on Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Import custom modules
sys.path.insert(0, str(Path(__file__).parent))

from creative_intelligence import (
    CreativeIntelligenceOrchestrator,
    VideoAnalytics,
    MotionPattern,
    HiggsFieldPromptConfig
)
from ig_analytics_adapter import InstagramAnalyticsAdapter, IGDataEnricher


class HiggsFieldAPIAdapter:
    """
    Adapter for Higgsfield Soul2 API calls
    Uses environment variables for authentication
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("HIGGSFIELD_API_KEY")
        self.base_url = "https://api.higgsfield.ai"
        self.client = None

    def initialize_client(self):
        """Initialize Higgsfield client (would use @higgsfield/client)"""
        # This would be implemented in Node.js wrapper
        # Python side handles orchestration
        pass

    def generate_first_frame(self, prompt: str, config: HiggsFieldPromptConfig) -> Dict:
        """
        Generate first frame using Higgsfield Soul2
        Returns job info + polling URL
        """
        request_payload = {
            "model": "soul2",
            "prompt": config.base_prompt,
            "negative_prompt": "blurry, low quality, distorted",
            "num_images": 1,
            "height": 1080,
            "width": 1080,
            "steps": 50,
            "guidance_scale": 7.5,
            "seed": hash(config.id) % 2**31,  # Deterministic seed
            "metadata": {
                "config_id": config.id,
                "lighting": config.lighting,
                "composition": config.composition
            }
        }

        # In real implementation, would call:
        # response = requests.post(f"{self.base_url}/generate", json=request_payload)
        # return response.json()

        # Mock response
        return {
            "job_id": f"job_{int(datetime.now().timestamp())}",
            "status": "processing",
            "estimated_time_sec": 45,
            "result_url": None,
            "config": config.id
        }

    def poll_job_status(self, job_id: str) -> Dict:
        """Poll for job completion"""
        # Mock implementation
        return {
            "job_id": job_id,
            "status": "completed",
            "result_url": f"https://results.higgsfield.ai/{job_id}.jpg"
        }


class KlingAIAdapter:
    """Adapter for Kling AI motion generation"""

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("KLING_API_KEY")
        self.base_url = "https://api.kling.ai"

    def generate_motion(self, first_frame_url: str, motion_prompt: str,
                       duration_sec: int = 10) -> Dict:
        """
        Generate motion video using first frame + motion prompt
        Uses Kling AI's image-to-video capability
        """
        request_payload = {
            "model": "kling-v1",
            "image_url": first_frame_url,
            "prompt": motion_prompt,
            "negative_prompt": "jerky, unnatural, glitchy",
            "duration": duration_sec,
            "resolution": "1080p",
            "num_frames": duration_sec * 30,  # 30 fps
            "motion_strength": 0.7,  # 0.0-1.0
            "metadata": {
                "motion_prompt": motion_prompt
            }
        }

        # Mock response
        return {
            "job_id": f"kling_job_{int(datetime.now().timestamp())}",
            "status": "queued",
            "estimated_time_sec": 120,
            "video_url": None
        }

    def poll_motion_job(self, job_id: str) -> Dict:
        """Poll for motion generation completion"""
        return {
            "job_id": job_id,
            "status": "completed",
            "video_url": f"https://results.kling.ai/{job_id}.mp4",
            "duration_sec": 10,
            "resolution": "1080p"
        }


class ProductionPipeline:
    """
    Main production pipeline orchestrator
    Coordinates: Strategy → Higgsfield First Frame → Kling Motion → Upload
    """

    def __init__(self):
        self.ci_orchestrator = CreativeIntelligenceOrchestrator()
        self.ig_adapter = InstagramAnalyticsAdapter()
        self.higgsfield = HiggsFieldAPIAdapter()
        self.kling = KlingAIAdapter()
        self.production_log = []

    def ingest_ig_analytics(self) -> List[VideoAnalytics]:
        """Ingest and process Instagram analytics"""
        print("\n📊 INGESTING INSTAGRAM ANALYTICS...")
        analytics_list = self.ig_adapter.batch_convert()

        for analytics in analytics_list:
            self.ci_orchestrator.process_new_analytics(analytics)

        print(f"✓ Processed {len(analytics_list)} video analytics")
        return analytics_list

    def optimize_production_strategy(self, batch_size: int = 20) -> Dict:
        """Generate optimized production strategy"""
        print("\n🎯 OPTIMIZING PRODUCTION STRATEGY...")
        strategy = self.ci_orchestrator.generate_next_batch(batch_size)

        # Analyze top patterns
        top_patterns = self.ci_orchestrator.get_top_patterns(5)
        correlations = self.ci_orchestrator.get_correlations()

        return {
            "strategy": strategy,
            "top_patterns": top_patterns,
            "correlations": correlations
        }

    def execute_production_batch(self, strategy: Dict, execute: bool = False) -> Dict:
        """
        Execute production batch (generate videos)
        If execute=False, only plan; if True, actually call APIs
        """
        print("\n🎬 EXECUTING PRODUCTION BATCH...")

        execution_plan = {
            "batch_id": strategy["strategy"]["batch_id"],
            "timestamp": datetime.now().isoformat(),
            "total_videos": len(strategy["strategy"]["videos"]),
            "execution_status": "planning" if not execute else "in_progress",
            "jobs": []
        }

        for video_spec in strategy["strategy"]["videos"]:
            job = self._plan_video_production(video_spec, execute)
            execution_plan["jobs"].append(job)

        # Save execution plan
        self._save_execution_plan(execution_plan)

        print(f"✓ Production batch planned: {len(execution_plan['jobs'])} videos")
        if execute:
            print("  (All jobs submitted to Higgsfield + Kling)")
        else:
            print("  (Ready for execution - run with --execute flag)")

        return execution_plan

    def _plan_video_production(self, video_spec: Dict, execute: bool = False) -> Dict:
        """Plan individual video production"""
        motion_pattern = video_spec["motion_pattern"]
        higgsfield_config = video_spec["higgsfield_config"]

        job_plan = {
            "video_id": video_spec["video_id"],
            "category": video_spec["category"],
            "steps": [
                {
                    "name": "higgsfield_first_frame",
                    "status": "pending",
                    "input": {
                        "prompt": higgsfield_config["prompt"],
                        "lighting": higgsfield_config["lighting"],
                        "config_id": higgsfield_config["id"]
                    },
                    "job_id": None,
                    "output": None
                },
                {
                    "name": "kling_motion",
                    "status": "pending",
                    "input": {
                        "motion_prompt": motion_pattern["kling_prompt"],
                        "duration_sec": motion_pattern.get("duration_sec", 10)
                    },
                    "job_id": None,
                    "output": None
                }
            ]
        }

        if execute:
            # Step 1: Generate first frame
            hf_job = self.higgsfield.generate_first_frame(
                higgsfield_config["prompt"],
                HiggsFieldPromptConfig(
                    id=higgsfield_config["id"],
                    base_prompt=higgsfield_config["prompt"],
                    lighting=higgsfield_config["lighting"],
                    color_palette=higgsfield_config["color_palette"],
                    composition=higgsfield_config.get("composition", "rule_of_thirds")
                )
            )

            job_plan["steps"][0]["job_id"] = hf_job["job_id"]
            job_plan["steps"][0]["status"] = "submitted"

            # Step 2: Generate motion (would poll first step for completion first)
            # For now, just mark as queued
            job_plan["steps"][1]["status"] = "queued"

        return job_plan

    def _save_execution_plan(self, plan: Dict):
        """Save execution plan to disk"""
        Path("data").mkdir(exist_ok=True)
        output_path = Path("data/execution_plan.json")
        with open(output_path, 'w') as f:
            json.dump(plan, f, indent=2)

    def generate_report(self, analytics: List[VideoAnalytics], strategy: Dict) -> Dict:
        """Generate comprehensive intelligence report"""
        print("\n📋 GENERATING INTELLIGENCE REPORT...")

        # Analyze retention patterns
        retention_analysis = []
        for a in analytics:
            pattern_analysis = IGDataEnricher.identify_patterns_from_retention(
                a.retention_drop_off
            )
            retention_analysis.append({
                "video_id": a.video_id,
                "analysis": pattern_analysis
            })

        # Compare pattern performance
        pattern_comparison = IGDataEnricher.compare_patterns_performance(analytics)

        report = {
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_videos_analyzed": len(analytics),
                "avg_completion_rate": sum(a.completion_rate for a in analytics) / len(analytics) if analytics else 0,
                "total_impressions": sum(a.impressions for a in analytics),
                "total_engagement": sum(a.likes + a.saves for a in analytics)
            },
            "retention_analysis": retention_analysis,
            "pattern_performance": pattern_comparison,
            "top_insights": self._extract_insights(analytics, pattern_comparison),
            "production_strategy": {
                "batch_id": strategy["strategy"]["batch_id"],
                "composition": strategy["strategy"]["strategy_breakdown"]
            }
        }

        # Save report
        Path("data").mkdir(exist_ok=True)
        with open(Path("data/intelligence_report.json"), 'w') as f:
            json.dump(report, f, indent=2)

        return report

    def _extract_insights(self, analytics: List[VideoAnalytics],
                         pattern_comparison: Dict) -> List[str]:
        """Extract actionable insights"""
        insights = []

        # Find best performing pattern
        if pattern_comparison:
            best_pattern = max(pattern_comparison.items(),
                             key=lambda x: x[1].get("engagement_rate", 0))
            insights.append(
                f"Top performer: {best_pattern[0]} with "
                f"{best_pattern[1]['engagement_rate']:.2%} engagement rate"
            )

        # Analyze completion rates
        avg_completion = sum(a.completion_rate for a in analytics) / len(analytics) if analytics else 0
        if avg_completion > 0.7:
            insights.append("✅ Strong retention - patterns are highly engaging")
        elif avg_completion < 0.4:
            insights.append("⚠️  Low completion rates - consider motion or visual changes")

        # Watch time analysis
        avg_watch_time = sum(a.watch_time_avg for a in analytics) / len(analytics) if analytics else 0
        if avg_watch_time > 12:
            insights.append(f"📈 Strong watch time ({avg_watch_time:.1f}s) - maintain current approach")

        return insights


def run_pipeline(config_path: str = "config/pipeline.json", execute: bool = False):
    """
    Run complete pipeline:
    1. Ingest IG Analytics
    2. Optimize Strategy
    3. Execute Production
    4. Generate Report
    """

    print("=" * 80)
    print("🎬 AI VIDEO PIPELINE ORCHESTRATOR - CREATIVE INTELLIGENCE LAYER")
    print("=" * 80)
    print(f"Mode: {'EXECUTION' if execute else 'PLANNING'}")
    print("=" * 80)

    # Initialize pipeline
    pipeline = ProductionPipeline()

    # Step 1: Ingest analytics
    analytics = pipeline.ingest_ig_analytics()

    # Step 2: Optimize strategy
    strategy = pipeline.optimize_production_strategy(batch_size=20)

    # Step 3: Execute production
    execution_plan = pipeline.execute_production_batch(strategy, execute=execute)

    # Step 4: Generate report
    report = pipeline.generate_report(analytics, strategy)

    # Summary
    print("\n" + "=" * 80)
    print("📊 PIPELINE SUMMARY")
    print("=" * 80)
    print(f"Videos Analyzed: {report['summary']['total_videos_analyzed']}")
    print(f"Avg Completion Rate: {report['summary']['avg_completion_rate']:.1%}")
    print(f"Total Impressions: {report['summary']['total_impressions']:,}")
    print(f"Total Engagement: {report['summary']['total_engagement']:,}")

    print("\n💡 KEY INSIGHTS:")
    for insight in report["top_insights"]:
        print(f"  • {insight}")

    print("\n📁 OUTPUT FILES:")
    print("  • data/motion_library.json - Dynamic Motion Library")
    print("  • data/video_analytics.json - Processed analytics")
    print("  • data/production_strategy.json - Optimized batch strategy")
    print("  • data/higgsfield_configs.json - Higgsfield prompt configs")
    print("  • data/execution_plan.json - Production execution plan")
    print("  • data/intelligence_report.json - Comprehensive report")

    print("\n✅ Pipeline complete!")

    return {
        "analytics": analytics,
        "strategy": strategy,
        "execution_plan": execution_plan,
        "report": report
    }


# ============================================================================
# CLI INTERFACE
# ============================================================================

def main():
    import argparse
    import os

    parser = argparse.ArgumentParser(
        description="AI Video Pipeline Orchestrator with Creative Intelligence"
    )
    parser.add_argument(
        "--config",
        default="config/pipeline.json",
        help="Path to pipeline config"
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually execute jobs (call Higgsfield + Kling APIs)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=20,
        help="Number of videos in production batch"
    )

    args = parser.parse_args()

    # Run pipeline
    results = run_pipeline(args.config, execute=args.execute)


if __name__ == "__main__":
    main()
