import Sidebar from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

export default function LorePage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56">
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border px-8 h-13 flex items-center">
          <h1 className="text-white font-medium text-sm tracking-wide">Lore Engine</h1>
        </div>
        <div className="p-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Coming soon</p>
          <h2 className="text-2xl font-medium text-white mb-1">Lore Engine</h2>
          <p className="text-sm text-muted2">
            Generovanie backstory, lore a naratívnych oblúkov. Dokončuje sa.
          </p>
        </div>
      </main>
    </div>
  );
}
