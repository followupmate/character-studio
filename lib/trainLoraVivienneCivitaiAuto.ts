import { readFileSync, promises as fs } from "fs";
import { resolve } from "path";
import * as path from "path";
import * as FormData from "form-data";
import fetch from "node-fetch";

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

async function uploadImages(datasetPath: string): Promise<string[]> {
  console.log("\n📤 Uploading images to Civitai...");

  const datasetDir = resolve(datasetPath);
  const files = await fs.readdir(datasetDir);
  const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

  if (imageFiles.length === 0) {
    throw new Error("No images found in dataset");
  }

  console.log(`Found ${imageFiles.length} images\n`);

  // Upload images one by one
  const uploadedIds: string[] = [];
  let successCount = 0;

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const filePath = path.join(datasetDir, file);

    try {
      console.log(`[${i + 1}/${imageFiles.length}] Uploading ${file}...`);

      // Read file
      const fileData = await fs.readFile(filePath);

      // Upload to Civitai
      const form = new FormData();
      form.append("file", fileData, { filename: file });

      const uploadResponse = await fetch(`${ORCHESTRATION_BASE}/images/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CIVITAI_API_KEY}`,
        },
        body: form as any,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        console.error(`   ❌ Upload failed: ${error}`);
        continue;
      }

      const uploadResult = await uploadResponse.json() as any;
      const imageId = uploadResult.id || uploadResult.imageId;

      if (imageId) {
        uploadedIds.push(imageId);
        successCount++;
        console.log(`   ✓ Uploaded (ID: ${imageId})`);
      }
    } catch (error) {
      console.error(`   ❌ Error uploading ${file}: ${error}`);
    }
  }

  console.log(`\n✅ Uploaded ${successCount}/${imageFiles.length} images\n`);
  return uploadedIds;
}

async function startLoRATraining(
  config: TrainingConfig,
  imageIds: string[]
): Promise<string> {
  console.log("\n🚀 Starting LoRA Training");
  console.log("========================\n");

  console.log("📋 Training Configuration:");
  console.log(`   Base Model: ${config.baseModelId}`);
  console.log(`   Model Name: ${config.modelName}`);
  console.log(`   Trigger Word: ${config.triggerWord}`);
  console.log(`   Epochs: ${config.epochs}`);
  console.log(`   Learning Rate: ${config.learningRate}`);
  console.log(`   Rank: ${config.rank}`);
  console.log(`   Alpha: ${config.alpha}`);
  console.log(`   Resolution: ${config.resolution}`);
  console.log(`   Scheduler: ${config.scheduler}`);
  console.log(`   Optimizer: ${config.optimizer}`);
  console.log(`   Images: ${imageIds.length}\n`);

  const payload = {
    inputs: {
      model: config.baseModelId,
      name: config.modelName,
      triggerWord: config.triggerWord,
      images: imageIds,
      epochs: config.epochs,
      learningRate: config.learningRate,
      networkDim: config.rank,
      networkAlpha: config.alpha,
      resolution: config.resolution,
      scheduler: config.scheduler,
      optimizer: config.optimizer,
      autoCaptioning: config.autoCaptioning ? "enabled" : "disabled",
      captioningPrefix: config.triggerWord,
      captioningModel: "wd_tagger",
      // Additional parameters for better control
      trainBatchSize: 1,
      gradAccumSteps: 1,
      mixedPrecision: "bf16",
      useLoRA: true,
      loraType: "standard",
    },
  };

  console.log("📤 Submitting to Civitai Orchestration API...");
  console.log(`   POST ${TRAINING_ENDPOINT}\n`);

  try {
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
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const result = await response.json() as any;
    console.log("✅ Training Submitted Successfully!\n");

    const jobId = result.jobId || result.id || result.trainingId;
    if (!jobId) {
      console.warn("⚠️  Could not extract job ID from response");
      console.log("Response:", JSON.stringify(result, null, 2));
      return "";
    }

    console.log("📊 Training Job Details:");
    console.log(`   Job ID: ${jobId}`);
    console.log(`   Status: ${result.status || "Submitted"}`);
    console.log(`   Model Name: ${config.modelName}`);
    console.log(`   Trigger Word: ${config.triggerWord}`);
    console.log("\n🔗 Monitor at: https://civitai.com/user/training");
    console.log(`   API Endpoint: ${TRAINING_ENDPOINT}`);

    return jobId;

  } catch (error) {
    console.error("❌ Failed to submit training:", error);
    throw error;
  }
}

