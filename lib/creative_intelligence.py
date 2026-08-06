"""
Creative Intelligence Layer for AI Video Pipeline Optimizer
Stack: Higgsfield Soul2 (First Frame) + Kling AI (Motion)
Purpose: Manage and evolve motion library based on Instagram analytics (Watch Time)
"""

import json
import os
from datetime import datetime
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, asdict
from pathlib import Path
import random
from abc import ABC, abstractmethod


@dataclass
class MotionPattern:
    """Representation of a motion pattern in Dynamic Motion Library"""
    id: str
    name: str
    description: str
    kling_prompt: str
    avg_watch_time: float = 0.0
    engagement_score: float = 0.0  # (likes + saves) / impressions
    uses: int = 0
    success_rate: float = 0.0
    created_at: str = None
    last_modified: str = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()
        if self.last_modified is None:
            self.last_modified = datetime.now().isoformat()
        if self.metadata is None:
            self.metadata = {}


@dataclass
class HiggsFieldPromptConfig:
    """Higgsfield Soul2 First Frame prompt optimization"""
    id: str
    base_prompt: str
    lighting: str  # "golden_hour", "soft_studio", "dramatic_backlit", etc.
    color_palette: List[str]  # RGB hex colors
    composition: str  # "centered", "rule_of_thirds", "leading_lines", etc.
    engagement_score: float = 0.0
    paired_motions: List[str] = None  # IDs of paired motion patterns

    def __post_init__(self):
        if self.paired_motions is None:
            self.paired_motions = []


@dataclass
class VideoAnalytics:
    """Instagram analytics for a single video"""
    video_id: str
    timestamp: str
    impressions: int
    watch_time_avg: float  # seconds
    watch_time_total: float
    likes: int
    saves: int
    comments: int
    shares: int
    retention_drop_off: List[float]  # % watched at each 10% interval
    motion_pattern_id: str = None
    higgsfield_prompt_id: str = None
    completion_rate: float = 0.0  # % of video watched


class DynamicMotionLibrary:
    """Manages the evolution of motion patterns based on analytics"""

    def __init__(self, library_path: str = "data/motion_library.json"):
        self.library_path = Path(library_path)
        self.library_path.parent.mkdir(parents=True, exist_ok=True)
        self.patterns: Dict[str, MotionPattern] = {}
        self.load_or_initialize()

    def load_or_initialize(self):
        """Load existing library or create with seed patterns"""
        if self.library_path.exists():
            with open(self.library_path, 'r') as f:
                data = json.load(f)
                self.patterns = {k: MotionPattern(**v) for k, v in data.items()}
        else:
            self._initialize_seed_patterns()
            self.save()

    def _initialize_seed_patterns(self):
        """Initialize with proven motion templates"""
        seed_patterns = [
            MotionPattern(
                id="cinematic_glide_v1",
                name="The Cinematic Glide",
                description="Slow zoom + gentle head rotation, evokes premium cinematography",
                kling_prompt="smooth camera push-in movement, head follows camera trajectory, subtle 15-degree rotation, duration 8 seconds, cinematic timing",
                avg_watch_time=12.5,
                success_rate=0.87,
                engagement_score=0.045,
                metadata={"category": "cinematic", "intensity": "low", "duration_sec": 8}
            ),
            MotionPattern(
                id="natural_glance_v1",
                name="The Natural Glance",
                description="Blink, subtle smile, hair in wind - authentic interaction",
                kling_prompt="natural eye movement with blink, soft smile formation, hair movement suggesting gentle wind, head tilt 5 degrees, very subtle, duration 6 seconds",
                avg_watch_time=10.2,
                success_rate=0.82,
                engagement_score=0.038,
                metadata={"category": "authentic", "intensity": "minimal", "duration_sec": 6}
            ),
            MotionPattern(
                id="editorial_walk_v1",
                name="The Editorial Walk",
                description="Dynamic movement toward camera, high engagement energy",
                kling_prompt="confident walking motion toward camera, gradual increase in scale, shoulder movement with gait, maintain eye contact, editorial pacing, duration 10 seconds",
                avg_watch_time=14.8,
                success_rate=0.91,
                engagement_score=0.062,
                metadata={"category": "dynamic", "intensity": "high", "duration_sec": 10}
            ),
        ]

        for pattern in seed_patterns:
            self.patterns[pattern.id] = pattern

    def add_pattern(self, pattern: MotionPattern) -> str:
        """Add new pattern to library"""
        self.patterns[pattern.id] = pattern
        self.save()
        return pattern.id

    def update_pattern_metrics(self, pattern_id: str, watch_time: float,
                              engagement_score: float, uses: int = 1):
        """Update pattern metrics based on video performance"""
        if pattern_id not in self.patterns:
            return

        pattern = self.patterns[pattern_id]
        # Calculate rolling average
        total_uses = pattern.uses + uses
        pattern.avg_watch_time = (pattern.avg_watch_time * pattern.uses + watch_time * uses) / total_uses
        pattern.engagement_score = (pattern.engagement_score * pattern.uses + engagement_score * uses) / total_uses
        pattern.uses = total_uses
        pattern.success_rate = min(0.99, pattern.avg_watch_time / 20.0)  # Normalize to watch time
        pattern.last_modified = datetime.now().isoformat()
        self.save()

    def get_top_patterns(self, n: int = 5) -> List[MotionPattern]:
        """Get top-performing patterns by success rate"""
        sorted_patterns = sorted(self.patterns.values(),
                               key=lambda p: p.success_rate, reverse=True)
        return sorted_patterns[:n]

    def get_pattern_by_id(self, pattern_id: str) -> Optional[MotionPattern]:
        """Retrieve pattern by ID"""
        return self.patterns.get(pattern_id)

    def save(self):
        """Persist library to disk"""
        with open(self.library_path, 'w') as f:
            data = {k: asdict(v) for k, v in self.patterns.items()}
            json.dump(data, f, indent=2)


