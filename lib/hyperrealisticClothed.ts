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

async function generateHyperrealisticClothed(): Promise<GenerationResult> {
  const prompt = `score_9, score_8_up, score_7_up,
raw photo, candid shot,
1girl, long silver hair, blue eyes, athletic build,
sitting on a grey modern sofa, wearing a light beige linen shirt,
skin pores, subtle imperfections, moles, slight natural skin variation,
film grain, natural daylight from large windows, soft diffused shadows,
(detailed skin texture:1.2), natural skin appearance,
depth of field, professional photography, documentary style,
realistic lighting, color grading`;

  const negativePrompt = `(low quality, worst quality:1.4),
(3d render, cg, cartoon, airbrushed, plastic, smooth skin, doll, anime, illustration:1.3),
(masterpiece, best quality:1.2),
deformed, extra fingers, bad anatomy,
text, watermark, signature, blurred, lowres, monochrome,
(oversaturated:1.2),
soft focus, makeup, filter, digital painting,
fake, artificial, glossy skin`;

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
          steps: 35,
          cfgScale: 5.0,
          seed: 42424242,
          clipSkip: 2,
        },
      },
    ],
  };

  try {
    console.log(`\n🎨 HYPERREALISTIC TEST — CyberRealistic Pony v18.0\n`);
    console.log(`   Focus: Raw photo aesthetic, skin texture, film grain`);
    console.log(`   Type: Non-explicit (clothed) for texture evaluation\n`);
    console.log(`   Prompt highlights:`);
    console.log(`   ✓ "raw photo, candid shot" for authenticity`);
    console.log(`   ✓ "skin pores, imperfections, moles" for realism`);
    console.log(`   ✓ "film grain" for organic look`);
    console.log(`   ✓ Negative: "smooth skin, plastic, airbrushed"\n`);

    process.stdout.write(`   Generating...`);

    const response = await fetch(`${API_BASE}?wait=600`, {
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
    console.log(`❌ Generation failed: ${result.error}`);
    return;
  }

  const outputDir = "hyperrealistic_test";
  await fs.mkdir(outputDir, { recursive: true });

  const filename = `hyperrealistic_clothed_seed_42424242.jpg`;
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

    console.log(`📋 What to check in this image:`);
    console.log(`   1. SKIN TEXTURE: Are pores visible? Any film grain?`);
    console.log(`   2. NATURAL LOOK: Does it avoid the "plastic" aesthetic?`);
    console.log(`   3. FACE QUALITY: Sharp eyes? Natural expression?`);
    console.log(`   4. LIGHTING: Natural window light? Soft shadows?`);
    console.log(`   5. COLOR: Natural skin tones? Any oversaturation?\n`);

    console.log(`⚠️  API Limitation Note:`);
    console.log(`   This is BASE output WITHOUT Hi-res fix/upscaler.`);
    console.log(`   For TRUE hyperrealism with all details, you need:`);
    console.log(`   → ComfyUI (local) or RunPod (cloud)\n`);

    console.log(`✅ Now compare this against your first "plastic" generation`);
    console.log(`   Location: ${outputDir}/\n`);

  } catch (err) {
    console.error(`   ❌ Download failed: ${err}`);
  }
}

async function main() {
  const result = await generateHyperrealisticClothed();
  await downloadAndAnalyze(result);
}

main().catch((err) => {
  console.error(`❌ Fatal error:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