async function monitorTraining(jobId: string, maxWaitMinutes = 360) {
  console.log("\n⏱️  Monitoring Training Progress");
  console.log("===============================\n");

  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  let lastStatus = "";

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(
        `${ORCHESTRATION_BASE}/jobs/${jobId}`,
        {
          headers: {
            "Authorization": `Bearer ${CIVITAI_API_KEY}`,
          },
        }
      );

      if (!response.ok) {
        console.log(`⚠️  Status check failed: ${response.status}`);
        await new Promise((r) => setTimeout(r, 30000)); // Wait 30s
        continue;
      }

      const status = await response.json() as any;
      const currentStatus = status.status || status.state || "unknown";

      if (currentStatus !== lastStatus) {
        lastStatus = currentStatus;
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Status: ${currentStatus}`);

        if (status.progress !== undefined) {
          console.log(`   Progress: ${status.progress}%`);
        }
        if (status.eta !== undefined) {
          console.log(`   ETA: ${status.eta}`);
        }
      }

      // Check for completion
      if (
        currentStatus === "completed" ||
        currentStatus === "succeeded" ||
        currentStatus === "done"
      ) {
        console.log("\n✅ Training Completed!");
        console.log("📊 Final Status:", JSON.stringify(status, null, 2));
        return status;
      }

      if (currentStatus === "failed" || currentStatus === "error") {
        console.error("\n❌ Training Failed!");
        console.error("Error Details:", JSON.stringify(status, null, 2));
        throw new Error(`Training failed: ${currentStatus}`);
      }

      // Wait before next check
      await new Promise((r) => setTimeout(r, 60000)); // Check every 60s
    } catch (error) {
      console.error("Error checking status:", error);
      await new Promise((r) => setTimeout(r, 60000));
    }
  }

  throw new Error(`Training did not complete within ${maxWaitMinutes} minutes`);
}

async function main() {
  const datasetPath = process.argv[2];

  if (!datasetPath) {
    console.log("\n📝 USAGE:\n");
    console.log(
      `   npx tsx lib/trainLoraVivienneCivitaiAuto.ts '<path-to-dataset-dir>'\n`
    );
    console.log(`EXAMPLE:\n`);
    console.log(
      `   npx tsx lib/trainLoraVivienneCivitaiAuto.ts 'training_dataset_vivienne/vivienne_training_dataset'\n`
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

    console.log("🎬 Civitai LoRA Training Pipeline");
    console.log("==================================");

    // Phase 1: Upload images
    const imageIds = await uploadImages(config.datasetPath);

    if (imageIds.length === 0) {
      throw new Error("No images were uploaded successfully");
    }

    // Phase 2: Start training
    const jobId = await startLoRATraining(config, imageIds);

    if (!jobId) {
      throw new Error("Training job was not created");
    }

    // Phase 3: Monitor training
    const finalStatus = await monitorTraining(jobId);

    console.log("\n🎉 Training Pipeline Complete!");
    console.log(`\nYour LoRA Model: ${config.modelName}`);
    console.log(`Trigger Word: ${config.triggerWord}`);
    console.log(`\n🔗 View on Civitai: https://civitai.com/user/training`);

  } catch (error) {
    console.error("\n❌ Pipeline Error:", error);
    process.exit(1);
  }
}

main();
