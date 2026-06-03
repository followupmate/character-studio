import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import MonetizationClient from "./MonetizationClient";

export const dynamic = "force-dynamic";

export default async function MonetizationPage() {
  const { data: characters } = await supabase
    .from("chs_characters")
    .select("id, name, slug")
    .eq("is_active", true);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Monetizácia</h1>
          <span className="font-mono text-[10px] text-muted">Gated · 1000+ followers</span>
        </div>
        <MonetizationClient characters={characters ?? []} />
      </main>
    </div>
  );
}
