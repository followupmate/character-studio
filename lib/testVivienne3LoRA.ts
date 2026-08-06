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

const CIVITAI_BASE = "https://civitai.com/api/v1";
const ORCHESTRATION_BASE = "https://orchestration.civitai.com/v2/consumer";

async function searchModel(query: string) {
  console.log(`\n🔍 Searching for model: ${query}`);
  console.log("━".repeat(50));

  try {
    const response = await fetch(
      `${CIVITAI_BASE}/models?query=${encodeURIComponent(query)}&type=LORA&limit=5`,
      {
        headers: {
          "Authorization": `Bearer ${CIVITAI_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const models = data.items || [];

    if (models.length === 0) {
      console.log("❌ No models found");
      return null;
    }

    console.log(`✅ Found ${models.length} models:\n`);
    models.forEach((model: any, i: number) => {
      console.log(`${i + 1}. ${model.name}`);
      console.log(`   ID: ${model.id}`);
      console.log(`   Type: ${model.type}`);
      if (model.modelVersions?.[0]) {
        console.log(`   Latest Version: ${model.modelVersions[0].name}`);
        console.log(`   Version ID: ${model.modelVersions[0].id}`);
      }
      console.log();
    });

    return models[0]; // Return first match
  } catch (error) {
    console.error("❌ Search error:", error);
    return null;
  }
}

async function generateWithLoRA(model: any) {
  console.log("\n🎨 Generating test image with Vivienne LoRA");
  console.log("━".repeat(50));

  const loraVersionId = model.modelVersions?.[0]?.id;
  if (!loraVersionId) {
    console.error("❌ Could not find LoRA version ID");
    return;
  }

  const prompt = `score_9, score_8_up, score_7_up, rating_explicit,
vivienne3, (action shot:1.2),
sweaty, oily skin, visible skin pores, freckles,
small moles, uneven skin tone,
harsh side lighting, specular highlights on skin,
shot on Kodak Portra 400, 35mm lens, film grain,
hyperrealistic, photorealistic, detailed eyes,
realistic iris reflections`;

  const negativePrompt = `(smooth skin:1.5), (plastic:1.5), (perfect skin:1.5),
(makeup:1.2), (airbrushed:1.2), 3d, render, doll,
anime, illustration, professional studio lighting,
soft box, flat lighting, (saturated colors:1.2),
(cartoon:1.3), (digital art:1.3)`;

  const payload = {
    baseModel: "635127", // CyberRealistic Pony v18.0
    loras: [
      {
        modelVersionId: loraVersionId,
        strength: 0.8,
      },
    ],
    prompt: prompt,
    negativePrompt: negativePrompt,
    sampler: "DPM++ 2M Karras",
    steps: 40,
    cfgScale: 4.5,
    width: 832,
    height: 1216,
    clipSkip: 2,
    hires: {
      enabled: true,
      denoisingStrength: 0.45,
      upscale: 2,
      upscalerName: "RealESRGAN_x2plus",
    },
    adetailer: {
      enabled: true,
      strength: 0.35,
    },
  };

  console.log("\n📋 Generation Parameters:");
  console.log(`   Base Model: 635127 (CyberRealistic Pony v18.0)`);
  console.log(`   LoRA: ${model.name} (strength: 0.8)`);
  console.log(`   Resolution: 832 x 1216`);
  console.log(`   Sampler: DPM++ 2M Karras`);
  console.log(`   Steps: 40`);
  console.log(`   CFG: 4.5`);
  console.log(`   Hi-Res Fix: Enabled`);
  console.log(`   ADetailer: Enabled`);

  try {
    console.log("\n📤 Submitting generation request...");
    console.log(`   Endpoint: ${ORCHESTRATION_BASE}/workflows/text-to-image`);

    const response = await fetch(
      `${ORCHESTRATION_BASE}/workflows/text-to-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CIVITAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      }
    );

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("\n❌ Generation failed:");
      console.error(errorText.substring(0, 500));

      console.log("\n💡 Fallback: Use Web Generation");
      console.log("   Go to: https://civitai.com/generate");
      console.log("   Select base model: CyberRealistic Pony v18.0");
      console.log("   Add LoRA: Vivienne3 (strength 0.8)");
      console.log("   Use prompt above");
      return;
    }

    const result = await response.json() as any;
    const jobId = result.jobId || result.id;

    console.log("\n✅ Generation job submitted!");
    console.log(`   Job ID: ${jobId}`);
    console.log(`   Status: ${result.status || "Processing"}`);

    if (result.images?.[0]) {
      console.log(`   Image URL: ${result.images[0]}`);
    }

    console.log("\n🔗 View results at:");
    console.log("   https://civitai.com/generate");

  } catch (error) {
    console.error("\n❌ Generation error:", error);

    console.log("\n💡 Fallback: Manual Web Generation");
    console.log("   1. Go to https://civitai.com/generate");
    console.log("   2. Select: CyberRealistic Pony v18.0");
    console.log("   3. Add LoRA: Vivienne3 (strength 0.8)");
    console.log("   4. Paste prompt above");
    console.log("   5. Generate");
  }
}

async function main() {
  console.log("🚀 Vivienne3 LoRA - Test Generation Pipeline");
  console.log("==========================================");

  // Search for Vivienne3 model
  const model = await searchModel("vivienne3");

  if (!model) {
    console.log("\n⚠️  Could not find Vivienne3 model via API");
    console.log("\n💡 Try these alternatives:");
    console.log("   1. Search manually: https://civitai.com/models?search=vivienne3");
    console.log("   2. Use web generator: https://civitai.com/generate");
    console.log("   3. Wait a few minutes - model might still be indexing");
    process.exit(1);
  }

  // Generate image with LoRA
  await generateWithLoRA(model);

  console.log("\n🎉 Pipeline complete!");
}

main().catch(console.error);