class AnalyticalFeedbackLoop:
    """Correlates performance metrics with motion patterns and visual settings"""

    def __init__(self, dml: DynamicMotionLibrary,
                 analytics_path: str = "data/video_analytics.json"):
        self.dml = dml
        self.analytics_path = Path(analytics_path)
        self.analytics_path.parent.mkdir(parents=True, exist_ok=True)
        self.analytics: List[VideoAnalytics] = []
        self.load_analytics()

    def load_analytics(self):
        """Load historical analytics"""
        if self.analytics_path.exists():
            with open(self.analytics_path, 'r') as f:
                data = json.load(f)
                self.analytics = [VideoAnalytics(**item) for item in data]

    def add_analytics(self, analytics: VideoAnalytics):
        """Add video performance data"""
        self.analytics.append(analytics)
        self._update_motion_metrics(analytics)
        self.save_analytics()

    def _update_motion_metrics(self, analytics: VideoAnalytics):
        """Update pattern metrics based on video analytics"""
        if not analytics.motion_pattern_id:
            return

        engagement_score = (analytics.likes + analytics.saves) / max(1, analytics.impressions)
        self.dml.update_pattern_metrics(
            analytics.motion_pattern_id,
            watch_time=analytics.watch_time_avg,
            engagement_score=engagement_score,
            uses=1
        )

    def correlate_visuals_motion(self) -> Dict[str, Any]:
        """Analyze visual-motion correlations"""
        correlations = {}

        for pattern in self.dml.patterns.values():
            related_videos = [v for v in self.analytics
                            if v.motion_pattern_id == pattern.id]

            if not related_videos:
                continue

            avg_completion = sum(v.completion_rate for v in related_videos) / len(related_videos)
            avg_saves = sum(v.saves for v in related_videos) / len(related_videos)

            correlations[pattern.id] = {
                "pattern_name": pattern.name,
                "avg_completion_rate": avg_completion,
                "avg_saves": avg_saves,
                "recommended_lighting": self._infer_lighting(related_videos),
                "recommended_intensity": "high" if avg_saves > 5 else "medium"
            }

        return correlations

    def _infer_lighting(self, videos: List[VideoAnalytics]) -> str:
        """Infer optimal lighting based on high-performing videos"""
        if not videos:
            return "soft_studio"

        avg_engagement = sum((v.likes + v.saves) / max(1, v.impressions)
                           for v in videos) / len(videos)

        if avg_engagement > 0.06:
            return "golden_hour"
        elif avg_engagement > 0.04:
            return "soft_studio"
        else:
            return "dramatic_backlit"

    def save_analytics(self):
        """Persist analytics"""
        with open(self.analytics_path, 'w') as f:
            data = [asdict(a) for a in self.analytics]
            json.dump(data, f, indent=2)


