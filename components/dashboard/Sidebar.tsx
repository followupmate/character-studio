"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { label: "Dashboard", href: "/", icon: "⬡" },
  { label: "Charaktery", href: "/characters", icon: "◈" },
  { label: "Dnešný deň", href: "/today", icon: "◎" },
  { label: "História", href: "/history", icon: "◷" },
];

const createSteps = [
  { step: 1, label: "Archetype",       href: "/create" },
  { step: 2, label: "Character DNA",   href: "/create/dna" },
  { step: 3, label: "Soul ID",         href: "/create/soul" },
  { step: 4, label: "Prompt Generator",href: "/create/prompts" },
  { step: 5, label: "Lore Engine",     href: "/create/lore" },
  { step: 6, label: "Content Engine",  href: "/create/content" },
  { step: 7, label: "Social Preview",  href: "/create/social" },
  { step: 8, label: "Spustiť",         href: "/create/launch" },
];

const STEP_ICONS = ["①","②","③","④","⑤","⑥","⑦","⑧"];

const buildNav = [
  { label: "DB Schéma", href: "/schema", icon: "◧" },
  { label: "Setup",     href: "/setup",  icon: "◪" },
];

function getCompletedSteps(): Set<number> {
  const done = new Set<number>();
  try {
    const archetype = localStorage.getItem("selected_archetype");
    const dnaRaw = localStorage.getItem("character_dna");
    const dna = dnaRaw ? JSON.parse(dnaRaw) : null;

    if (archetype || dna?.name) done.add(1);
    if (dna?.name) done.add(2);
    if (dna?.soul_id) done.add(3);
  } catch {}
  return done;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  useEffect(() => {
    setCompleted(getCompletedSteps());
  }, [pathname]);

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-56 bg-bg2 border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <div className="text-white font-semibold text-sm tracking-wide">
          Character Studio
        </div>
        <div className="text-muted font-mono text-[9px] tracking-widest mt-1">
          // multi-char platform
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <div className="px-4 py-2 font-mono text-[8px] tracking-widest text-muted uppercase">
          Overview
        </div>
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-2.5 text-[12.5px] transition-all border-l-2 ${
              pathname === item.href
                ? "text-accent bg-bg3 border-accent"
                : "text-muted2 border-transparent hover:bg-bg3 hover:text-ink"
            }`}
          >
            <span className="text-sm w-4 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="px-4 py-2 mt-2 font-mono text-[8px] tracking-widest text-muted uppercase">
          Create
        </div>
        {createSteps.map(({ step, label, href }) => {
          const active = pathname === href;
          const done = completed.has(step);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-2 text-[12px] transition-all border-l-2 ${
                active
                  ? "text-accent bg-bg3 border-accent"
                  : done
                  ? "text-teal border-transparent hover:bg-bg3"
                  : "text-muted2 border-transparent hover:bg-bg3 hover:text-ink"
              }`}
            >
              <span className="font-mono text-[9px] bg-bg3 px-1.5 rounded flex-shrink-0 w-5 text-center">
                {done && !active ? "✓" : STEP_ICONS[step - 1]}
              </span>
              <span className="truncate">{label}</span>
            </Link>
          );
        })}

        <div className="px-4 py-2 mt-2 font-mono text-[8px] tracking-widest text-muted uppercase">
          Build
        </div>
        {buildNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-2.5 text-[12.5px] transition-all border-l-2 ${
              pathname === item.href
                ? "text-accent bg-bg3 border-accent"
                : "text-muted2 border-transparent hover:bg-bg3 hover:text-ink"
            }`}
          >
            <span className="text-sm w-4 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Bottom status */}
      <div className="p-4 border-t border-border font-mono text-[9px] text-muted leading-relaxed">
        <div className="flex items-center gap-1.5 text-teal mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
          Vivienne — aktívna
        </div>
        <div>chs_ prefix · Supabase</div>
        <div>Higgsfield Ultra</div>
        <div>Vercel Cron · Claude API</div>
      </div>
    </aside>
  );
}
