"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Character = {
  id: string;
  name: string;
  slug: string;
  posting_time: string;
  platforms: string[];
};

type StoryDayOption = {
  id: string;
  date: string;
  location: string;
  mood: string;
  narrative: string;
  ig_caption: string | null;
  hashtags: string[] | null;
};

type QueuePost = {
  id: string;
  platform: string;
  status: string;
  scheduled_at: string | null;
  posted_at: string | null;
  ig_caption: string | null;
  yt_title: string | null;
  character_id: string | null;
  chs_characters: { name: string; slug: string } | null;
  chs_media: { type: string; media_url: string | null } | null;
};

type Toast = { ok: boolean; msg: string };
type PostType = "single" | "carousel";
type CaptionSource = "story_day" | "generated" | null;

const STATUS_STYLES: Record<string, string> = {
  scheduled: "text-amber border-amber/30 bg-amber/10",
  posted: "text-teal border-teal/30 bg-teal/10",
  failed: "text-red-400 border-red-400/30 bg-red-400/10",
};

function formatStoryDayLabel(sd: StoryDayOption): string {
  const date = new Date(sd.date);
  const months = [
    "januára","februára","marca","apríla","mája","júna",
    "júla","augusta","septembra","októbra","novembra","decembra",
  ];
  return `${date.getDate()}. ${months[date.getMonth()]} — ${sd.location} · ${sd.mood}`;
}

