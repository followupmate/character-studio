import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";

// Upload to existing Supabase bucket and train

async function trainFluxLora() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const falApiKey = process.env.FAL_API_KEY;

  if (!supabaseUrl || !supabaseKey || !falApiKey) {
    throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or FAL_API_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const zipPath = resolve("artifacts/vivien_lora_v2/dataset_zip/vivien_lora_v2_training_dataset.zip");
  const zipData = readFileSync(zipPath);
  const bucketName = "vivien-media"; // Use existing bucket

  console.log(`📦 Uploading to Supabase (vivien-media bucket)...`);
  console.log(`   File: ${zipPath}`);
  console.log(`   Size: ${(zipData.length / (1024 * 1024)).toFixed(2)} MB`);

  // Upload with timestamp to avoid conflicts
  const timestamp = new Date().toISOString().split("T")[0];
  const fileName = `lora/vivien_lora_v2_${timestamp}.zip`;

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, zipData, {
        contentType: "application/zip",
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    console.log(`   ✅ Uploaded: ${fileName}`);
  } catch (err) {
    console.error(`   ❌ Upload error: ${err}`);
    throw err;
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  const zipUrl = urlData.publicUrl;

  console.log(`\n🔗 Public URL: ${zipUrl}`);

  // Verify URL is accessible
  console.log(`\n✅ Verifying URL accessibility...`);
  try {
    const response = await fetch(zipUrl, { method: "HEAD" });
    if (response.ok) {
      console.log(`   ✅ URL is accessible (${response.status})`);
    } else {
      console.log(`   ⚠️  URL returned ${response.status} - may still work`);
    }
  } catch (err) {
    console.log(`   ⚠️  Could not verify: ${err}`);
  }

  // Submit training
  console.log(`\n🚀 Submitting training to fal.ai...`);

  fal.config({ credentials: falApiKey });

  const trainingInput = {
    images_data_url: zipUrl,
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
      throw new Error("No request_id returned");
    }

    console.log(`   ✅ Training submitted!`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   Monitor: https://fal.run/fal-ai/flux-lora-fast-training?request_id=${requestId}\n`);

    // Save submission
    const submissionData = {
      request_id: requestId,
      submitted_at: new Date().toISOString(),
      dataset_url: zipUrl,
      supabase_bucket: bucketName,
      supabase_file: fileName,
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
        try {
          const result = await fal.queue.result("fal-ai/flux-lora-fast-training", {
            requestId,
          });

          console.log(`\n✅ Training COMPLETED!`);

          // Save result
          await fs.writeFile(
            "artifacts/vivien_lora_v2/metadata/training-result.json",
            JSON.stringify(result, null, 2)
          );

          // Extract LoRA URL
          const loraUrl =
            (result as any)?.data?.diffusers_lora_file?.url ||
            (result as any)?.diffusers_lora_file?.url;

          if (loraUrl) {
            console.log(`   LoRA URL: ${loraUrl}`);
          }

          console.log(`   Result saved: artifacts/vivien_lora_v2/metadata/training-result.json`);

          return { request_id: requestId, status: "completed" };
        } catch (resultErr) {
          console.error(`   Warning: Could not fetch result: ${resultErr}`);
          console.log(`   Check dashboard: ${requestId}`);
          return { request_id: requestId, status: "completed_but_result_error" };
        }
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

trainFluxLora().catch((err) => {
  console.error(`❌ Error:`, err.message);
  process.exit(1);
});
