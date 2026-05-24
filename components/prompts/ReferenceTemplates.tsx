"use client";

import { useState } from "react";
import { REFERENCE_PROMPT_TEMPLATES, ReferencePromptTemplate } from "@/lib/referencePrompts";

function TemplateCard({ template }: { template: ReferencePromptTemplate }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <section className="bg-bg2 border border-violet-400/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-4 border-b border-border bg-bg3 flex items-center justify-between hover:bg-surface transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[8px] border px-2 py-0.5 uppercase text-violet-400 border-violet-400/30 bg-violet-400/5 flex-shrink-0">
            {template.tag}
          </span>
          <p className="font-mono text-[11px] text-ink font-medium truncate">{template.title}</p>
        </div>
        <span className="material-symbols-outlined text-[16px] text-muted flex-shrink-0">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && (
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2 p-3 bg-violet-400/5 border border-violet-400/20 rounded">
            <span className="material-symbols-outlined text-[14px] text-violet-400 flex-shrink-0 mt-0.5">info</span>
            <p className="font-mono text-[10px] text-muted2 leading-relaxed">{template.description}</p>
          </div>
          <div className="relative">
            <pre className="font-mono text-[10px] text-muted2 leading-relaxed bg-bg3 border border-border p-4 overflow-x-auto whitespace-pre-wrap max-h-[500px] overflow-y-auto">
              {template.body}
            </pre>
            <button
              onClick={handleCopy}
              className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest border transition-colors ${
                copied
                  ? "border-teal/40 bg-teal/10 text-teal"
                  : "border-border bg-surface text-muted2 hover:border-violet-400/40 hover:text-violet-400"
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">
                {copied ? "check" : "content_copy"}
              </span>
              {copied ? "Skopírované" : "Kopírovať"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ReferenceTemplates() {
  if (REFERENCE_PROMPT_TEMPLATES.length === 0) return null;

  return (
    <div className="space-y-3 mb-8">
      <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase">// Reference templates</p>
      {REFERENCE_PROMPT_TEMPLATES.map((tpl) => (
        <TemplateCard key={tpl.id} template={tpl} />
      ))}
    </div>
  );
}