class MotionEvolution:
    """Handles mutation and evolution of motion patterns"""

    def __init__(self, dml: DynamicMotionLibrary):
        self.dml = dml

    def mutate_pattern(self, pattern_id: str, mutation_intensity: float = 0.3) -> MotionPattern:
        """Create evolved version of a successful pattern (30% mutation)"""
        base_pattern = self.dml.get_pattern_by_id(pattern_id)
        if not base_pattern:
            raise ValueError(f"Pattern {pattern_id} not found")

        # Generate mutation ID
        mutation_id = f"{pattern_id}_mut_{int(datetime.now().timestamp())}"

        # Mutation strategies
        mutations = [
            self._speed_variation,
            self._intensity_variation,
            self._timing_variation,
            self._emphasis_shift,
        ]

        mutation_func = random.choice(mutations)
        mutated_prompt = mutation_func(base_pattern.kling_prompt, mutation_intensity)

        evolved = MotionPattern(
            id=mutation_id,
            name=f"{base_pattern.name} (Evolved)",
            description=f"Mutation of {base_pattern.name}",
            kling_prompt=mutated_prompt,
            avg_watch_time=base_pattern.avg_watch_time * random.uniform(0.95, 1.05),
            metadata={**base_pattern.metadata, "parent": pattern_id, "generation": "evolved"}
        )

        self.dml.add_pattern(evolved)
        return evolved

    def _speed_variation(self, prompt: str, intensity: float) -> str:
        """Modify movement speed"""
        speed_factor = 1 + (intensity * random.uniform(-0.2, 0.2))
        speed_keywords = ["slow", "fast", "smooth", "quick", "gradual"]

        for keyword in speed_keywords:
            if keyword in prompt:
                speed_mod = "very " + keyword if speed_factor > 1.1 else keyword
                prompt = prompt.replace(keyword, speed_mod)
                break

        return prompt

    def _intensity_variation(self, prompt: str, intensity: float) -> str:
        """Modify movement intensity"""
        intensity_scale = random.uniform(0.8, 1.2) * intensity
        intensity_terms = {"subtle": "pronounced", "pronounced": "subtle"}

        for old, new in intensity_terms.items():
            if old in prompt:
                prompt = prompt.replace(old, new)
                break

        return prompt

    def _timing_variation(self, prompt: str, intensity: float) -> str:
        """Vary duration by 10-20%"""
        import re

        duration_match = re.search(r'duration (\d+) seconds', prompt)
        if duration_match:
            original_duration = int(duration_match.group(1))
            new_duration = int(original_duration * random.uniform(0.9, 1.1))
            prompt = prompt.replace(
                f"duration {original_duration} seconds",
                f"duration {new_duration} seconds"
            )

        return prompt

    def _emphasis_shift(self, prompt: str, intensity: float) -> str:
        """Shift emphasis to different aspects"""
        emphasis_shifts = {
            "eye movement": "head movement",
            "head movement": "body movement",
            "subtle": "confident",
        }

        for old, new in emphasis_shifts.items():
            if old in prompt:
                prompt = prompt.replace(old, new)
                break

        return prompt


