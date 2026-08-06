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

// Civitai API endpoints
const ORCHESTRATION_BASE = "https://orchestration.civitai.com/v2/consumer";
const TRAINING_ENDPOINT = `${ORCHESTRATION_BASE}/recipes/imageResourceTraining`;

interface TrainingConfig {
  baseModelId: string;
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

async function uploadImageAsBase64(
  filePath: string
): Promise<{ data: string; filename: string }> {
  const fileData = await fs.readFile(filePath);
  const base64 = fileData.toString("base64");
  const filename = path.basename(filePath);
  return { data: base64, filename };
}

async function startLoRATrainingWithLocalImages(
  config: TrainingConfig
): Promise<string> {
  console.log("\n🚀 Starting LoRA Training with Local Images");
  console.log("===========================================\n");

  // Read all images and captions from dataset
  const datasetDir = resolve(config.datasetPath);
  const files = await fs.readdir(datasetDir);
  const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

  if (imageFiles.length === 0) {
    throw new Error("No images found in dataset");
  }

  console.log(`📂 Found ${imageFiles.length} images in dataset\n`);
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
  console.log(`   Auto-Captioning: ${config.autoCaptioning ? "Yes (WD Tagger)" : "No"}`);
  console.log(`   Dataset Size: ${imageFiles.length} images\n`);

  // Prepare image data with captions
  const imageDataList: Array<{
    filename: string;
    base64: string;
    caption: string;
  }> = [];

  console.log("📤 Preparing images...");
  for (let i = 0; i < imageFiles.length; i++) {
    const filename = imageFiles[i];
    const filePath = path.join(datasetDir, filename);

    // Read image
    const imgData = await uploadImageAsBase64(filePath);

    // Read caption if exists
    const captionPath = path.join(datasetDir, filename.replace(/\.\w+$/, ".txt"));
    let caption = config.triggerWord;
    try {
      caption = await fs.readFile(captionPath, "utf-8");
    } catch {
      // No caption file, use default
    }

    imageDataList.push({
      filename: imgData.filename,
      base64: imgData.data,
      caption: caption.trim(),
    });

    console.log(`   [${i + 1}/${imageFiles.length}] ${filename}`);
  }

  console.log("\n📤 Submitting training request to Civitai...\n");

  // Create training payload - different format for Civitai training
  const payload = {
    inputs: {
      // Model configuration
      modelId: config.baseModelId,
      name: config.modelName,
      description: `LoRA trained with Vivienne Soul ID character. Trigger word: ${config.triggerWord}`,

      // Training data
      images: imageDataList.map((img) => ({
        url: `data:image/png;base64,${img.base64}`,
        caption: img.caption,
      })),

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

  try {
    console.log(`🔗 POST ${TRAINING_ENDPOINT}\n`);

    const response = await fetch(TRAINING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CIVITAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ API Error Response:");
      console.error(errorText);
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const result = await response.json() as any;
    console.log("✅ Training Submitted Successfully!\n");

    const jobId = result.jobId || result.id || result.trainingId || result.job?.id;

    console.log("📊 Training Job Details:");
    console.log(`   Job ID: ${jobId}`);
    console.log(`   Model Name: ${config.modelName}`);
    console.log(`   Trigger Word: ${config.triggerWord}`);
    console.log(`   Images: ${imageDataList.length}`);
    console.log(`   Epochs: ${config.epochs}`);
    console.log(`   Status: ${result.status || "Submitted"}`);

    console.log("\n🔗 View on Civitai:");
    console.log(`   https://civitai.com/user/training`);

    return jobId || "training-submitted";

  } catch (error) {
    console.error("❌ Failed to submit training:", error);
    throw error;
  }
}

async function main() {
  const datasetPath = process.argv[2];

  if (!datasetPath) {
    console.log("\n📝 USAGE:\n");
    console.log(
      `   npx tsx lib/trainLoraVivienneFinal.ts '<path-to-dataset-dir>'\n`
    );
    console.log(`EXAMPLE:\n`);
    console.log(
      `   npx tsx lib/trainLoraVivienneFinal.ts '../training_dataset_vivienne'\n`
    );
    process.exit(1);
  }

  try {
    const config: TrainingConfig = {
      baseModelId: "635127", // CyberRealistic Pony v18.0 CoreShift
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

    console.log("🎬 Civitai LoRA Training - Automated Pipeline");
    console.log("============================================");

    const jobId = await startLoRATrainingWithLocalImages(config);

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
