import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  console.log(`📝 Loading env from: ${envPath}\n`);
  const envContent = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};

  envContent.split("\n").forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith("#")) return;

    const idx = line.indexOf("=");
    if (idx === -1) return;

    const key = line.substring(0, idx).trim();
    let value = line.substring(idx + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  });

  console.log(`✓ Loaded ${Object.keys(env).length} env variables`);
  console.log(`✓ SUPABASE_URL: ${env.SUPABASE_URL ? "✓" : "✗"}`);
  console.log(`✓ SUPABASE_SERVICE_KEY: ${env.SUPABASE_SERVICE_KEY ? "✓" : "✗"}`);
  console.log(`✓ FAL_API_KEY: ${env.FAL_API_KEY ? "✓" : "✗"}\n`);

  return env;
}

async function trainWithDirectUpload() {
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

  // Get ZIP file path from command line
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.log(`\n📝 USAGE\n`);
    console.log(`   npx tsx lib/trainFluxLoraDirectUpload.ts '<path-to-zip>'\n`);
    console.log(`EXAMPLE:\n`);
    console.log(
      `   npx tsx lib/trainFluxLoraDirectUpload.ts 'artifacts/vivien_lora_v2/dataset_zip/vivien_lora_v2_training_dataset.zip'\n`
    );
    process.exit(1);
  }

  const fullPath = resolve(zipPath);
  console.log(`\n📂 Checking file: ${fullPath}`);

  if (!require("fs").existsSync(fullPath)) {
    throw new Error(`ZIP not found: ${fullPath}`);
  }

  const stats = require("fs").statSync(fullPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`   Size: ${sizeMB} MB\n`);

  // Initialize Supabase
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check/create bucket with higher limits
  const bucketName = "vivien-lora-uploads";

  console.log(`📦 Setting up Supabase bucket: "${bucketName}"\n`);

  // Try to create bucket if it doesn't exist
  try {
    const { error: createError } = await supabase.storage.createBucket(
      bucketName,
      {
        public: true,
        fileSizeLimit: 500000000, // 500 MB
      }
    );

    if (createError && !createError.message.includes("already exists")) {
      console.log(`   ⚠️  Could not create bucket: ${createError.message}`);
    } else if (!createError) {
      console.log(`   ✓ Bucket created: "${bucketName}"\n`);
    }
  } catch (err) {
    // Bucket might already exist, continue
  }

  // Upload to Supabase
  const fileName = `training/vivien_lora_v2_${Date.now()}.zip`;
  const zipData = readFileSync(fullPath);

  console.log(`📤 Uploading to Supabase...\n`);

  try {
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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    console.log(`   ✅ Upload complete!`);
    console.log(`   File: ${fileName}`);
    console.log(`   URL: ${publicUrl}\n`);

    // Submit training
    console.log(`🚀 Submitting training to fal.ai...\n`);
    console.log(`   Dataset URL: ${publicUrl}`);
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
          config: { trigger_word: "vivienv2x", steps: 900 },
        },
        null,
        2
      )
    );

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 720; // 120 minutes

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

trainWithDirectUpload();
