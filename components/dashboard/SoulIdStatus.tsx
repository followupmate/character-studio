interface Props {
  soulId?: string | null;
  characterName: string;
}

export default function SoulIdStatus({ soulId }: Props) {
  if (soulId) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-teal flex-shrink-0" />
        <span className="font-mono text-[9px] text-teal">
          Soul: {soulId.slice(0, 8)}...
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0" />
      <span className="font-mono text-[9px] text-amber">Soul ID chýba</span>
    </div>
  );
}
