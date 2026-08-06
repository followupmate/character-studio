import { readFileSync } from "fs";
import { resolve } from "path";
import { promises as fs } from "fs";
import * as path from "path";

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

// Civitai Orchestration API endpoints
const ORCHESTRATION_BASE = "https://orchestration.civitai.com/v2/consumer";
const TRAINING_ENDPOINT = `${ORCHESTRATION_BASE}/recipes/imageResourceTraining`;

interface LoRATrainingConfig {
  baseModel: string;
  modelName: string;
  datasetPath: string;
  triggerWord: string;
  epochs: number;
  learningRate: number;
  rank: number;
  alpha: number;
  resolution: number;
  scheduler: string;
  optimizer: string;
  autoCaptioning: boolean;
}

async function submitLoRATraining(config: LoRATrainingConfig) {
  console.log("\n🚀 Civitai LoRA Training Submission");
  console.log("=====================================\n");

  // Get list of images from dataset
  const datasetDir = resolve(config.datasetPath);
  console.log(`📂 Loading dataset from: ${datasetDir}`);

  let imageFiles: string[] = [];
  try {
    const files = await fs.readdir(datasetDir);
    imageFiles = files.filter((f) =>
      /\.(jpg|jpeg|png|webp)$/i.test(f)
    );
  } catch (e) {
    console.error(`❌ Failed to read dataset directory: ${e}`);
    process.exit(1);
  }

  if (imageFiles.length === 0) {
    console.error("❌ No images found in dataset directory");
    process.exit(1);
  }

  console.log(`✓ Found ${imageFiles.length} images\n`);

  // Prepare request payload
  const payload = {
    inputs: {
      model: config.baseModel,
      name: config.modelName,
      triggerWord: config.triggerWord,
      images: imageFiles.map((f) => path.join(config.datasetPath, f)),
      epochs: config.epochs,
      learningRate: config.learningRate,
      networkDim: config.rank,
      networkAlpha: config.alpha,
      resolution: config.resolution,
      scheduler: config.scheduler,
      optimizer: config.optimizer,
      autoCaptioning: config.autoCaptioning ? "wd_tagger" : "none",
      captioningPrefix: config.triggerWord, // Add trigger word to captions
    }
  };

  console.log("📋 Training Configuration:");
  console.log(`   Base Model: ${config.baseModel}`);
  console.log(`   Model Name: ${config.modelName}`);
  console.log(`   Trigger Word: ${config.triggerWord}`);
  console.log(`   Epochs: ${config.epochs}`);
  console.log(`   Learning Rate: ${config.learningRate}`);
  console.log(`   Rank (Dim): ${config.rank}`);
  console.log(`   Alpha: ${config.alpha}`);
  console.log(`   Resolution: ${config.resolution}px`);
  console.log(`   Scheduler: ${config.scheduler}`);
  console.log(`   Optimizer: ${config.optimizer}`);
  console.log(`   Auto-Captioning: ${config.autoCaptioning ? "WD Tagger" : "Disabled"}`);
  console.log(`   Dataset Size: ${imageFiles.length} images\n`);

  try {
    console.log("📤 Submitting to Civitai Orchestration API...");
    console.log(`   POST ${TRAINING_ENDPOINT}\n`);

    const response = await fetch(TRAINING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CIVITAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      process.exit(1);
    }

    const result = await response.json() as any;
    console.log("✅ Training Submitted Successfully!\n");
    console.log("📊 Training Job Details:");
    console.log(JSON.stringify(result, null, 2));

    if (result.jobId || result.id) {
      const jobId = result.jobId || result.id;
      console.log(`\n🔗 Job ID: ${jobId}`);
      console.log(`Monitor at: https://civitai.com/user/training`);
    }

  } catch (error) {
    console.error("❌ Failed to submit training:", error);
    process.exit(1);
  }
}

// Main
async function main() {
  const datasetPath = process.argv[2];

  if (!datasetPath) {
    console.log("\n📝 USAGE:\n");
    console.log(`   npx tsx lib/trainLoraVivienneCivitai.ts '<path-to-dataset-dir>'\n`);
    console.log(`EXAMPLE:\n`);
    console.log(`   npx tsx lib/trainLoraVivienneCivitai.ts 'training_dataset_vivienne'\n`);
    process.exit(1);
  }

  const config: LoRATrainingConfig = {
    baseModel: "635127", // CyberRealistic Pony v18.0 CoreShift (Civitai Model ID)
    modelName: "Vivienne_LoRA_Soul_v1",
    datasetPath: datasetPath,
    triggerWord: "mychar_soul",
    epochs: 12,
    learningRate: 0.0001,
    rank: 32,
    alpha: 16,
    resolution: 1024,
    scheduler: "cosine_with_restarts",
    optimizer: "AdamW8bit",
    autoCaptioning: true,
  };

  await submitLoRATraining(config);
}

main().catch(console.error);
