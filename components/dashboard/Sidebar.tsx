"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { label: "Dashboard",       href: "/",           icon: "dashboard" },
  { label: "Charaktery",      href: "/characters",  icon: "person" },
  { label: "Dnešný deň",     href: "/today",        icon: "today" },
  { label: "Publish Queue",   href: "/publish",      icon: "send" },
  { label: "Prompt Knižnica", href: "/prompts",     icon: "library_books" },
  { label: "História",        href: "/history",     icon: "history" },
];

const createSteps = [
  { step: 1, label: "Štart",       href: "/create" },
  { step: 2, label: "DNA Review",  href: "/create/dna" },
  { step: 3, label: "Midjourney",  href: "/create/midjourney" },
  { step: 4, label: "Higgsfield",  href: "/create/higgsfield" },
  { step: 5, label: "Soul ID",     href: "/create/soul" },
  { step: 6, label: "Spustiť",    href: "/create/launch" },
];

const buildNav = [
  { label: "DB Schéma", href: "/schema", icon: "schema" },
  { label: "Setup",     href: "/setup",  icon: "settings" },
];

function getCompletedSteps(): Set<number> {
  const done = new Set<number>();
  try {
    const archetype = localStorage.getItem("selected_archetype");
    const dnaRaw = localStorage.getItem("character_dna");
    const dna = dnaRaw ? JSON.parse(dnaRaw) : null;
    if (archetype || dna?.name) done.add(1);
    if (dna?.name) done.add(2);
    if (dna?.midjourneyPrompt) done.add(3);
    if (dna?.soul_id) done.add(4);
    if (dna?.soul_id) done.add(5);
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
      {/* Hamburger — mobile only */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Otvoriť menu"
        className="fixed top-0 left-0 z-[60] lg:hidden w-14 h-13 flex items-center justify-center text-ink hover:text-white transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">menu</span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-56 bg-surface border-r border-border flex flex-col z-50 transition-transform duration-200 -translate-x-full lg:translate-x-0 ${
          isOpen ? "translate-x-0" : ""
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-6 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-display italic text-[28px] leading-none text-white">
              Character Studio
            </div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-muted mt-1.5 uppercase">
              AI OS
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Zavrieť menu"
            className="lg:hidden text-muted hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          <div className="px-4 py-2 font-mono text-[9px] tracking-[0.15em] text-muted uppercase">
            Overview
          </div>
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.05em] transition-all border-l-2 ${
                  active
                    ? "text-accent bg-surface-low border-accent"
                    : "text-muted2 border-transparent hover:bg-surface-mid hover:text-ink"
                }`}
              >
                <span className="material-symbols-outlined text-[16px] flex-shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

          <div className="px-4 py-2 mt-2 font-mono text-[9px] tracking-[0.15em] text-muted uppercase">
            Create
          </div>
          {createSteps.map(({ step, label, href }) => {
            const active = pathname === href;
            const done = completed.has(step);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.05em] transition-all border-l-2 ${
                  active
                    ? "text-accent bg-surface-low border-accent"
                    : done
                    ? "text-teal border-transparent hover:bg-surface-mid"
                    : "text-muted2 border-transparent hover:bg-surface-mid hover:text-ink"
                }`}
              >
                <span className="font-mono text-[9px] bg-surface-high px-1.5 flex-shrink-0 w-5 text-center">
                  {done && !active ? "✓" : step}
                </span>
                <span className="truncate">{label}</span>
              </Link>
            );
          })}

          <div className="px-4 py-2 mt-2 font-mono text-[9px] tracking-[0.15em] text-muted uppercase">
            Build
          </div>
          {buildNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.05em] transition-all border-l-2 ${
                  active
                    ? "text-accent bg-surface-low border-accent"
                    : "text-muted2 border-transparent hover:bg-surface-mid hover:text-ink"
                }`}
              >
                <span className="material-symbols-outlined text-[16px] flex-shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom status */}
        <div className="p-4 border-t border-border font-mono text-[9px] text-muted leading-relaxed">
          <div className="flex items-center gap-1.5 text-teal mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block flex-shrink-0" />
            <span className="tracking-[0.1em] uppercase">System Active</span>
          </div>
          <div className="text-muted/60">chs_ · Supabase · Vercel</div>
          <div className="text-muted/60">Soul 2 · Seedance 2.0</div>
        </div>
      </aside>
    </>
  );
}
