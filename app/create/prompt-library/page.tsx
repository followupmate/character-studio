"use client";

import Sidebar from "@/components/dashboard/Sidebar";

export default function PromptLibraryPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56 flex flex-col h-screen">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between flex-shrink-0">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Návod — Raven Prompt Library</h1>
          <span className="font-mono text-[9px] text-muted/60 tracking-[0.1em]">260+ promptov · referencia</span>
        </div>
        <iframe
          src="/reference/raven-prompt-library.html"
          title="Raven Prompt Library"
          className="flex-1 w-full border-0"
        />
      </main>
    </div>
  );
}
