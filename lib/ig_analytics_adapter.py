"""
Instagram Analytics Adapter
Converts raw IG API data into VideoAnalytics for Creative Intelligence Layer
"""

import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path
from creative_intelligence import VideoAnalytics


class InstagramAnalyticsAdapter:
    """Parse Instagram analytics and feed into Creative Intelligence Layer"""

    def __init__(self, raw_analytics_path: str = "data/ig_raw_analytics.json"):
        self.raw_analytics_path = Path(raw_analytics_path)
        self.raw_data: List[Dict] = []
        self.load_raw_data()

    def load_raw_data(self):
        """Load raw Instagram API response"""
        if self.raw_analytics_path.exists():
            with open(self.raw_analytics_path, 'r') as f:
                self.raw_data = json.load(f)

    def convert_reels_analytics(self, reel_data: Dict) -> VideoAnalytics:
        """
        Convert Instagram Reels API response to VideoAnalytics
        Expected IG API structure:
        {
            "id": "...",
            "timestamp": "2024-01-15T10:30:00Z",
            "metrics": {
                "impressions": 5000,
                "reaches": 4200,
                "plays": 3800,
                "engagement_rate": 0.045,
                "likes": 225,
                "comments": 34,
                "shares": 12,
                "saves": 89,
                "watch_time_seconds": 62500,
                "average_watch_time": 12.5,
                "retention_graph": [100, 95, 88, 75, 62, 48, 35, 22, 10, 3]
            },
            "content_metadata": {
                "motion_pattern_id": "editorial_walk_v1",
                "higgsfield_prompt_id": "config_001"
            }
        }
        """
        metrics = reel_data.get("metrics", {})
        metadata = reel_data.get("content_metadata", {})

        impressions = metrics.get("impressions", 0)
        plays = metrics.get("plays", impressions)

        # Calculate completion rate (rough estimate from retention)
        retention_graph = metrics.get("retention_graph", [100])
        completion_rate = retention_graph[-1] / 100.0 if retention_graph else 0.0

        analytics = VideoAnalytics(
            video_id=reel_data.get("id", f"vid_{int(datetime.now().timestamp())}"),
            timestamp=reel_data.get("timestamp", datetime.now().isoformat()),
            impressions=impressions,
            watch_time_avg=metrics.get("average_watch_time", 0.0),
            watch_time_total=metrics.get("watch_time_seconds", 0),
            likes=metrics.get("likes", 0),
            saves=metrics.get("saves", 0),
            comments=metrics.get("comments", 0),
            shares=metrics.get("shares", 0),
            retention_drop_off=metrics.get("retention_graph", [100]),
            motion_pattern_id=metadata.get("motion_pattern_id"),
            higgsfield_prompt_id=metadata.get("higgsfield_prompt_id"),
            completion_rate=completion_rate
        )

        return analytics

    def batch_convert(self) -> List[VideoAnalytics]:
        """Convert all raw data to VideoAnalytics"""
        converted = []
        for reel in self.raw_data:
            try:
                analytics = self.convert_reels_analytics(reel)
                converted.append(analytics)
            except KeyError as e:
                print(f"Warning: Skipped reel {reel.get('id')} - missing field {e}")

        return converted

    def add_motion_metadata(self, video_id: str, motion_pattern_id: str,
                           higgsfield_prompt_id: Optional[str] = None):
        """Retroactively add motion pattern info to existing video"""
        for reel in self.raw_data:
            if reel.get("id") == video_id:
                if "content_metadata" not in reel:
                    reel["content_metadata"] = {}
                reel["content_metadata"]["motion_pattern_id"] = motion_pattern_id
                if higgsfield_prompt_id:
                    reel["content_metadata"]["higgsfield_prompt_id"] = higgsfield_prompt_id
                self.save_raw_data()
                return True

        return False

    def save_raw_data(self):
        """Persist raw data"""
        self.raw_analytics_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.raw_analytics_path, 'w') as f:
            json.dump(self.raw_data, f, indent=2)

    @staticmethod
    def create_sample_ig_response() -> Dict:
        """Generate sample Instagram API response for testing"""
        return {
            "id": "17958647847123456",
            "timestamp": datetime.now().isoformat(),
            "metrics": {
                "impressions": 5420,
                "reaches": 4850,
                "plays": 4200,
                "engagement_rate": 0.048,
                "likes": 260,
                "comments": 42,
                "shares": 15,
                "saves": 103,
                "watch_time_seconds": 62800,
                "average_watch_time": 14.2,
                "retention_graph": [100, 96, 91, 82, 71, 58, 44, 30, 16, 5]
            },
            "content_metadata": {
                "motion_pattern_id": "editorial_walk_v1",
                "higgsfield_prompt_id": "config_001"
            }
        }


