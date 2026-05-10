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
  { step: 1, label: "Štart",      href: "/create" },
  { step: 2, label: "DNA Review", href: "/create/dna" },
  { step: 3, label: "Midjourney", href: "/create/midjourney" },
  { step: 4, label: "Soul ID",    href: "/create/soul" },
  { step: 5, label: "Spustiť",   href: "/create/launch" },
];

const STEP_ICONS = ["①","②","③","④","⑤"];

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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setCompleted(getCompletedSteps());
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Hamburger — mobile only, always on top */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Otvoriť menu"
        className="fixed top-0 left-0 z-[60] lg:hidden w-14 h-13 flex items-center justify-center text-ink hover:text-white text-xl transition-colors"
      >
        ☰
      </button>

      {/* Overlay backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-56 bg-bg2 border-r border-border flex flex-col z-50 transition-transform duration-200 -translate-x-full lg:translate-x-0 ${
          isOpen ? "translate-x-0" : ""
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-6 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-white font-semibold text-sm tracking-wide">
              Character Studio
            </div>
            <div className="text-muted font-mono text-[9px] tracking-widest mt-1">
              // multi-char platform
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Zavrieť menu"
            className="lg:hidden text-muted hover:text-white text-base transition-colors"
          >
            ✕
          </button>
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
    </>
  );
}