class HiggsFieldOptimizer:
    """Optimize Higgsfield Soul2 prompts based on engagement metrics"""

    def __init__(self, feedback_loop: AnalyticalFeedbackLoop):
        self.feedback_loop = feedback_loop
        self.configs: Dict[str, HiggsFieldPromptConfig] = {}
        self.load_configs()

    def load_configs(self):
        """Load saved Higgsfield configs"""
        config_path = Path("data/higgsfield_configs.json")
        if config_path.exists():
            with open(config_path, 'r') as f:
                data = json.load(f)
                self.configs = {k: HiggsFieldPromptConfig(**v) for k, v in data.items()}

    def create_optimized_prompt(self, base_prompt: str, motion_pattern: MotionPattern,
                               lighting: str = "golden_hour") -> HiggsFieldPromptConfig:
        """Generate optimized Higgsfield prompt paired with motion"""
        config_id = f"config_{int(datetime.now().timestamp())}"

        # Lighting-aware prompt enhancement
        lighting_prompts = {
            "golden_hour": ", golden hour sunlight, warm tones, soft shadows, cinematic glow",
            "soft_studio": ", soft studio lighting, diffused key light, minimal shadows, professional",
            "dramatic_backlit": ", dramatic backlighting, volumetric light, silhouette elements",
            "rim_light": ", rim lighting, edge detail, moody atmosphere",
        }

        enhanced_prompt = base_prompt + lighting_prompts.get(lighting, "")

        # Recommend color palette based on lighting
        color_palettes = {
            "golden_hour": ["#FFB84D", "#D4A574", "#8B6F47", "#FFF8DC"],
            "soft_studio": ["#F5F5DC", "#E8E8E8", "#D0D0D0", "#A9A9A9"],
            "dramatic_backlit": ["#1A1A1A", "#2F2F2F", "#FFD700", "#FF6347"],
            "rim_light": ["#0D0D0D", "#1F1F1F", "#FFA500", "#FFD700"],
        }

        config = HiggsFieldPromptConfig(
            id=config_id,
            base_prompt=enhanced_prompt,
            lighting=lighting,
            color_palette=color_palettes.get(lighting, ["#F5F5DC", "#D3D3D3"]),
            composition="rule_of_thirds",
            paired_motions=[motion_pattern.id]
        )

        self.configs[config_id] = config
        self.save_configs()
        return config

    def save_configs(self):
        """Persist Higgsfield configs"""
        Path("data").mkdir(exist_ok=True)
        with open(Path("data/higgsfield_configs.json"), 'w') as f:
            data = {k: asdict(v) for k, v in self.configs.items()}
            json.dump(data, f, indent=2)


