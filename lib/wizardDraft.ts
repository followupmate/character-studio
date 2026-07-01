// Client helper for wizard draft sync. localStorage stays the primary working
// copy (no change to existing behaviour) — this just mirrors it to Supabase in
// the background so drafts survive closing the browser.

export type WizardStep = "dna" | "midjourney" | "higgsfield" | "soul" | "launch";

export const STEP_ROUTES: Record<WizardStep, string> = {
  dna: "/create/dna",
  midjourney: "/create/midjourney",
  higgsfield: "/create/higgsfield",
  soul: "/create/soul",
  launch: "/create/launch",
};

export interface DraftSummary {
  id: string;
  name: string | null;
  step: WizardStep | string;
  updated_at: string;
}

const DRAFT_ID_KEY = "wizard_draft_id";

// Fire-and-forget mirror to the server. keepalive lets the request finish even
// when it's triggered right before a route change.
export function syncDraft(dna: unknown, step: WizardStep): void {
  try {
    const id = localStorage.getItem(DRAFT_ID_KEY) ?? undefined;
    fetch("/api/characters/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dna, step }),
      keepalive: true,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) localStorage.setItem(DRAFT_ID_KEY, data.id);
      })
      .catch(() => {});
  } catch {}
}

export async function listDrafts(): Promise<DraftSummary[]> {
  try {
    const res = await fetch("/api/characters/draft");
    const data = await res.json();
    return Array.isArray(data.drafts) ? data.drafts : [];
  } catch {
    return [];
  }
}

export async function loadDraft(id: string): Promise<{ dna: unknown; step: string } | null> {
  try {
    const res = await fetch(`/api/characters/draft/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    await fetch("/api/characters/draft", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch {}
  if (localStorage.getItem(DRAFT_ID_KEY) === id) localStorage.removeItem(DRAFT_ID_KEY);
}

export function clearDraftId(): void {
  try { localStorage.removeItem(DRAFT_ID_KEY); } catch {}
}

// Adopt an existing server draft as the active one (used by "Pokračovať" on /create).
export function setDraftId(id: string): void {
  try { localStorage.setItem(DRAFT_ID_KEY, id); } catch {}
}
