import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { resolve, basename } from "path";
import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";

// Upload Vivien LoRA dataset to Supabase & submit training with presigned URLs

async function trainFluxLoraViaSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const falApiKey = process.env.FAL_API_KEY;

  if (!supabaseUrl || !supabaseKey || !falApiKey) {
    throw new Error("Missing: SUPABASE_URL, SUPABASE_SERVICE_KEY, or FAL_API_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`📦 Uploading Vivien LoRA dataset to Supabase...`);

  // Create bucket for vivien-lora if doesn't exist
  const bucketName = "vivien-lora-v2";

  try {
    await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 500000000, // 500 MB
    });
    console.log(`   ✅ Bucket created: ${bucketName}`);
  } catch {
    console.log(`   ℹ️  Bucket already exists: ${bucketName}`);
  }

  // Upload ZIP directly (simpler than individual files)
  const zipPath = resolve("artifacts/vivien_lora_v2/dataset_zip/vivien_lora_v2_training_dataset.zip");

  if (!require("fs").existsSync(zipPath)) {
    throw new Error(`ZIP not found: ${zipPath}`);
  }

  console.log(`   Uploading ZIP: ${zipPath}`);

  const zipData = readFileSync(zipPath);
  const zipFileName = "vivien_lora_v2_training_dataset.zip";

  try {
    await supabase.storage
      .from(bucketName)
      .upload(`vivien-lora-v2/${zipFileName}`, zipData, {
        contentType: "application/zip",
        upsert: true,
      });

    console.log(`   ✅ ZIP uploaded (${(zipData.length / (1024 * 1024)).toFixed(2)} MB)`);
  } catch (err) {
    console.error(`   ❌ Upload failed: ${err}`);
    throw err;
  }

  // Get public URL for ZIP
  console.log(`\n📋 Generating download URL...`);

  const { data } = supabase.storage
    .from(bucketName)
    .getPublicUrl(`vivien-lora-v2/${zipFileName}`);

  const zipPublicUrl = data.publicUrl;
  console.log(`   ✅ ZIP URL: ${zipPublicUrl}`);

  // Now submit training with ZIP URL to fal.ai
  console.log(`\n🚀 Submitting training to fal.ai...`);

  fal.config({ credentials: falApiKey });

  const datasetUrl = zipPublicUrl;
  console.log(`   Dataset URL: ${datasetUrl}`);

  const trainingInput = {
    images_data_url: datasetUrl,
    trigger_word: "vivienv2x",
    steps: "900",
    create_masks: true,
    is_style: false,
    is_input_format_already_preprocessed: false,
    data_archive_format: "zip",
  };

  try {
    const submitResult = await fal.queue.submit("fal-ai/flux-lora-fast-training", {
      input: trainingInput as Record<string, unknown>,
    });

    const requestId = (submitResult as { request_id: string }).request_id;
    if (!requestId) {
      console.error(`❌ No request_id returned`);
      console.error(`Response:`, submitResult);
      process.exit(1);
    }

    console.log(`\n✅ Training submitted!`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   Monitor: https://fal.run/fal-ai/flux-lora-fast-training?request_id=${requestId}\n`);

    // Save submission
    const submissionData = {
      request_id: requestId,
      submitted_at: new Date().toISOString(),
      dataset_url: datasetUrl,
      supabase_bucket: bucketName,
      zip_size_mb: (zipData.length / (1024 * 1024)).toFixed(2),
      config: {
        trigger_word: "vivienv2x",
        steps: 900,
      },
    };

    await fs.writeFile(
      "artifacts/vivien_lora_v2/metadata/training-submission.json",
      JSON.stringify(submissionData, null, 2)
    );

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 720;

    console.log(`⏳ Monitoring training (max 120 minutes)...`);

    while (attempts < maxAttempts) {
      const status = await fal.queue.status("fal-ai/flux-lora-fast-training", {
        requestId,
      });

      const statusValue = (status as { status?: string }).status;

      if (statusValue === "COMPLETED") {
        const result = await fal.queue.result("fal-ai/flux-lora-fast-training", {
          requestId,
        });

        console.log(`\n✅ Training COMPLETED!`);

        // Save result
        await fs.writeFile(
          "artifacts/vivien_lora_v2/metadata/training-result.json",
          JSON.stringify(result, null, 2)
        );

        return {
          request_id: requestId,
          status: "completed",
        };
      }

      if (statusValue === "FAILED" || statusValue === "ERROR") {
        console.error(`\n❌ Training FAILED`);
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

    console.error(`❌ Training timed out`);
    process.exit(1);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(`❌ Submission failed: ${err.message}`);
    } else {
      console.error(`❌ Submission failed:`, err);
    }
    process.exit(1);
  }
}

trainFluxLoraViaSupabase().catch((err) => {
  console.error(`❌ Error:`, err.message);
  process.exit(1);
});
