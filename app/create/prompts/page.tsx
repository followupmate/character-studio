import Sidebar from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

export default function PromptsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56">
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border px-8 h-13 flex items-center">
          <h1 className="text-white font-medium text-sm tracking-wide">Prompt Generator</h1>
        </div>
        <div className="p-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Coming soon</p>
          <h2 className="text-2xl font-medium text-white mb-1">Prompt Generator</h2>
          <p className="text-sm text-muted2">
            Generovanie Higgsfield promptov z Character DNA. Dokončuje sa.
          </p>
        </div>
      </main>
    </div>
  );
}
