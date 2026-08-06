import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";

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

async function uploadAndTrain() {
  const env = loadEnv();
  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const falApiKey = env.FAL_API_KEY || process.env.FAL_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }
  if (!falApiKey) {
    throw new Error("FAL_API_KEY not configured");
  }

  fal.config({ credentials: falApiKey });

  // Read batch ZIPs list
  const batchListPath = resolve(
    "artifacts/vivien_lora_v2/dataset_zip/batch_zips.json"
  );

  if (!require("fs").existsSync(batchListPath)) {
    throw new Error("batch_zips.json not found. Run PowerShell extraction first.");
  }

  const batchContent = readFileSync(batchListPath, "utf-8");
  const batchZips = JSON.parse(batchContent) as string[];

  if (batchZips.length === 0) {
    throw new Error("No batch ZIPs found");
  }

  console.log(`\n📦 Found ${batchZips.length} batch ZIPs\n`);

  // Initialize Supabase
  const supabase = createClient(supabaseUrl, supabaseKey);
  const bucketName = "vivien-media";

  // Upload first batch ZIP (contains all 19 images across all batches)
  console.log(`📤 Uploading first batch to Supabase (${bucketName})...\n`);

  const batchZipPath = batchZips[0];
  const fileName = `lora/vivien_lora_v2_batch1_${Date.now()}.zip`;

  const zipData = readFileSync(batchZipPath);
  const sizeMB = (zipData.length / (1024 * 1024)).toFixed(2);

  console.log(`   File: ${require("path").basename(batchZipPath)}`);
  console.log(`   Size: ${sizeMB} MB`);
  console.log(`   Uploading...\n`);

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, zipData, {
      contentType: "application/zip",
      upsert: false,
    });

  if (error) {
    console.error(`   ❌ Upload failed: ${error.message}`);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);
  const publicUrl = urlData.publicUrl;

  console.log(`   ✅ Upload complete!`);
  console.log(`   URL: ${publicUrl}\n`);

  // Submit training
  console.log(`🚀 Submitting training to fal.ai...\n`);
  console.log(`   Dataset: ${require("path").basename(batchZipPath)}`);
  console.log(`   Endpoint: fal-ai/flux-lora-fast-training`);
  console.log(`   Trigger: vivienv2x`);
  console.log(`   Steps: 900\n`);

  const trainingInput = {
    images_data_url: publicUrl,
    trigger_word: "vivienv2x",
    steps: "900",
    create_masks: true,
    is_style: false,
    is_input_format_already_preprocessed: false,
    data_archive_format: "zip",
  };

  try {
    const submitResult = await fal.queue.submit(
      "fal-ai/flux-lora-fast-training",
      {
        input: trainingInput as Record<string, unknown>,
      }
    );

    const requestId = (submitResult as { request_id: string }).request_id;
    if (!requestId) throw new Error("No request_id returned");

    console.log(`✅ Training submitted!`);
    console.log(`   Request ID: ${requestId}`);
    console.log(
      `   Monitor: https://fal.run/fal-ai/flux-lora-fast-training?request_id=${requestId}\n`
    );

    // Save submission
    await fs.writeFile(
      "artifacts/vivien_lora_v2/metadata/training-submission.json",
      JSON.stringify(
        {
          request_id: requestId,
          submitted_at: new Date().toISOString(),
          dataset_url: publicUrl,
          dataset_file: fileName,
          dataset_size_mb: parseFloat(sizeMB),
          batch_zips_total: batchZips.length,
          config: { trigger_word: "vivienv2x", steps: 900 },
        },
        null,
        2
      )
    );

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 720;

    console.log(`⏳ Monitoring training (max 120 minutes)...\n`);

    while (attempts < maxAttempts) {
      const status = await fal.queue.status(
        "fal-ai/flux-lora-fast-training",
        {
          requestId,
        }
      );

      const statusValue = (status as { status?: string }).status;

      if (statusValue === "COMPLETED") {
        try {
          const result = await fal.queue.result(
            "fal-ai/flux-lora-fast-training",
            {
              requestId,
            }
          );

          console.log(`\n✅ Training COMPLETED!\n`);

          // Save result
          await fs.writeFile(
            "artifacts/vivien_lora_v2/metadata/training-result.json",
            JSON.stringify(result, null, 2)
          );

          const loraUrl =
            (result as any)?.data?.diffusers_lora_file?.url ||
            (result as any)?.diffusers_lora_file?.url;

          if (loraUrl) {
            console.log(`   LoRA URL: ${loraUrl}`);
          }

          console.log(`\n   Result: artifacts/vivien_lora_v2/metadata/training-result.json`);
          console.log(`\n   Next: Run inference testing`);
          console.log(`   npx tsx lib/testFluxLoraInference.ts\n`);

          return { request_id: requestId, status: "completed" };
        } catch (err) {
          console.log(`   ⚠️  Warning: Could not fetch full result`);
          console.log(`   Check dashboard: https://dashboard.fal.ai`);
          return { request_id: requestId, status: "completed_fetch_error" };
        }
      }

      if (statusValue === "FAILED" || statusValue === "ERROR") {
        console.error(`\n❌ Training FAILED\n`);
        console.error(JSON.stringify(status, null, 2));
        process.exit(1);
      }

      attempts++;
      if (attempts % 6 === 0) {
        const elapsed = Math.round((attempts * 10) / 60);
        console.log(`   [${elapsed}m] Status: ${statusValue}`);
      }

      await new Promise((r) => setTimeout(r, 10000));
    }

    console.error(`\n❌ Training timed out after 120 minutes\n`);
    process.exit(1);
  } catch (err: unknown) {
    console.error(
      `\n❌ Error:`,
      err instanceof Error ? err.message : err,
      `\n`
    );
    process.exit(1);
  }
}

uploadAndTrain();