class ProductionStrategyGenerator:
    """Generate next production batch (60% proven + 30% evolution + 10% experiment)"""

    def __init__(self, dml: DynamicMotionLibrary, optimizer: HiggsFieldOptimizer):
        self.dml = dml
        self.optimizer = optimizer

    def generate_batch(self, batch_size: int = 20) -> Dict[str, Any]:
        """Generate optimized production batch strategy"""
        proven_count = int(batch_size * 0.60)  # 60% proven winners
        evolution_count = int(batch_size * 0.30)  # 30% mutations
        experiment_count = batch_size - proven_count - evolution_count  # ~10% experiments

        batch_strategy = {
            "batch_id": f"batch_{int(datetime.now().timestamp())}",
            "timestamp": datetime.now().isoformat(),
            "batch_size": batch_size,
            "strategy_breakdown": {
                "proven": {"target": proven_count, "percentage": 0.60},
                "evolution": {"target": evolution_count, "percentage": 0.30},
                "experiment": {"target": experiment_count, "percentage": 0.10}
            },
            "videos": []
        }

        # Add proven combinations (60%)
        top_patterns = self.dml.get_top_patterns(n=5)
        for i in range(proven_count):
            pattern = top_patterns[i % len(top_patterns)]
            video_spec = self._create_video_spec(
                pattern=pattern,
                category="proven",
                lighting="golden_hour" if pattern.success_rate > 0.85 else "soft_studio"
            )
            batch_strategy["videos"].append(video_spec)

        # Add evolved patterns (30%)
        for i in range(evolution_count):
            parent_pattern = random.choice(top_patterns)
            evolved_pattern = self._evolve_for_production(parent_pattern)
            video_spec = self._create_video_spec(
                pattern=evolved_pattern,
                category="evolution",
                lighting="soft_studio"
            )
            batch_strategy["videos"].append(video_spec)

        # Add experimental combinations (10%)
        for i in range(experiment_count):
            video_spec = self._create_experimental_spec()
            batch_strategy["videos"].append(video_spec)

        self._save_batch_strategy(batch_strategy)
        return batch_strategy

    def _create_video_spec(self, pattern: MotionPattern, category: str, lighting: str) -> Dict:
        """Create video production specification"""
        base_prompt = f"Professional influencer shot, {pattern.name}"
        config = self.optimizer.create_optimized_prompt(base_prompt, pattern, lighting)

        return {
            "video_id": f"{category}_{pattern.id}_{int(datetime.now().timestamp())}",
            "category": category,
            "motion_pattern": {
                "id": pattern.id,
                "name": pattern.name,
                "kling_prompt": pattern.kling_prompt,
                "expected_performance": {
                    "watch_time_avg": pattern.avg_watch_time,
                    "engagement_score": pattern.engagement_score
                }
            },
            "higgsfield_config": {
                "id": config.id,
                "prompt": config.base_prompt,
                "lighting": config.lighting,
                "color_palette": config.color_palette,
                "composition": config.composition
            },
            "production_priority": "high" if category == "proven" else "medium"
        }

    def _evolve_for_production(self, parent_pattern: MotionPattern) -> MotionPattern:
        """Create evolved pattern for production"""
        evolution = MotionEvolution(self.dml)
        return evolution.mutate_pattern(parent_pattern.id)

    def _create_experimental_spec(self) -> Dict:
        """Create random experimental combination"""
        all_patterns = list(self.dml.patterns.values())
        random_pattern = random.choice(all_patterns)

        experimental_lighting = random.choice(["dramatic_backlit", "rim_light", "soft_studio"])
        experimental_prompt = f"Experimental: {random_pattern.description}, {experimental_lighting} lighting"

        config = self.optimizer.create_optimized_prompt(
            experimental_prompt,
            random_pattern,
            experimental_lighting
        )

        return {
            "video_id": f"experiment_{int(datetime.now().timestamp())}",
            "category": "experiment",
            "motion_pattern": {
                "id": random_pattern.id,
                "name": f"{random_pattern.name} (Experimental)",
                "kling_prompt": random_pattern.kling_prompt,
                "expected_performance": {
                    "watch_time_avg": random_pattern.avg_watch_time * random.uniform(0.8, 1.2),
                    "engagement_score": random_pattern.engagement_score * random.uniform(0.7, 1.3)
                }
            },
            "higgsfield_config": {
                "id": config.id,
                "prompt": config.base_prompt,
                "lighting": config.lighting,
                "color_palette": config.color_palette
            },
            "production_priority": "low",
            "risk_level": "high"
        }

    def _save_batch_strategy(self, strategy: Dict):
        """Persist batch strategy"""
        Path("data").mkdir(exist_ok=True)
        output_path = Path("data/production_strategy.json")
        with open(output_path, 'w') as f:
            json.dump(strategy, f, indent=2)

        print(f"✓ Production strategy saved to {output_path}")


