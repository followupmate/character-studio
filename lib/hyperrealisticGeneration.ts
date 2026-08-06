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
  resolution?: string;
  fileSizeKB?: number;
}

async function generateHyperrealistic(): Promise<GenerationResult> {
  const prompt = `score_9, score_8_up, score_7_up, rating_explicit,
raw photo, candid shot,
1girl, long silver hair, blue eyes, athletic build,
sitting on a velvet sofa,
skin pores, imperfections, moles, slight skin redness,
film grain, natural lighting from a window, soft shadows,
(detailed skin texture:1.2), goosebumps,
depth of field, f/2.8,
professional photography, documentary style`;

  const negativePrompt = `(low quality, worst quality:1.4),
(3d render, cg, cartoon, airbrushed, plastic, smooth skin, doll, anime, illustration:1.3),
(masterpiece, best quality:1.2),
deformed, extra fingers, bad anatomy,
text, watermark, signature, blurred, lowres, monochrome,
(oversaturated:1.2),
soft focus, makeup, filter, digital painting`;

  // Standard Civitai API payload (sdcpp engine has limited params)
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
          // Attempting advanced params (may not be supported)
          upscale: {
            enabled: true,
            model: "RealESRGAN_x4plus",
            factor: 2.0,
          },
          denoisingStrength: 0.4,
        },
      },
    ],
  };

  try {
    console.log(`\n🎨 HYPERREALISTIC GENERATION — CyberRealistic Pony v18.0\n`);
    console.log(`   Resolution: 832×1216`);
    console.log(`   Steps: 35 | CFG: 5.0 | Seed: 42424242`);
    console.log(`   Focus: Raw photo, skin pores, film grain, natural imperfections`);
    console.log(`   Attempting: Hi-res fix + Upscale (may not be supported)\n`);

    process.stdout.write(`   Sending request to API...`);

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
      console.log(`\n   ❌ API Error ${response.status}`);

      // Check if error is about unsupported fields
      if (errorText.includes("upscale") || errorText.includes("denoisingStrength")) {
        console.log(`   ℹ️  Advanced params (upscale, denoising) not supported by Civitai API`);
        console.log(`   📌 Retrying with standard params only...\n`);

        // Retry without advanced params
        delete (payload.steps[0].input as any).upscale;
        delete (payload.steps[0].input as any).denoisingStrength;

        const retryResponse = await fetch(`${API_BASE}?wait=600`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CIVITAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!retryResponse.ok) {
          throw new Error(`Retry failed: ${retryResponse.status}`);
        }

        const result = (await retryResponse.json()) as any;
        if (result.status === "succeeded" && result.steps?.[0]?.output?.images?.[0]) {
          return {
            status: "success",
            imageUrl: result.steps[0].output.images[0].url,
            workflowId: result.id,
          };
        }
      }

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

  const filename = `hyperrealistic_seed_42424242.jpg`;
  const filepath = `${outputDir}/${filename}`;

  try {
    process.stdout.write(`   Downloading...`);
    const response = await fetch(result.imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(buffer));

    const fileInfo = await fs.stat(filepath);
    const sizeKB = (fileInfo.size / 1024).toFixed(1);

    console.log(`✅ Downloaded: ${sizeKB} KB\n`);

    console.log(`📊 Analysis:`);
    console.log(`   File: ${filename}`);
    console.log(`   Size: ${sizeKB} KB`);
    console.log(`   Location: ${outputDir}/${filename}`);
    console.log(`   Workflow ID: ${result.workflowId}\n`);

    console.log(`⚠️  IMPORTANT LIMITATIONS:`);
    console.log(`   The Civitai Orchestration API does NOT support:`);
    console.log(`   ❌ Hi-res Fix / Upscaling`);
    console.log(`   ❌ ADetailer (face/eye enhancement)`);
    console.log(`   ❌ Denoising strength tuning`);
    console.log(`   ❌ Custom upscale models\n`);

    console.log(`✅ NEXT STEPS for True Hyperrealism:`);
    console.log(`   For hyperrealistic results with all features, you need:`);
    console.log(`   1. ComfyUI (local) + CyberRealistic checkpoint`);
    console.log(`   2. RunPod (cloud) with ComfyUI template`);
    console.log(`   3. A1111 WebUI with Hi-res fix + ADetailer extension\n`);

    console.log(`📋 This image shows base capability WITHOUT upscaling.`);
    console.log(`   Compare it to your requirements — if it's close, we can`);
    console.log(`   improve via ComfyUI/RunPod. If it's far, reconsider base model.\n`);

  } catch (err) {
    console.error(`   ❌ Download/analysis failed: ${err}`);
  }
}

async function main() {
  const result = await generateHyperrealistic();
  await downloadAndAnalyze(result);
}

main().catch((err) => {
  console.error(`❌ Fatal error:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
