"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { label: "Dashboard", href: "/", icon: "⬡" },
  { label: "Charaktery", href: "/characters", icon: "◈" },
  { label: "Dnešný deň", href: "/today", icon: "◎" },
  { label: "História", href: "/history", icon: "◷" },
];

const buildNav = [
  { label: "DB Schéma", href: "/schema", icon: "◧" },
  { label: "Setup", href: "/setup", icon: "◪" },
];

export default function Sidebar() {
  const pathname = usePathname();

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