class CreativeIntelligenceOrchestrator:
    """Main orchestrator coordinating all modules"""

    def __init__(self):
        self.dml = DynamicMotionLibrary("data/motion_library.json")
        self.feedback_loop = AnalyticalFeedbackLoop(self.dml, "data/video_analytics.json")
        self.optimizer = HiggsFieldOptimizer(self.feedback_loop)
        self.strategy_generator = ProductionStrategyGenerator(self.dml, self.optimizer)

    def process_new_analytics(self, analytics: VideoAnalytics):
        """Process new video analytics and trigger optimizations"""
        self.feedback_loop.add_analytics(analytics)
        print(f"✓ Analytics processed for {analytics.video_id}")

    def generate_next_batch(self, batch_size: int = 20) -> Dict[str, Any]:
        """Generate optimized production batch"""
        print("\n🎬 Generating optimized production batch...")
        print("   Strategy: 60% Proven + 30% Evolution + 10% Experiment")

        strategy = self.strategy_generator.generate_batch(batch_size)

        print(f"\n✓ Batch generated: {strategy['batch_id']}")
        print(f"  Videos: {len(strategy['videos'])}")
        print(f"  Proven: {len([v for v in strategy['videos'] if v['category'] == 'proven'])}")
        print(f"  Evolution: {len([v for v in strategy['videos'] if v['category'] == 'evolution'])}")
        print(f"  Experiment: {len([v for v in strategy['videos'] if v['category'] == 'experiment'])}")

        return strategy

    def get_top_patterns(self, n: int = 5) -> List[Dict]:
        """Get top performing patterns"""
        patterns = self.dml.get_top_patterns(n)
        return [
            {
                "id": p.id,
                "name": p.name,
                "success_rate": p.success_rate,
                "avg_watch_time": p.avg_watch_time,
                "engagement_score": p.engagement_score,
                "uses": p.uses
            }
            for p in patterns
        ]

    def get_correlations(self) -> Dict[str, Any]:
        """Get visual-motion correlations"""
        return self.feedback_loop.correlate_visuals_motion()


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

def demo():
    """Demonstrate the Creative Intelligence Layer"""
    print("=" * 70)
    print("🎭 CREATIVE INTELLIGENCE LAYER - AI Video Pipeline Optimizer")
    print("=" * 70)

    orchestrator = CreativeIntelligenceOrchestrator()

    # Simulate adding video analytics
    print("\n📊 Adding video analytics...")
    sample_analytics = VideoAnalytics(
        video_id="vid_001",
        timestamp=datetime.now().isoformat(),
        impressions=5000,
        watch_time_avg=12.5,
        watch_time_total=62500,
        likes=245,
        saves=89,
        comments=34,
        shares=12,
        retention_drop_off=[100, 95, 88, 75, 62, 48, 35, 22, 10, 3],
        motion_pattern_id="editorial_walk_v1",
        higgsfield_prompt_id="config_001",
        completion_rate=0.75
    )

    orchestrator.process_new_analytics(sample_analytics)

    # Display top patterns
    print("\n⭐ TOP PERFORMING MOTION PATTERNS:")
    for i, pattern in enumerate(orchestrator.get_top_patterns(5), 1):
        print(f"\n  {i}. {pattern['name']}")
        print(f"     Success Rate: {pattern['success_rate']:.2%}")
        print(f"     Avg Watch Time: {pattern['avg_watch_time']:.1f}s")
        print(f"     Engagement: {pattern['engagement_score']:.3f}")
        print(f"     Uses: {pattern['uses']}")

    # Display correlations
    print("\n🔗 VISUAL-MOTION CORRELATIONS:")
    correlations = orchestrator.get_correlations()
    for pattern_id, data in list(correlations.items())[:3]:
        print(f"\n  Pattern: {data['pattern_name']}")
        print(f"    Recommended Lighting: {data['recommended_lighting']}")
        print(f"    Recommended Intensity: {data['recommended_intensity']}")
        print(f"    Avg Completion Rate: {data['avg_completion_rate']:.2%}")

    # Generate production batch
    print("\n")
    batch = orchestrator.generate_next_batch(20)

    # Show batch summary
    print("\n📋 PRODUCTION BATCH SUMMARY:")
    print(f"  Total Videos: {batch['batch_size']}")
    for category, data in batch['strategy_breakdown'].items():
        print(f"  {category.capitalize()}: {data['target']} videos ({data['percentage']:.0%})")


if __name__ == "__main__":
    demo()
