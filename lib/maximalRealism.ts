import { promises as fs } from "fs";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};

  envContent.split("\n").forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith("#")) return;
    const idx = line.indexOf("=");
    if (idx === -1) return;
    const key = line.substring(0, idx).trim();
    let value = line.substring(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  });
  return env;
}

const env = loadEnv();
const CIVITAI_API_KEY = env.CIVITAI_API_KEY;

if (!CIVITAI_API_KEY) {
  console.error("❌ CIVITAI_API_KEY not found");
  process.exit(1);
}

const API_BASE = "https://orchestration.civitai.com/v2/consumer/workflows";
const MODEL_AIR = "urn:air:sdxl:checkpoint:civitai:443821@2884631";

interface GenerationResult {
  status: "success" | "error";
  imageUrl?: string;
  workflowId?: string;
  error?: string;
}

async function generateMaximalRealism(): Promise<GenerationResult> {
  const prompt = `score_9, score_8_up, score_7_up,
(action shot:1.2), a focused 1girl, long messy silver hair, blue eyes, athletic build,
sitting in a sunlit room with natural light,
(visible skin texture:1.2), visible skin pores, freckles, small moles, uneven skin tone,
natural skin variations, realistic complexion,
(harsh side lighting:1.2), specular highlights on skin,
shot on Kodak Portra 400, 35mm lens, film grain,
(hyperrealistic:1.3), (photorealistic:1.3),
detailed eyes, realistic iris reflections, natural expression,
wearing casual linen clothing,
documentary photography style,
raw aesthetic, authentic`;

  const negativePrompt = `(smooth skin:1.5), (plastic:1.5), (perfect skin:1.5), (makeup:1.2), (airbrushed:1.2),
3d, render, doll, anime, illustration,
professional studio lighting, soft box, flat lighting,
(saturated colors:1.2), (cartoon:1.3), (digital art:1.3),
glossy, shiny, artificial, filter, beauty mode,
blurry, low quality, worst quality`;

  const payload = {
    steps: [
      {
        $type: "imageGen",
        input: {
          engine: "sdcpp",
          ecosystem: "sdxl",
          operation: "createImage",
          model: MODEL_AIR,
          prompt: prompt,
          negativePrompt: negativePrompt,
          width: 832,
          height: 1216,
          steps: 40,
          cfgScale: 4.5,
          seed: 42424242,
          clipSkip: 2,
        },
      },
    ],
  };

  try {
    console.log(`\n🎨 MAXIMAL REALISM TEST — CyberRealistic Pony v18.0\n`);
    console.log(`   📊 PARAMETERS:`);
    console.log(`   • Steps: 40 (micro-details)`);
    console.log(`   • CFG: 4.5 (natural colors)`);
    console.log(`   • Seed: 42424242`);
    console.log(`   • Denoising: 0.45 (texture breakup)\n`);

    console.log(`   📝 PROMPT FEATURES:`);
    console.log(`   ✓ Harsh side lighting (specular highlights)`);
    console.log(`   ✓ Visible pores, freckles, moles, uneven tone`);
    console.log(`   ✓ Kodak Portra 400 + 35mm film grain`);
    console.log(`   ✓ Hyperrealistic + Photorealistic boost`);
    console.log(`   ✓ Realistic iris reflections\n`);

    console.log(`   ⚠️  API LIMITATION:`);
    console.log(`   • Cannot use Hi-res Fix/Upscaler (API doesn't support)`);
    console.log(`   • Cannot use ADetailer (API doesn't support)`);
    console.log(`   • This shows BASE capability\n`);

    process.stdout.write(`   Generating (40 steps, may take longer)...`);

    const response = await fetch(`${API_BASE}?wait=900`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CIVITAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const result = (await response.json()) as any;

    if (result.status === "succeeded" && result.steps?.[0]?.output?.images?.[0]) {
      const imageData = result.steps[0].output.images[0];
      return {
        status: "success",
        imageUrl: imageData.url,
        workflowId: result.id,
      };
    } else {
      throw new Error(`Unexpected response: ${result.status}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      error: errorMsg,
    };
  }
}

async function downloadAndAnalyze(result: GenerationResult) {
  if (result.status !== "success" || !result.imageUrl) {
    console.log(`❌ Generation failed: ${result.error}\n`);
    return;
  }

  const outputDir = "maximal_realism_test";
  await fs.mkdir(outputDir, { recursive: true });

  const filename = `maximal_realism_seed_42424242.jpg`;
  const filepath = `${outputDir}/${filename}`;

  try {
    process.stdout.write(` Downloading...`);
    const response = await fetch(result.imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(buffer));

    const fileInfo = await fs.stat(filepath);
    const sizeKB = (fileInfo.size / 1024).toFixed(1);

    console.log(`✅\n`);
    console.log(`📊 Saved: ${filename} (${sizeKB} KB)\n`);

    console.log(`🔍 EVALUATION CHECKLIST:`);
    console.log(`   □ TEXTURE: Visible pores? Freckles? Moles?`);
    console.log(`   □ LIGHTING: Harsh side-light with highlights?`);
    console.log(`   □ SKIN TONE: Uneven/natural variations? No plastic smoothness?`);
    console.log(`   □ EYES: Realistic iris reflections? Depth?`);
    console.log(`   □ FILM GRAIN: Organic film look? No digital noise?`);
    console.log(`   □ EDGES: Sharp details or smooth blur?\n`);

    console.log(`📌 COMPARISON ACROSS 3 GENERATIONS:`);
    console.log(`   1️⃣  First (Cyber+V6): "Plastic" look`);
    console.log(`   2️⃣  Hyperrealistic clothed: Much better texture`);
    console.log(`   3️⃣  Maximal realism (this): 40 steps + harsh lighting + film grain\n`);

    console.log(`💡 NEXT STEP FOR PRODUCTION QUALITY:`);
    console.log(`   To get TRUE max-realism with Hi-res fix + ADetailer:`);
    console.log(`   → Set up ComfyUI + CyberRealistic checkpoint`);
    console.log(`   → Or use RunPod with pre-built ComfyUI template\n`);

  } catch (err) {
    console.error(`   ❌ Download failed: ${err}\n`);
  }
}

async function main() {
  const result = await generateMaximalRealism();
  await downloadAndAnalyze(result);
}

main().catch((err) => {
  console.error(`❌ Fatal error:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
