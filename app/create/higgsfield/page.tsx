"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA } from "@/lib/archetypes";
import { syncDraft } from "@/lib/wizardDraft";

const STUDIO_PROMPTS = [
  "A professional medium format studio portrait, headshot frame, of the woman from the reference image looking directly into the camera lens with a serious, composed expression, chin slightly lowered, eyes slightly upward toward camera. Seamless pure white cyclorama background. Professional butterfly studio lighting revealing ultra-realistic skin texture. Razor-sharp focus on the eyes. 8k resolution, raw photograph quality, extreme detail.",
  "A professional medium format studio portrait, headshot frame, of the woman from the reference image with a subtle smirk, head gently tilted to the right, eyes looking directly into camera. Pure white cyclorama background, butterfly studio lighting revealing detailed pores and natural skin texture. 8k raw photograph quality.",
  "A professional medium format studio portrait of the woman from the reference image, head facing forward but eyes looking slightly left of camera with a thoughtful expression. Pure white background, butterfly lighting, ultra-realistic skin texture, razor-sharp focus. 8k raw photograph quality.",
  "A professional medium format studio portrait of the woman from the reference image mid-soft laugh, natural relaxed expression, head facing forward, eyes engaged toward camera. Seamless white cyclorama background. Butterfly lighting revealing pores and skin texture. 8k raw photograph quality.",
  "A professional medium format studio portrait of the woman from the reference image turned 45 degrees to her left, head slightly angled toward camera, neutral calm expression. Pure white cyclorama background. Butterfly lighting revealing ultra-realistic skin texture. Razor-sharp focus. 8k raw quality.",
  "A professional medium format studio portrait of the woman from the reference image turned 45 degrees to her right with a soft natural smile. White cyclorama background, butterfly lighting, extreme skin detail, 8k resolution.",
  "A professional medium format studio portrait of the woman from the reference image in a strict right side profile with a subtle natural smile. Pure white background, butterfly lighting, extreme skin realism. 8k raw photograph quality.",
  "A professional medium format studio portrait of the woman from the reference image photographed from a slightly higher camera angle looking down gently at her face. She looks up into the lens with a calm neutral expression. White cyclorama background. Butterfly lighting. Ultra-realistic skin texture. 8k raw quality.",
  "A professional medium format studio portrait of the woman from the reference image shot from a slightly lower camera angle, chin slightly raised, confident composed expression. Seamless white background, butterfly lighting, insane skin detail. 8k raw photograph.",
  "A professional medium format studio portrait of the woman from the reference image looking downward gently with relaxed facial muscles, serene expression. Pure white cyclorama background, butterfly lighting revealing detailed skin texture. 8k raw quality.",
  "A professional medium format studio portrait of the woman from the reference image looking slightly upward above camera line, soft curious expression. Seamless white background. Butterfly lighting. Razor-sharp eyes. 8k raw photograph.",
  "A professional medium format studio portrait of the woman from the reference image with her chin resting lightly on the back of her hand, neutral expression, direct eye contact with camera. White seamless background. Butterfly lighting. Ultra-realistic skin detail. 8k raw quality.",
  "A professional medium format studio portrait of the woman from the reference image framed slightly wider (upper torso visible), arms lightly crossed, neutral composed expression, direct eye contact. Pure white cyclorama background. Butterfly lighting. Ultra-realistic texture. 8k raw photograph.",
  "A professional medium format studio portrait of the woman from the reference image leaning slightly forward toward camera with an engaged attentive expression. White cyclorama background. Butterfly lighting revealing natural imperfections and skin texture. Razor-sharp focus on eyes. 8k raw quality.",
  "A professional medium format studio portrait of the woman from the reference image in a three-quarter back position. Her shoulders face away from camera while her head turns back toward the lens with chin slightly raised and a confident composed expression. Seamless white studio background. Butterfly lighting revealing natural skin texture and jawline definition. 8k raw quality.",
  "A professional medium format studio portrait of the woman from the reference image slightly leaning her upper body forward while facing away from camera. She turns her head back toward the lens with direct eye contact and a composed neutral expression. Seamless white studio background. Butterfly lighting revealing ultra-realistic texture and fine facial detail. 8k raw photograph.",
  "A professional medium format studio portrait of the woman from the reference image with her back facing the camera, shoulders squared away from lens. She turns her head naturally over her left shoulder toward the camera, revealing half of her face in a calm neutral expression. Seamless pure white studio cyclorama background. Professional butterfly studio lighting revealing ultra-realistic skin texture and natural hair detail. Razor-sharp focus on the visible eye. 8k resolution, raw photograph quality.",
  "A professional medium format studio portrait of the woman from the reference image positioned in a three-quarter back angle, her body angled away from camera. She turns her head partially back toward the lens while looking slightly downward with a thoughtful expression. Pure white cyclorama background, butterfly lighting, ultra-realistic skin texture and detailed hair strands. 8k raw photograph quality.",
  "A professional medium format studio portrait of the woman from the reference image with one hand gently resting along the side of her neck, elbow relaxed. She maintains soft direct eye contact with a calm neutral expression. Seamless white studio background. Butterfly lighting revealing detailed skin texture and natural imperfections. Hairstyle remains structurally identical to the reference image. 8k raw photograph quality.",
  "A professional medium format studio portrait of the woman from the reference image with one shoulder subtly angled forward and the other slightly back, creating natural asymmetry in her posture. Her head remains aligned toward the camera with a composed neutral expression. White cyclorama background. Butterfly lighting revealing ultra-realistic skin detail. Hairstyle remains identical to the reference image. 8k raw photograph quality.",
];