class IGDataEnricher:
    """Enrich IG data with motion pattern correlations"""

    @staticmethod
    def identify_patterns_from_retention(retention_graph: List[int]) -> Dict[str, Any]:
        """
        Analyze retention curve to infer motion pattern characteristics:
        - Steep drop-off: Static/boring pattern
        - Gradual decline: Engaging, consistent pattern
        - Valley shape: Hook pattern that drops then stabilizes
        """
        if not retention_graph or len(retention_graph) < 3:
            return {}

        drops = [retention_graph[i] - retention_graph[i+1]
                for i in range(len(retention_graph)-1)]

        avg_drop = sum(drops) / len(drops)
        max_drop = max(drops)

        analysis = {
            "pattern_type": None,
            "engagement_level": None,
            "risk_factors": []
        }

        # Classify pattern
        if max_drop > 25:
            analysis["pattern_type"] = "hook_pattern"
            analysis["risk_factors"].append("Early drop-off - possibly weak hook")
        elif avg_drop < 8:
            analysis["pattern_type"] = "steady_engagement"
        else:
            analysis["pattern_type"] = "gradual_decline"

        # Engagement level
        if retention_graph[-1] > 40:
            analysis["engagement_level"] = "high"
        elif retention_graph[-1] > 20:
            analysis["engagement_level"] = "medium"
        else:
            analysis["engagement_level"] = "low"
            analysis["risk_factors"].append("Poor retention - pattern may be ineffective")

        return analysis

    @staticmethod
    def compare_patterns_performance(analytics_list: List[VideoAnalytics]) -> Dict:
        """Compare performance across videos with different motion patterns"""
        pattern_stats = {}

        for analytics in analytics_list:
            pattern_id = analytics.motion_pattern_id
            if not pattern_id:
                continue

            if pattern_id not in pattern_stats:
                pattern_stats[pattern_id] = {
                    "count": 0,
                    "total_watch_time": 0,
                    "total_saves": 0,
                    "total_likes": 0,
                    "total_impressions": 0,
                    "videos": []
                }

            pattern_stats[pattern_id]["count"] += 1
            pattern_stats[pattern_id]["total_watch_time"] += analytics.watch_time_avg
            pattern_stats[pattern_id]["total_saves"] += analytics.saves
            pattern_stats[pattern_id]["total_likes"] += analytics.likes
            pattern_stats[pattern_id]["total_impressions"] += analytics.impressions
            pattern_stats[pattern_id]["videos"].append(analytics.video_id)

        # Calculate averages
        for pattern_id, stats in pattern_stats.items():
            count = stats["count"]
            stats["avg_watch_time"] = stats["total_watch_time"] / count
            stats["avg_saves"] = stats["total_saves"] / count
            stats["avg_likes"] = stats["total_likes"] / count
            stats["save_rate"] = stats["total_saves"] / max(1, stats["total_impressions"])
            stats["engagement_rate"] = (stats["total_likes"] + stats["total_saves"]) / \
                                      max(1, stats["total_impressions"])

        return pattern_stats


def demo_ig_adapter():
    """Demonstrate IG Analytics Adapter"""
    print("=" * 70)
    print("📱 INSTAGRAM ANALYTICS ADAPTER")
    print("=" * 70)

    # Create sample data
    adapter = InstagramAnalyticsAdapter()

    # Add sample reels
    print("\n📥 Loading sample Instagram data...")
    sample_reels = [
        InstagramAnalyticsAdapter.create_sample_ig_response(),
        {
            "id": "17958647847654321",
            "timestamp": datetime.now().isoformat(),
            "metrics": {
                "impressions": 3200,
                "reaches": 2900,
                "plays": 2100,
                "likes": 145,
                "comments": 18,
                "shares": 5,
                "saves": 42,
                "watch_time_seconds": 30600,
                "average_watch_time": 8.5,
                "retention_graph": [100, 70, 50, 35, 22, 15, 10, 7, 4, 2]
            },
            "content_metadata": {
                "motion_pattern_id": "natural_glance_v1",
                "higgsfield_prompt_id": "config_002"
            }
        }
    ]

    adapter.raw_data = sample_reels
    adapter.save_raw_data()

    # Convert to analytics
    analytics_list = adapter.batch_convert()
    print(f"✓ Converted {len(analytics_list)} reels to VideoAnalytics")

    # Analyze retention patterns
    print("\n📈 RETENTION PATTERN ANALYSIS:")
    for analytics in analytics_list:
        analysis = IGDataEnricher.identify_patterns_from_retention(
            analytics.retention_drop_off
        )
        print(f"\n  Video: {analytics.video_id}")
        print(f"    Pattern Type: {analysis.get('pattern_type', 'unknown')}")
        print(f"    Engagement Level: {analysis.get('engagement_level', 'unknown')}")
        if analysis.get('risk_factors'):
            for risk in analysis['risk_factors']:
                print(f"    ⚠️  {risk}")

    # Compare pattern performance
    print("\n🔬 PATTERN PERFORMANCE COMPARISON:")
    pattern_comparison = IGDataEnricher.compare_patterns_performance(analytics_list)
    for pattern_id, stats in pattern_comparison.items():
        print(f"\n  Pattern: {pattern_id}")
        print(f"    Videos: {stats['count']}")
        print(f"    Avg Watch Time: {stats['avg_watch_time']:.1f}s")
        print(f"    Avg Saves: {stats['avg_saves']:.1f}")
        print(f"    Save Rate: {stats['save_rate']:.2%}")
        print(f"    Engagement Rate: {stats['engagement_rate']:.2%}")


if __name__ == "__main__":
    demo_ig_adapter()
