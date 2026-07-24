import Link from "next/link";
import type { ReactNode } from "react";

export const LEGAL_CONTACT = "madbyno1@gmail.com";
export const LEGAL_OPERATOR = "Marek Černak, Slovakia";

const legalNav = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/data-deletion", label: "Data Deletion" },
];

export function LegalLayout({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto w-full px-6 py-5 flex items-center justify-between gap-4">
          <Link href="/" className="font-display italic text-2xl text-white leading-none">
            Character Studio
          </Link>
          <nav className="hidden sm:flex gap-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            {legalNav.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-accent transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-6 py-14 flex-1">
        <h1 className="font-display text-4xl md:text-5xl text-white mb-2">{title}</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted mb-10">
          Last updated: {updated}
        </p>
        {intro && <p className="text-muted2 leading-relaxed mb-8">{intro}</p>}
        <div className="space-y-5 leading-relaxed text-[15px] text-muted2">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto w-full px-6 py-8 font-mono text-[11px] text-muted flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            {legalNav.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-accent transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="text-muted/70">
            Character Studio · Operated by {LEGAL_OPERATOR} ·{" "}
            <a className="text-accent-blue hover:underline" href={`mailto:${LEGAL_CONTACT}`}>
              {LEGAL_CONTACT}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-2xl text-white pt-4">{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-6 space-y-1.5 marker:text-muted">{children}</ul>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-accent-blue hover:underline">
      {children}
    </a>
  );
}