const STUDIO_LABELS = [
  "Headshot – priamy pohľad, vážny výraz",
  "Headshot – jemný úsmev, hlava naklonená vpravo",
  "Pohľad mierne vľavo, zamyslený výraz",
  "Plynulý smiech, uvoľnený výraz",
  "Otočená 45° vľavo, neutrálna",
  "Otočená 45° vpravo, jemný úsmev",
  "Profil z pravej strany",
  "Uhol zhora – pohľad nahor do objektívu",
  "Uhol zdola – brada mierne hore, sebaistá",
  "Pohľad dole, pokojný výraz",
  "Pohľad mierne nahor, zvedavá",
  "Brada opretá o ruku, priamy kontakt",
  "Skrížené ruky, horná časť tela",
  "Mierne naklonená dopredu, pozorná",
  "Tri-quarter zozadu, hlava otočená späť",
  "Naklonená dopredu, čelom preč, hlava späť",
  "Chrbtom, hlava otočená cez ľavé rameno",
  "Tri-quarter zozadu, pohľad mierne dole",
  "Ruka pozdĺž krku, priamy pohľad",
  "Jedno rameno vpred – prirodzená asymetria",
];

const LIFESTYLE_PROMPTS = [
  {
    label: "Reštaurácia – noc, smeje sa",
    text: "A candid night iPhone photo captured under warm restaurant lighting, framed from mid-torso upward with Her entire head remains fully visible in the composition, though her face is looking to the left like mid conversation with someone. She wears a sleek black halter top paired with low-rise structured trousers and a slim leather shoulder bag resting against her side. The lighting is warm and slightly uneven, consistent with realistic iPhone night mode, with subtle grain visible. She is caught mid-laugh, her head slightly turned away from the camera rather than looking directly into it. The ambient light catches a faint gloss on her lips and softly highlights natural skin texture without smoothing. The composition feels spontaneous and imperfect, preserving the candid, human energy of an unposed nighttime moment while ensuring her entire head remains fully within the shot.",
  },
  {
    label: "Izba – ranné slnko, čítanie",
    text: "A sunlit iPhone photo captured during golden hour, framed wide enough to include her full head and upper body comfortably within the frame. She sits diagonally across the bed wearing a soft cotton robe, loose waves resting naturally around her shoulders. Her entire head remains fully visible in the composition, though her face is looking down on the book. One leg is gently bent, bare feet resting casually against the duvet. An open book lies beside her as if paused mid-reading. On the bed, a wooden breakfast tray holds a small bowl of yogurt topped with granola and neatly arranged mango slices shaped like petals. Nearby rests a folded linen towel, a pale mint matcha cup, and a simple silver spoon. The warm golden hour light filters softly into the room, creating an airy glow without harsh shadows. The composition feels balanced and intimate, with subtle fabric wrinkles visible in the bedding and robe. Skin texture remains natural and unfiltered.",
  },
  {
    label: "Paríž – kamenná stena, iced coffee",
    text: "A casually captured iPhone-style street photo shows her leaning back against a slightly worn Parisian stone wall along a quiet city sidewalk. She's dressed in an ivory silk blouse with soft drape and natural creasing, paired with sleek black leather trousers and classic white Converse sneakers lightly scuffed from everyday wear. Minimal black headphones rest loosely over her hair, adding a subtle contemporary edge. In one hand, she holds a takeaway iced coffee in a clear plastic cup with a domed lid and straw, faint condensation forming along the surface and catching soft daylight. Her hair falls in a loose, natural tousle, a few strands illuminated by the sun, subtly highlighting understated makeup and honest skin texture — faint freckles, visible pores, no artificial smoothing. The pavement beneath her reveals worn concrete texture, while the aged stone wall behind her shows soft discoloration and traces of moss. Soft natural light creates delicate shadows and nuanced highlights.",
  },
  {
    label: "Mestské zábradlie – priamy pohľad",
    text: "A spontaneous urban photo framed from chest upward. She leans casually against a railing while looking directly into the lens with a relaxed, neutral expression. She wears structured dark-wash straight-leg denim and an oversized crisp white button-down with rolled sleeves and thin silver bangles. Soft daylight reveals subtle pores and natural skin texture. Slight off-center framing gives candid energy, but her face remains the focal point.",
  },
  {
    label: "Okno – roláž, wide-leg nohavice",
    text: "A clean iPhone capture indoors near a large window. She wears a fitted ribbed turtleneck tucked into wide-leg structured trousers with a sharp crease. The silhouette is sculptural and intentional. Hair naturally placed, slightly tucked behind one ear. Soft daylight wraps around her face, revealing subtle pores and realistic shadows along the collarbone. The composition is slightly off-center but keeps her face clearly visible and sharply defined.",
  },
  {
    label: "Skleník – otáčanie, kvetiny vo vlasoch",
    text: "A close-up upper-body shot captures a young woman mid-turn, her movement gentle and fluid as she spins naturally. Her smile is relaxed and genuine, revealing natural white teeth without embellishment. She wears a flowing ivory slip dress with delicate lace tracing the neckline, the lightweight fabric softly textured and subtly rippling with her motion. Small flowers are woven into her loosely tousled hair, with a few strands falling freely to frame her face in an effortless way. Warm daylight filters through dense tropical greenery inside a humid greenhouse, with faint dust particles suspended in the air.",
  },
  {
    label: "Ulica – prechádza cez cestu",
    text: "A wide-angle candid street shot. She wears relaxed pleated trousers, a fitted tank, and a structured cropped trench jacket. Sleek sunglasses resting on top of her head. Leather loafers slightly worn at the edges. She's mid-stride crossing the street, one foot slightly motion blurred. Asphalt texture sharp. Expression neutral and focused. Documentary-style realism but high taste.",
  },
  {
    label: "Terasa – západ slnka, vietor vo vlasoch",
    text: "A golden hour rooftop iPhone capture with wind pushing hair across her face. She wears a lightweight satin skirt and oversized graphic tee tucked loosely. The city skyline is softly blurred behind her. She shields her eyes slightly from sunlight with one hand. The lighting creates warm rim highlights around hair strands while preserving natural skin texture. Slight lens flare. Frame slightly off-balance, feels accidental.",
  },
  {
    label: "Potraviny – pozerá cez plece",
    text: "A spontaneous wide-angle photo inside a grocery store aisle. Fluorescent lights above create realistic highlights on packaged goods. She wears relaxed cargo pants and a simple cropped sweater. One arm reaches toward a shelf while glancing back over her shoulder naturally. Slight motion blur on fingertips. Realistic skin texture, natural posture. The scene feels like a moment captured mid-task, not posed.",
  },
  {
    label: "Kaviareň – okno, cappuccino",
    text: "A soft natural-light iPhone photo inside a small café. She sits diagonally by the window wearing a textured knit cardigan draped loosely over a simple slip dress. One elbow rests on the table beside a half-finished cappuccino with subtle foam texture. The sunlight filters through sheer curtains, casting delicate patterns on her shoulder. Her expression is distant and calm, looking slightly past the camera. Slight grain, realistic skin texture, natural lip gloss, no overprocessing.",
  },
  {
    label: "Ulica – zhora, krok z obrubníka",
    text: "A wide-angle candid shot from slightly above chest height as she steps off a curb mid-stride. She wears structured trousers with a slightly oversized blazer over a plain tee, paired with worn-in sneakers. One foot slightly blurred from motion. Natural daylight with soft shadows. The asphalt texture is sharp and detailed. Her expression neutral and focused forward, not looking at camera. Slight lens distortion typical of iPhone wide lens. Documentary, accidental energy.",
  },
  {
    label: "Nočný obchod – unavená, unavenosť",
    text: "A candid iPhone-style photo captured at night inside a small neighborhood convenience store. She stands near the refrigerated drinks section, cool white fluorescent lighting reflecting subtly off glass doors. She wears an oversized charcoal hoodie half-zipped over a fitted white tank and relaxed gray sweatpants. One hand rests casually on a refrigerator handle, the other holding a condensation-covered bottled soda. Her expression is slightly tired but calm, like she's lost in thought. The frame is slightly tilted and imperfect, faint motion blur on one arm. Skin texture natural, faint pores visible, no smoothing.",
  },
];