function FileInput({
  label,
  accept,
  file,
  onChange,
}: {
  label: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">{label}</p>
      <div
        className="border border-border bg-bg3 px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:border-border-strong transition-colors"
        onClick={() => ref.current?.click()}
      >
        <span className="material-symbols-outlined text-[16px] text-muted flex-shrink-0">
          {file ? "check_circle" : "upload_file"}
        </span>
        <span className="font-mono text-[11px] text-muted2 truncate">
          {file ? file.name : "Vyber súbor..."}
        </span>
        {file && (
          <button
            className="ml-auto text-muted hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              if (ref.current) ref.current.value = "";
            }}
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function CarouselFileInput({
  index,
  file,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  file: File | null;
  onChange: (f: File | null) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] text-muted w-4 flex-shrink-0">{index + 1}.</span>
      <div
        className="flex-1 border border-border bg-bg3 px-3 py-2 flex items-center gap-2 cursor-pointer hover:border-border-strong transition-colors"
        onClick={() => ref.current?.click()}
      >
        <span className="material-symbols-outlined text-[14px] text-muted flex-shrink-0">
          {file ? "check_circle" : "upload_file"}
        </span>
        <span className="font-mono text-[11px] text-muted2 truncate">
          {file ? file.name : "Fotka / video..."}
        </span>
        {file && (
          <button
            className="ml-auto text-muted hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              if (ref.current) ref.current.value = "";
            }}
          >
            <span className="material-symbols-outlined text-[12px]">close</span>
          </button>
        )}
      </div>
      {canRemove && (
        <button
          onClick={onRemove}
          className="text-muted hover:text-red-400 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">remove_circle</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function ToastBar({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 border font-mono text-[11px] shadow-lg transition-all ${
        toast.ok
          ? "bg-teal/10 border-teal/40 text-teal"
          : "bg-red-500/10 border-red-500/40 text-red-400"
      }`}
    >
      <span className="material-symbols-outlined text-[16px]">
        {toast.ok ? "check_circle" : "error"}
      </span>
      {toast.msg}
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>
  );
}

export default function PublishClient({
  characters,
  initialQueue,
}: {
  characters: Character[];
  initialQueue: QueuePost[];
}) {
  // Character + platform
  const [charId, setCharId] = useState(characters[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<Set<string>>(new Set(["instagram"]));

  // Post type
  const [postType, setPostType] = useState<PostType>("single");

  // Single post files
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);

  // Carousel files
  const [carouselFiles, setCarouselFiles] = useState<(File | null)[]>([null, null]);

  // Story day
  const [storyDays, setStoryDays] = useState<StoryDayOption[]>([]);
  const [storyDayId, setStoryDayId] = useState<string>("");

  // Caption state
  const [igCaption, setIgCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [ytDescription, setYtDescription] = useState("");
  const [captionReady, setCaptionReady] = useState(false);
  const [captionSource, setCaptionSource] = useState<CaptionSource>(null);

  // Schedule
  const [scheduledAt, setScheduledAt] = useState(() => {
    const char = characters[0];
    if (!char) return "";
    return defaultScheduledAt(char.posting_time);
  });

  // UI state
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [queue, setQueue] = useState<QueuePost[]>(initialQueue);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((ok: boolean, msg: string) => setToast({ ok, msg }), []);

  // Fetch story days when character changes
  useEffect(() => {
    if (!charId) return;
    setStoryDayId("");
    fetch(`/api/publish/story-days?character_id=${charId}`)
      .then((r) => r.json())
      .then((data) => setStoryDays(Array.isArray(data) ? data : []))
      .catch(() => setStoryDays([]));
  }, [charId]);

  // Update default scheduled time when character changes
  useEffect(() => {
    const char = characters.find((c) => c.id === charId);
    if (char) setScheduledAt(defaultScheduledAt(char.posting_time));
  }, [charId, characters]);

  const refreshQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/publish/queue");
      const data = await res.json();
      setQueue(data.posts ?? []);
    } catch {}
  }, []);

  const generateCaption = async () => {
    if (!charId || platforms.size === 0) {
      showToast(false, "Vyber charakter a platformu");
      return;
    }
    setGenerating(true);
    try {
      const hasVideo =
        postType === "single"
          ? !!videoFile
          : carouselFiles.some((f) => f?.type.startsWith("video/"));
      const contentType = hasVideo ? "video" : "photo";

      const res = await fetch("/api/publish/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: charId,
          platforms: Array.from(platforms),
          content_type: contentType,
          ...(storyDayId ? { story_day_id: storyDayId } : {}),
        }),
      });
      if (!res.ok) throw new Error("API error " + res.status);
      const data = await res.json();
      setIgCaption(data.ig_caption ?? "");
      setHashtags((data.hashtags ?? []).join(" "));
      setYtTitle(data.yt_title ?? "");
      setYtDescription(data.yt_description ?? "");
      setCaptionReady(true);
      setCaptionSource(data.source ?? "generated");
      showToast(true, "Caption vygenerovaný");
    } catch (e) {
      showToast(false, "Chyba: " + String(e));
    } finally {
      setGenerating(false);
    }
  };

  // ── Single post submit ──────────────────────────────────────────────
  const handleSingleSubmit = async (postNow: boolean) => {
    const files: Array<{ key: string; file: File; path: string }> = [];
    const ts = Date.now();

    if (videoFile) files.push({ key: "video", file: videoFile, path: `${charId}/${ts}_video.mp4` });
    if (photo1) {
      const ext = photo1.name.split(".").pop() ?? "jpg";
      files.push({ key: "photo1", file: photo1, path: `${charId}/${ts}_photo1.${ext}` });
    }
    if (photo2) {
      const ext = photo2.name.split(".").pop() ?? "jpg";
      files.push({ key: "photo2", file: photo2, path: `${charId}/${ts}_photo2.${ext}` });
    }

    if (files.length === 0) { showToast(false, "Nahraj aspoň jeden súbor"); return; }
    if (platforms.size === 0) { showToast(false, "Vyber aspoň jednu platformu"); return; }

    setUploading(true);
    try {
      setUploadMsg("Generujem upload URL…");
      const signRes = await fetch("/api/publish/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          files.map((f) => ({ path: f.path, contentType: f.file.type || "application/octet-stream" }))
        ),
      });
      if (!signRes.ok) throw new Error("Sign-upload failed");
      const signedUrls: Array<{ path: string; signedUrl: string }> = await signRes.json();

      for (let i = 0; i < files.length; i++) {
        setUploadMsg(`Nahrávam ${files[i].file.name} (${i + 1}/${files.length})…`);
        const uploadRes = await fetch(signedUrls[i].signedUrl, {
          method: "PUT",
          body: files[i].file,
          headers: { "Content-Type": files[i].file.type || "application/octet-stream" },
        });
        if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      setUploadMsg("Vytváram záznamy…");
      const filePaths: Record<string, string> = {};
      files.forEach((f, i) => { filePaths[f.key] = signedUrls[i].path; });

      const schedRes = await fetch("/api/publish/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: charId,
          platforms: Array.from(platforms),
          scheduled_at: postNow ? new Date().toISOString() : scheduledAt,
          ig_caption: igCaption,
          hashtags: hashtags.split(/\s+/).filter(Boolean),
          yt_title: ytTitle,
          yt_description: ytDescription,
          file_paths: filePaths,
          post_now: postNow,
        }),
      });
      const schedData = await schedRes.json();
      if (!schedData.success) throw new Error(schedData.error ?? "Schedule failed");

      showToast(true, postNow ? "Post odoslaný!" : "Post naplánovaný");
      resetForm();
      await refreshQueue();
    } catch (e) {
      showToast(false, String(e));
    } finally {
      setUploading(false);
      setUploadMsg("");
    }
  };

  // ── Carousel submit ─────────────────────────────────────────────────
  const handleCarouselSubmit = async (postNow: boolean) => {
    const activeFiles = carouselFiles.filter((f): f is File => f !== null);
    if (activeFiles.length < 2) { showToast(false, "Carousel vyžaduje aspoň 2 položky"); return; }
    if (activeFiles.length > 10) { showToast(false, "Carousel podporuje max 10 položiek"); return; }

    const videoCount = activeFiles.filter((f) => f.type.startsWith("video/")).length;
    if (videoCount > 1) { showToast(false, "Carousel môže obsahovať max 1 video"); return; }

    setUploading(true);
    try {
      const ts = Date.now();
      const fileList = activeFiles.map((file, i) => {
        const ext = file.name.split(".").pop() ?? "jpg";
        const typePrefix = file.type.startsWith("video/") ? "video" : "photo";
        return { file, path: `${charId}/${ts}_carousel_${i}_${typePrefix}.${ext}` };
      });

      setUploadMsg("Generujem upload URL…");
      const signRes = await fetch("/api/publish/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          fileList.map((f) => ({ path: f.path, contentType: f.file.type || "application/octet-stream" }))
        ),
      });
      if (!signRes.ok) throw new Error("Sign-upload failed");
      const signedUrls: Array<{ path: string; signedUrl: string }> = await signRes.json();

      for (let i = 0; i < fileList.length; i++) {
        setUploadMsg(`Nahrávam ${fileList[i].file.name} (${i + 1}/${fileList.length})…`);
        const uploadRes = await fetch(signedUrls[i].signedUrl, {
          method: "PUT",
          body: fileList[i].file,
          headers: { "Content-Type": fileList[i].file.type || "application/octet-stream" },
        });
        if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      // Create file_paths object (photo1..photoN + optional video)
      setUploadMsg("Vytváram záznamy…");
      const file_paths: Record<string, string> = {};
      fileList.forEach((f, i) => {
        const key = f.file.type.startsWith("video/") ? "video" : `photo${i + 1}`;
        file_paths[key] = signedUrls[i].path;
      });

      const schedRes = await fetch("/api/publish/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: charId,
          platforms: ["instagram"],
          scheduled_at: postNow ? new Date().toISOString() : scheduledAt,
          ig_caption: igCaption,
          hashtags: hashtags.split(/\s+/).filter(Boolean),
          yt_title: "",
          yt_description: "",
          file_paths,
          post_now: false, // handled below for carousel
        }),
      });
      const schedData = await schedRes.json();
      if (!schedData.success) throw new Error(schedData.error ?? "Schedule failed");

      if (postNow) {
        setUploadMsg("Posielam carousel na Instagram…");
        const carouselRes = await fetch("/api/publish/post-instagram-carousel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_ids: schedData.media_ids,
            caption: igCaption,
            hashtags: hashtags.split(/\s+/).filter(Boolean),
            character_id: charId,
          }),
        });
        const carouselData = await carouselRes.json();
        if (!carouselData.success) throw new Error(carouselData.error ?? "Carousel post failed");
        showToast(true, "Carousel odoslaný na Instagram!");
      } else {
        showToast(true, "Carousel naplánovaný");
      }

      resetForm();
      await refreshQueue();
    } catch (e) {
      showToast(false, String(e));
    } finally {
      setUploading(false);
      setUploadMsg("");
    }
  };

  const handleSubmit = (postNow: boolean) => {
    if (postType === "carousel") {
      handleCarouselSubmit(postNow);
    } else {
      handleSingleSubmit(postNow);
    }
  };

  const resetForm = () => {
    setVideoFile(null);
    setPhoto1(null);
    setPhoto2(null);
    setCarouselFiles([null, null]);
    setCaptionReady(false);
    setCaptionSource(null);
    setIgCaption("");
    setHashtags("");
    setYtTitle("");
    setYtDescription("");
    setStoryDayId("");
  };

  const cancelPost = async (postId: string) => {
    try {
      await fetch("/api/publish/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      await refreshQueue();
      showToast(true, "Post zrušený");
    } catch {
      showToast(false, "Chyba pri rušení postu");
    }
  };

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  };

  const selectedChar = characters.find((c) => c.id === charId);
  const hasFiles =
    postType === "single"
      ? !!(videoFile || photo1 || photo2)
      : carouselFiles.filter(Boolean).length >= 2;

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-4xl">
      {/* ── Section A: Upload & Prepare ────────────────────────── */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[16px] text-muted">upload</span>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase">
            // Upload &amp; Prepare
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Character + Platforms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">
                Vyber charakter
              </p>
              <select
                value={charId}
                onChange={(e) => setCharId(e.target.value)}
                className="w-full bg-bg3 border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent"
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">
                Platforma
              </p>
              <div className="flex gap-2 pt-0.5">
                {(postType === "carousel" ? ["instagram"] : ["instagram", "youtube"]).map((p) => (
                  <button
                    key={p}
                    onClick={() => postType !== "carousel" && togglePlatform(p)}
                    className={`flex items-center gap-2 px-3 py-2 border font-mono text-[11px] uppercase tracking-wider transition-all ${
                      platforms.has(p) || postType === "carousel"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg3 text-muted hover:border-border-strong"
                    } ${postType === "carousel" ? "cursor-default" : ""}`}
                  >
                    <span
                      className={`w-3 h-3 border flex-shrink-0 flex items-center justify-center ${
                        platforms.has(p) || postType === "carousel" ? "border-accent bg-accent" : "border-border"
                      }`}
                    >
                      {(platforms.has(p) || postType === "carousel") && (
                        <span className="material-symbols-outlined text-[10px] text-bg">check</span>
                      )}
                    </span>
                    {p === "instagram" ? "IG" : "YT"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Post type toggle */}
          <div>
            <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">
              Typ postu
            </p>
            <div className="flex gap-2">
              {(["single", "carousel"] as PostType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setPostType(t)}
                  className={`flex items-center gap-2 px-3 py-2 border font-mono text-[11px] uppercase tracking-wider transition-all ${
                    postType === t
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-bg3 text-muted hover:border-border-strong"
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {t === "single" ? "crop_square" : "view_carousel"}
                  </span>
                  {t === "single" ? "Jednotlivý" : "Carousel"}
                </button>
              ))}
            </div>
          </div>

          {/* File inputs — single */}
          {postType === "single" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FileInput
                label="Nahraj video (MP4, max 500 MB)"
                accept="video/mp4,video/quicktime"
                file={videoFile}
                onChange={setVideoFile}
              />
              <FileInput
                label="Nahraj foto 1 (JPEG/PNG)"
                accept="image/jpeg,image/png,image/webp"
                file={photo1}
                onChange={setPhoto1}
              />
              <FileInput
                label="Nahraj foto 2 (JPEG/PNG)"
                accept="image/jpeg,image/png,image/webp"
                file={photo2}
                onChange={setPhoto2}
              />
            </div>
          )}

          {/* File inputs — carousel */}
          {postType === "carousel" && (
            <div className="space-y-2">
              <p className="font-mono text-[9px] tracking-widest text-muted uppercase">
                Položky carouselu (2–10, max 1 video)
              </p>
              <div className="space-y-1.5">
                {carouselFiles.map((file, i) => (
                  <CarouselFileInput
                    key={i}
                    index={i}
                    file={file}
                    onChange={(f) =>
                      setCarouselFiles((prev) => prev.map((v, idx) => (idx === i ? f : v)))
                    }
                    onRemove={() =>
                      setCarouselFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    canRemove={carouselFiles.length > 2}
                  />
                ))}
              </div>
              {carouselFiles.length < 10 && (
                <button
                  onClick={() => setCarouselFiles((prev) => [...prev, null])}
                  className="flex items-center gap-1.5 font-mono text-[10px] text-muted hover:text-accent transition-colors mt-1"
                >
                  <span className="material-symbols-outlined text-[14px]">add_circle</span>
                  Pridať položku
                </button>
              )}
              <p className="font-mono text-[9px] text-muted">
                {carouselFiles.filter(Boolean).length} / {carouselFiles.length} nahratých
              </p>
            </div>
          )}

          {/* Story day selector */}
          {storyDays.length > 0 && (
            <div>
              <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">
                Dnešný deň / Príbeh (optional)
              </p>
              <select
                value={storyDayId}
                onChange={(e) => setStoryDayId(e.target.value)}
                className="w-full bg-bg3 border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent"
              >
                <option value="">— Bez príbehu —</option>
                {storyDays.map((sd) => (
                  <option key={sd.id} value={sd.id}>
                    {formatStoryDayLabel(sd)}
                    {sd.ig_caption ? " ✓" : ""}
                  </option>
                ))}
              </select>
              {storyDayId && (
                <p className="font-mono text-[9px] text-muted mt-1">
                  {storyDays.find((s) => s.id === storyDayId)?.ig_caption
                    ? "Caption z príbehu bude použitý priamo"
                    : "Claude vygeneruje caption na základe príbehu"}
                </p>
              )}
            </div>
          )}

          {/* Generate caption */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={generateCaption}
              disabled={generating || !charId}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent/10 border border-accent/40 text-accent font-mono text-[11px] uppercase tracking-wider hover:bg-accent/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <span className="w-3 h-3 border border-accent border-t-transparent animate-spin rounded-full" />
                  Generujem…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                  Generuj caption
                </>
              )}
            </button>
            {captionReady && (
              <span
                className={`font-mono text-[10px] flex items-center gap-1 ${
                  captionSource === "story_day" ? "text-amber" : "text-teal"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {captionSource === "story_day" ? "menu_book" : "auto_awesome"}
                </span>
                {captionSource === "story_day" ? "Z príbehu" : "Generované"}
              </span>
            )}
          </div>

          {/* Generated caption fields */}
          {captionReady && (
            <div className="space-y-4 pt-2 border-t border-border">
              {(postType === "single" ? platforms.has("instagram") : true) && (
                <>
                  <div>
                    <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">
                      IG caption
                    </p>
                    <textarea
                      value={igCaption}
                      onChange={(e) => setIgCaption(e.target.value)}
                      rows={4}
                      className="w-full bg-bg3 border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent resize-y"
                    />
                    <p className="font-mono text-[9px] text-muted mt-1">{igCaption.length} znakov</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">
                      Hashtags (oddelené medzerou, bez #)
                    </p>
                    <textarea
                      value={hashtags}
                      onChange={(e) => setHashtags(e.target.value)}
                      rows={3}
                      className="w-full bg-bg3 border border-border text-muted font-mono text-[11px] px-3 py-2.5 focus:outline-none focus:border-accent resize-y"
                    />
                    <p className="font-mono text-[9px] text-muted mt-1">
                      {hashtags.split(/\s+/).filter(Boolean).length} hashtagov
                    </p>
                  </div>
                </>
              )}

              {postType === "single" && platforms.has("youtube") && (
                <>
                  <div>
                    <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">
                      YT title (max 70 znakov)
                    </p>
                    <input
                      type="text"
                      value={ytTitle}
                      onChange={(e) => setYtTitle(e.target.value)}
                      maxLength={70}
                      className="w-full bg-bg3 border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent"
                    />
                    <p className="font-mono text-[9px] text-muted mt-1">{ytTitle.length}/70</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">
                      YT description (300–400 znakov)
                    </p>
                    <textarea
                      value={ytDescription}
                      onChange={(e) => setYtDescription(e.target.value)}
                      rows={4}
                      className="w-full bg-bg3 border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent resize-y"
                    />
                    <p className="font-mono text-[9px] text-muted mt-1">{ytDescription.length} znakov</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Section B: Schedule ─────────────────────────────────── */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[16px] text-muted">schedule</span>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Schedule</p>
        </div>

        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1">
              <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">
                Dátum a čas
              </p>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full bg-bg3 border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent"
              />
              {selectedChar && (
                <p className="font-mono text-[9px] text-muted mt-1">
                  Default posting time: {selectedChar.posting_time}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSubmit(true)}
                disabled={uploading || !hasFiles}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal/10 border border-teal/40 text-teal font-mono text-[11px] uppercase tracking-wider hover:bg-teal/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">send</span>
                Postni teraz
              </button>
              {postType === "single" && (
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={uploading || !hasFiles || !scheduledAt}
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent/10 border border-accent/40 text-accent font-mono text-[11px] uppercase tracking-wider hover:bg-accent/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">event</span>
                  Naplánuj
                </button>
              )}
            </div>
          </div>

          {postType === "carousel" && (
            <p className="font-mono text-[9px] text-muted mt-3">
              // Carousel: dostupná len okamžitá publikácia
            </p>
          )}

          {uploading && (
            <div className="mt-4 flex items-center gap-3 font-mono text-[11px] text-muted">
              <span className="w-3 h-3 border border-accent border-t-transparent animate-spin rounded-full flex-shrink-0" />
              {uploadMsg || "Spracovávam…"}
            </div>
          )}
        </div>
      </section>

      {/* ── Section C: Queue ────────────────────────────────────── */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px] text-muted">list</span>
            <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Queue</p>
          </div>
          <button
            onClick={refreshQueue}
            className="flex items-center gap-1.5 font-mono text-[10px] text-muted hover:text-ink transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            Refresh
          </button>
        </div>

        {queue.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-2">
              // Prázdna fronta
            </p>
            <p className="text-sm text-muted2">Žiadne naplánované ani odoslané posty za posledných 30 dní.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Charakter", "Platforma", "Typ", "Scheduled at", "Status", "Akcia"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-mono text-[9px] tracking-widest text-muted uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((post) => {
                  const charName =
                    post.chs_characters?.name ??
                    characters.find((c) => c.id === post.character_id)?.name ??
                    "—";
                  const mediaType = post.chs_media?.type ?? "—";
                  const scheduledStr = post.scheduled_at
                    ? new Date(post.scheduled_at).toLocaleString("sk-SK", {
                        year: "numeric", month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })
                    : "—";

                  return (
                    <tr key={post.id} className="border-b border-border last:border-0 hover:bg-bg3/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-[11px] text-ink">{charName}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted2">
                          {post.platform === "instagram" ? "Instagram" : "YouTube"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted2">
                          {mediaType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-muted2">{scheduledStr}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block font-mono text-[9px] uppercase tracking-wider border px-2 py-0.5 ${
                            STATUS_STYLES[post.status] ?? "text-muted border-border"
                          }`}
                        >
                          {post.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {post.status === "scheduled" ? (
                          <button
                            onClick={() => cancelPost(post.id)}
                            className="font-mono text-[10px] text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 px-2 py-1 transition-all"
                          >
                            Zruš
                          </button>
                        ) : post.status === "posted" ? (
                          <span className="text-teal text-[14px]">✓</span>
                        ) : post.status === "failed" ? (
                          <button
                            onClick={async () => {
                              await fetch("/api/publish/post-now", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ post_id: post.id }),
                              });
                              await refreshQueue();
                            }}
                            className="font-mono text-[10px] text-amber hover:text-amber/80 border border-amber/30 hover:border-amber/60 px-2 py-1 transition-all"
                          >
                            Retry
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toast && <ToastBar toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function defaultScheduledAt(postingTime: string): string {
  const today = new Date();
  const [h, m] = postingTime.split(":").map(Number);
  today.setHours(h ?? 10, m ?? 0, 0, 0);
  if (today <= new Date()) today.setDate(today.getDate() + 1);
  return today.toISOString().slice(0, 16);
}
