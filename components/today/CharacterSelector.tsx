"use client";

import { useRouter } from "next/navigation";
import { Character } from "@/types";

export default function CharacterSelector({
  characters,
  selectedCharId,
}: {
  characters: Character[];
  selectedCharId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedCharId}
      onChange={(e) => {
        const val = e.target.value;
        router.push(val === "all" ? "/today" : `/today?char=${val}`);
      }}
      className="bg-bg3 border border-border2 rounded px-2 py-1 font-mono text-[10px] text-ink focus:outline-none focus:border-accent transition-colors"
    >
      <option value="all">Všetky</option>
      {characters.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