const PRESETS = [
  "Old smartphone",
  "Mystique city",
  "Digital camera",
  "Retro BW",
  "Subtle flash",
  "Street photography",
  "Swag era",
];

function CopyBtn({ text, short }: { text: string; short?: boolean }) {
  const [ok, setOk] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className={`flex-shrink-0 font-mono text-[8px] uppercase tracking-[0.08em] border px-2.5 py-1 transition-colors ${
        ok
          ? "border-teal/30 text-teal bg-teal/10"
          : "border-border text-muted hover:text-ink hover:border-border2"
      }`}
    >
      {ok ? "✓" : "Kopírovať"}
    </button>
  );
}

export default function HiggsfieldPage() {
  const router = useRouter();
  const [dna, setDna] = useState<CharacterDNA | null>(null);
  const [tab, setTab] = useState<"studio" | "lifestyle" | "presets">("studio");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("character_dna");
      if (raw) setDna(JSON.parse(raw));
    } catch {}
  }, []);

  const studioCount = STUDIO_PROMPTS.length;
  const lifestyleCount = LIFESTYLE_PROMPTS.length;
  const total = studioCount + lifestyleCount;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Higgsfield — Character Photos</h1>
          {dna && (
            <span className="font-mono text-[9px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-[0.1em]">
              {dna.name}
            </span>
          )}
        </div>

        <div className="p-4 lg:p-8 max-w-4xl">
          <StepProgress current={4} total={6} label="Higgsfield" />

          <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-1">// Krok 4 z 6</p>
          <h2 className="font-display italic text-[48px] leading-[1.1] text-white mb-2">
            Vytvor 20+ fotiek
          </h2>
          <p className="font-mono text-[11px] text-muted2 mb-8 max-w-xl">
            V Higgsfield nahraj svoju MJ fotku ako referenciu a postupne vygeneruj všetky varianty. Minimálne 20 fotiek pre Soul ID tréning.
          </p>

          {/* Instructions + link */}
          <div className="bg-surface border border-border p-5 mb-6">
            <p className="font-mono text-[9px] text-muted uppercase tracking-[0.15em] mb-4">// Postup</p>
            <ol className="space-y-2 mb-4">
              {[
                "Otvor Higgsfield → Character Creator",
                "Nahraj svoju MJ fotku ako referenciu",
                "Vyber model: Nano Banana Pro (studio) alebo Soul 2 (lifestyle)",
                "Kopíruj prompt, vlož do Higgsfield a vygeneruj",
                "Opakuj — potrebuješ min. 20 rôznych záberov",
                "Stiahni všetky a vráť sa pre Soul ID tréning",
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="font-mono text-[9px] text-accent w-4 flex-shrink-0">{i + 1}.</span>
                  <span className="font-mono text-[10px] text-muted2">{s}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-3 pt-3 border-t border-border">
              <a
                href="https://higgsfield.ai/character"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[10px] bg-amber/10 border border-amber/30 text-amber px-4 py-2 hover:bg-amber/20 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                Otvoriť Higgsfield Character Creator
              </a>
              <span className="font-mono text-[9px] text-muted">{total} promptov pripravených</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-px bg-border mb-1">
            {([
              { key: "studio",    label: `Studio Portréty (${studioCount})`, model: "Nano Banana Pro" },
              { key: "lifestyle", label: `Lifestyle (${lifestyleCount})`,    model: "Soul 2" },
              { key: "presets",   label: `Presets (${PRESETS.length})`,      model: "Soul 2" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 font-mono text-[9px] uppercase tracking-[0.08em] px-3 py-2.5 transition-colors ${
                  tab === t.key
                    ? "bg-accent text-white"
                    : "bg-surface text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Model badge */}
          <div className="bg-surface-low border border-border border-t-0 px-4 py-2 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[12px] text-muted">info</span>
            <span className="font-mono text-[9px] text-muted">
              Model:{" "}
              <span className="text-amber">
                {tab === "studio" ? "Nano Banana Pro" : "Soul 2"}
              </span>
              {tab === "studio" && " — nahraj MJ fotku ako referenciu"}
            </span>
          </div>

          {/* Studio prompts */}
          {tab === "studio" && (
            <div className="space-y-px">
              {STUDIO_PROMPTS.map((prompt, i) => (
                <div key={i} className="bg-surface border border-border hover:border-border2 transition-colors">
                  <div className="bg-surface-low border-b border-border px-4 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[9px] bg-accent/10 border border-accent/20 text-accent px-1.5 py-0.5 w-6 text-center flex-shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[9px] text-muted2">{STUDIO_LABELS[i]}</span>
                    </div>
                    <CopyBtn text={prompt} />
                  </div>
                  <pre className="px-4 py-3 font-mono text-[9px] text-muted leading-relaxed whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
                    {prompt}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Lifestyle prompts */}
          {tab === "lifestyle" && (
            <div className="space-y-px">
              {LIFESTYLE_PROMPTS.map((p, i) => (
                <div key={i} className="bg-surface border border-border hover:border-border2 transition-colors">
                  <div className="bg-surface-low border-b border-border px-4 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[9px] bg-amber/10 border border-amber/20 text-amber px-1.5 py-0.5 w-6 text-center flex-shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[9px] text-muted2">{p.label}</span>
                    </div>
                    <CopyBtn text={p.text} />
                  </div>
                  <pre className="px-4 py-3 font-mono text-[9px] text-muted leading-relaxed whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
                    {p.text}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Presets */}
          {tab === "presets" && (
            <div className="space-y-px">
              <div className="bg-surface border border-border p-4 mb-4">
                <p className="font-mono text-[9px] text-muted2 leading-relaxed">
                  Presets sú predpripravené štýly v Higgsfield. Po nahratí referencie ich jednoducho vyber v UI — žiadny prompt nie je potrebný.
                </p>
              </div>
              {PRESETS.map((preset, i) => (
                <div key={i} className="bg-surface border border-border hover:border-border2 transition-colors p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[9px] text-muted w-5">{i + 1}.</span>
                    <span className="font-mono text-[11px] text-ink uppercase tracking-[0.05em]">{preset}</span>
                  </div>
                  <CopyBtn text={preset} />
                </div>
              ))}
            </div>
          )}

          {/* Bottom nav */}
          <div className="flex items-center gap-3 pt-8 mt-6 border-t border-border">
            <button
              onClick={() => router.push("/create/midjourney")}
              className="font-mono text-[11px] border border-border text-muted px-5 py-2.5 hover:text-ink hover:border-border2 transition-colors"
            >
              ← Späť
            </button>
            <button
              onClick={() => { if (dna) syncDraft(dna, "soul"); router.push("/create/soul"); }}
              className="font-mono text-[11px] bg-accent text-white px-5 py-2.5 hover:bg-blue-400 transition-colors"
            >
              Mám 20+ fotiek, pokračujem →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
