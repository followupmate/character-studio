import { readFileSync, promises as fs } from "fs";
import { resolve } from "path";
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

const ORCHESTRATION_BASE = "https://orchestration.civitai.com/v2/consumer";

interface TrainingConfig {
  baseModelId: string;
  modelName: string;
  zipPath: string;
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

async function submitLoRATrainingWithZip(
  config: TrainingConfig
): Promise<string> {
  console.log("\n🚀 Starting LoRA Training (ZIP Upload)");
  console.log("=====================================\n");

  // Verify ZIP exists
  const zipPath = resolve(config.zipPath);
  console.log(`📂 Dataset ZIP: ${zipPath}`);

  const stats = await fs.stat(zipPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`   Size: ${sizeMB} MB\n`);

  console.log("📋 Training Configuration:");
  console.log(`   Base Model ID: ${config.baseModelId}`);
  console.log(`   Model Name: ${config.modelName}`);
  console.log(`   Trigger Word: ${config.triggerWord}`);
  console.log(`   Epochs: ${config.epochs}`);
  console.log(`   Learning Rate: ${config.learningRate}`);
  console.log(`   Rank: ${config.rank}`);
  console.log(`   Alpha: ${config.alpha}`);
  console.log(`   Resolution: ${config.resolution}`);
  console.log(`   Scheduler: ${config.scheduler}`);
  console.log(`   Optimizer: ${config.optimizer}`);
  console.log(`   Auto-Captioning: ${config.autoCaptioning ? "Yes (WD Tagger)" : "No"}\n`);

  // Read ZIP as binary
  console.log("📤 Reading ZIP file...");
  const zipData = await fs.readFile(zipPath);
  const base64Zip = zipData.toString("base64");
  console.log(`   ✓ ZIP loaded (${(base64Zip.length / 1024 / 1024).toFixed(2)} MB base64)\n`);

  // Prepare payload
  const payload = {
    inputs: {
      // Model configuration
      modelId: config.baseModelId,
      name: config.modelName,
      description: `LoRA trained with Vivienne Soul ID character dataset. Trigger word: ${config.triggerWord}`,

      // ZIP file with images and captions
      datasetZip: `data:application/zip;base64,${base64Zip}`,

      // Training hyperparameters
      trainingParams: {
        epochs: config.epochs,
        learningRate: config.learningRate,
        networkDim: config.rank,
        networkAlpha: config.alpha,
        resolution: config.resolution,
        scheduler: config.scheduler,
        optimizer: config.optimizer,
        trainBatchSize: 1,
        gradAccumSteps: 1,
        mixedPrecision: "bf16",
      },

      // Trigger word and captioning
      triggerWord: config.triggerWord,
      captioning: {
        enabled: config.autoCaptioning,
        model: "wd_tagger",
        prefix: config.triggerWord,
      },

      // Model type
      type: "lora",
      loraType: "standard",
      baseModel: {
        id: config.baseModelId,
        type: "checkpoint",
      },
    },
  };

  console.log("📤 Submitting training request...\n");

  try {
    const endpoint = `${ORCHESTRATION_BASE}/recipes/imageResourceTraining`;
    console.log(`🔗 POST ${endpoint}\n`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CIVITAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("\n❌ API Error Response:");
      console.error(errorText.substring(0, 500));
      throw new Error(`API Error ${response.status}`);
    }

    const result = await response.json() as any;
    console.log("\n✅ Training Submitted Successfully!\n");

    const jobId =
      result.jobId ||
      result.id ||
      result.trainingId ||
      result.job?.id ||
      result.recipe?.id;

    console.log("📊 Training Job Details:");
    console.log(`   Job ID: ${jobId}`);
    console.log(`   Model Name: ${config.modelName}`);
    console.log(`   Trigger Word: ${config.triggerWord}`);
    console.log(`   Epochs: ${config.epochs}`);
    console.log(`   Status: ${result.status || "Submitted"}`);

    if (result.estimatedTime) {
      console.log(`   Estimated Time: ${result.estimatedTime}`);
    }

    console.log("\n🔗 View on Civitai:");
    console.log(`   https://civitai.com/user/training`);

    if (result) {
      console.log("\n📋 Full Response:");
      console.log(JSON.stringify(result, null, 2).substring(0, 500));
    }

    return jobId || "training-submitted";

  } catch (error) {
    console.error("❌ Failed to submit training:", error);
    throw error;
  }
}

async function main() {
  const zipPath = process.argv[2];

  if (!zipPath) {
    console.log("\n📝 USAGE:\n");
    console.log(
      `   npx tsx lib/trainLoraWithZip.ts '<path-to-zip-file>'\n`
    );
    console.log(`EXAMPLE:\n`);
    console.log(
      `   npx tsx lib/trainLoraWithZip.ts '../training_dataset_vivienne/vivienne_training_dataset.zip'\n`
    );
    process.exit(1);
  }

  try {
    const config: TrainingConfig = {
      baseModelId: "635127", // CyberRealistic Pony v18.0 CoreShift
      modelName: "Vivienne_LoRA_Soul_v1",
      zipPath: zipPath,
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

    console.log("🎬 Civitai LoRA Training - ZIP Upload Pipeline");
    console.log("=============================================");

    const jobId = await submitLoRATrainingWithZip(config);

    console.log("\n🎉 Training Pipeline Complete!");
    console.log(`\n📌 Job ID: ${jobId}`);
    console.log(`Model: ${config.modelName}`);
    console.log(`Trigger: ${config.triggerWord}`);

  } catch (error) {
    console.error("\n❌ Pipeline Error:", error);
    process.exit(1);
  }
}

main();
