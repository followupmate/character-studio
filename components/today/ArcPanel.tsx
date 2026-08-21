"use client";

import { useState } from "react";
import type { Arc, ArcDayContext } from "@/lib/arcPlanner";

interface ArcPanelProps {
  arc: Arc;
  dayContext: ArcDayContext;
  nextPlannedArc: Arc | null;
  characterId: string;
  onReplan?: () => void;
  onCancel?: () => void;
}

export default function ArcPanel({
  arc,
  dayContext,
  nextPlannedArc,
  characterId,
  onReplan,
  onCancel,
}: ArcPanelProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleReplan = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/characters/arcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: characterId,
          action: "replan",
          arc_id: arc.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to replan arc");
      onReplan?.();
      window.location.reload();
    } catch (error) {
      console.error("Replan failed:", error);
      alert("Replan failed. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Zrušiť arc? Túto akciu nemožno vrátiť.")) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/characters/arcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: characterId,
          action: "cancel",
          arc_id: arc.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to cancel arc");
      onCancel?.();
      window.location.reload();
    } catch (error) {
      console.error("Cancel failed:", error);
      alert("Cancel failed. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const phaseEmoji: Record<string, string> = {
    anticipation: "📦",
    travel: "✈️",
    arrival: "🏨",
    exploration: "🗺️",
    peak: "✨",
    departure: "🚗",
    aftermath: "🏠",
    setup: "🛠️",
    build: "🔨",
  };

  return (
    <div className="bg-bg2 border border-border rounded-md p-5 space-y-4">
      <div>
        <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-2">// Arc</p>
        <div className="space-y-3">
          {/* Arc title and metadata */}
          <div>
            <h3 className="text-lg font-medium text-white mb-1">{arc.title}</h3>
            <p className="text-sm text-muted italic">{arc.premise}</p>
          </div>

          {/* Location and phase */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[11px] text-teal tracking-wider">📍 {dayContext.city}</span>
            <span className="text-border2">·</span>
            <span className="font-mono text-[10px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-wider uppercase">
              Day {dayContext.dayIndex}/{dayContext.dayCount}
            </span>
            <span className="text-border2">·</span>
            <span className="font-mono text-[10px] bg-amber/10 border border-amber/20 text-amber px-2 py-0.5 tracking-wider uppercase">
              {phaseEmoji[dayContext.phase]} {dayContext.phase.replace(/_/g, " ")}
            </span>
          </div>

          {/* Focus for today */}
          <div className="bg-bg3 border border-border rounded px-3 py-2">
            <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-1">// Focus</p>
            <p className="text-sm text-muted2">{dayContext.focus}</p>
          </div>

          {/* Location hint */}
          <div className="bg-bg3 border border-border rounded px-3 py-2">
            <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-1">// Location</p>
            <p className="text-sm text-muted2">{dayContext.locationHint}</p>
          </div>

          {/* Fanvue hook if available */}
          {arc.fanvue_hook && (
            <div className="bg-pink-900/20 border border-pink-500/30 rounded px-3 py-2">
              <p className="font-mono text-[9px] text-pink-400 tracking-widest uppercase mb-1">// Fanvue Hook</p>
              <p className="text-sm text-pink-200">{arc.fanvue_hook}</p>
            </div>
          )}

          {/* Arc type badge */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted tracking-widest uppercase">Type:</span>
            <span className={`font-mono text-[10px] border px-2 py-0.5 rounded tracking-wider uppercase
              ${arc.arc_type === "trip" ? "bg-amber/10 border-amber/20 text-amber" : ""}
              ${arc.arc_type === "home_interlude" ? "bg-teal/10 border-teal/20 text-teal" : ""}
              ${arc.arc_type === "city_event" ? "bg-blue/10 border-blue/20 text-blue" : ""}
              ${arc.arc_type === "visitor" ? "bg-purple/10 border-purple/20 text-purple" : ""}
              ${arc.arc_type === "project" ? "bg-emerald/10 border-emerald/20 text-emerald" : ""}
            `}>
              {arc.arc_type.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>

      {/* Next arc preview if planning stage */}
      {arc.status === "planned" && nextPlannedArc && (
        <div className="bg-bg3 border border-border2 rounded p-3">
          <p className="font-mono text-[9px] text-muted2 tracking-widest uppercase mb-2">// Next Arc (planned)</p>
          <p className="text-sm font-medium text-white mb-1">{nextPlannedArc.title}</p>
          <p className="text-xs text-muted2">{nextPlannedArc.city} · {nextPlannedArc.arc_type}</p>
        </div>
      )}

      {/* Action buttons */}
      {arc.status === "planned" && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleReplan}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-amber/10 border border-amber/20 text-amber rounded text-sm font-medium hover:bg-amber/20 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "..." : "Preplánuj"}
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-red-900/20 border border-red-500/30 text-red-400 rounded text-sm font-medium hover:bg-red-900/30 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "..." : "Zruš"}
          </button>
        </div>
      )}
    </div>
  );
}
