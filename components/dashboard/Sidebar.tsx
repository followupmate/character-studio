"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const nav = [
  { label: "Dashboard",       href: "/",            icon: "dashboard" },
  { label: "Charaktery",      href: "/characters",  icon: "person" },
  { label: "Dnešný deň",      href: "/today",       icon: "today" },
  { label: "Review Queue",    href: "/review",      icon: "rate_review",  highlight: true },
  { label: "Growth",          href: "/growth",      icon: "trending_up" },
  { label: "Publish Queue",   href: "/publish",     icon: "send" },
  { label: "História",        href: "/history",     icon: "history" },
];

const referenceNav = [
  { label: "Launch Knižnica", href: "/launch",        icon: "rocket_launch" },
  { label: "Playbook",        href: "/playbook",      icon: "menu_book" },
  { label: "Prompt Knižnica", href: "/prompts",       icon: "library_books" },
  { label: "Monetizácia",     href: "/monetization",  icon: "payments" },
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

const sidebarVariants = {
  hidden: { x: -224, opacity: 0 },
  visible: { x: 0, opacity: 1 },
};

const navContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.15 } },
};

const navItemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } },
};

function NavLink({
  href,
  active,
  highlight,
  children,
}: {
  href: string;
  active: boolean;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={navItemVariants} className="relative">
      {active && (
        <motion.div
          layoutId="activeNavIndicator"
          className="absolute inset-0 bg-surface-low border-l-2 border-accent"
          style={{ borderRadius: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}
      <Link
        href={href}
        className={`relative flex items-center gap-3 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.05em] transition-colors ${
          active
            ? "text-accent"
            : highlight
            ? "text-amber hover:text-amber/80"
            : "text-muted2 hover:text-ink"
        }`}
      >
        {children}
      </Link>
    </motion.div>
  );
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
      <motion.button
        onClick={() => setIsOpen(true)}
        aria-label="Otvoriť menu"
        className="fixed top-0 left-0 z-[60] lg:hidden w-14 h-13 flex items-center justify-center text-ink"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <span className="material-symbols-outlined text-[20px]">menu</span>
      </motion.button>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="backdrop"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 lg:hidden backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      {/* Desktop Sidebar — always mounted, no transform needed */}
      <motion.aside
        className="hidden lg:flex fixed top-0 left-0 bottom-0 w-56 bg-surface border-r border-border flex-col z-50"
        initial="hidden"
        animate="visible"
        variants={sidebarVariants}
      >
        <SidebarContent pathname={pathname} completed={completed} onClose={() => setIsOpen(false)} />
      </motion.aside>

      {/* Mobile Sidebar — AnimatePresence controlled */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="mobile-sidebar"
            className="fixed top-0 left-0 bottom-0 w-56 bg-surface border-r border-border flex flex-col z-50 lg:hidden"
            initial={{ x: -224, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -224, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 32 }}
          >
            <SidebarContent pathname={pathname} completed={completed} onClose={() => setIsOpen(false)} />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarContent({
  pathname,
  completed,
  onClose,
}: {
  pathname: string;
  completed: Set<number>;
  onClose: () => void;
}) {
  return (
    <>
      {/* Logo */}
      <motion.div
        className="px-5 py-6 border-b border-border flex items-center justify-between"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div>
          <div className="font-display italic text-[28px] leading-none text-white">
            Character Studio
          </div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-muted mt-1.5 uppercase">
            AI OS
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Zavrieť menu"
          className="lg:hidden text-muted hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </motion.div>

      {/* Nav */}
      <motion.nav
        className="flex-1 py-2 overflow-y-auto"
        variants={navContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          variants={navItemVariants}
          className="px-4 py-2 font-mono text-[9px] tracking-[0.15em] text-muted/60 uppercase"
        >
          Overview
        </motion.div>
        {nav.map((item) => (
          <NavLink key={item.href} href={item.href} active={pathname === item.href} highlight={"highlight" in item && !!item.highlight}>
            <span className="material-symbols-outlined text-[16px] flex-shrink-0">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        <motion.div
          variants={navItemVariants}
          className="px-4 py-2 mt-2 font-mono text-[9px] tracking-[0.15em] text-muted/60 uppercase"
        >
          Reference
        </motion.div>
        {referenceNav.map((item) => (
          <NavLink key={item.href} href={item.href} active={pathname === item.href}>
            <span className="material-symbols-outlined text-[16px] flex-shrink-0">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        <motion.div
          variants={navItemVariants}
          className="px-4 py-2 mt-2 font-mono text-[9px] tracking-[0.15em] text-muted/60 uppercase"
        >
          Create
        </motion.div>
        {createSteps.map(({ step, label, href }) => {
          const active = pathname === href;
          const done = completed.has(step);
          return (
            <motion.div key={href} variants={navItemVariants} className="relative">
              {active && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="absolute inset-0 bg-surface-low border-l-2 border-accent"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <Link
                href={href}
                className={`relative flex items-center gap-2.5 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.05em] transition-colors ${
                  active ? "text-accent" : done ? "text-teal" : "text-muted2 hover:text-ink"
                }`}
              >
                <span className="font-mono text-[9px] bg-surface-high px-1.5 flex-shrink-0 w-5 text-center">
                  {done && !active ? "✓" : step}
                </span>
                <span className="truncate">{label}</span>
              </Link>
            </motion.div>
          );
        })}

        <motion.div
          variants={navItemVariants}
          className="px-4 py-2 mt-2 font-mono text-[9px] tracking-[0.15em] text-muted/60 uppercase"
        >
          Build
        </motion.div>
        {buildNav.map((item) => (
          <NavLink key={item.href} href={item.href} active={pathname === item.href}>
            <span className="material-symbols-outlined text-[16px] flex-shrink-0">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </motion.nav>

      {/* Bottom status */}
      <motion.div
        className="p-4 border-t border-border font-mono text-[9px] text-muted leading-relaxed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        <div className="flex items-center gap-1.5 text-teal mb-1">
          <motion.span
            className="w-1.5 h-1.5 rounded-full bg-teal inline-block flex-shrink-0"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="tracking-[0.1em] uppercase">System Active</span>
        </div>
        <div className="text-muted/60">chs_ · Supabase · Vercel</div>
        <div className="text-muted/60">Soul 2 · Seedance 2.0</div>
      </motion.div>
    </>
  );
}
