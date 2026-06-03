"use client";

import { motion } from "motion/react";

interface Props {
  current: number;
  total: number;
  label: string;
}

export default function StepProgress({ current, total, label }: Props) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="mb-6">
      <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-2">
        Krok {current} z {total} — {label}
      </p>
      <div className="h-px bg-border overflow-hidden relative">
        <motion.div
          className="h-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
        />
        {/* Shimmer on the progress bar */}
        <motion.div
          className="absolute top-0 left-0 h-full w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          animate={{ x: ["-32px", `${pct}%`] }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
