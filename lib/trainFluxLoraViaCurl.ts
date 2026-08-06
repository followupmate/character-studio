// Use curl to submit training with pre-existing ZIP URL
// User provides URL and we submit directly to fal.ai

import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";

async function trainWithUrl() {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");

  fal.config({ credentials: falApiKey });

  // For this to work, user must:
  // 1. Upload ZIP to GitHub releases
  // 2. Get raw download URL
  // 3. Pass as argument

  const zipUrl = process.argv[2];

  if (!zipUrl) {
    console.log(`\n📝 MANUAL TRAINING SUBMISSION GUIDE\n`);
    console.log(`Since Supabase has size limits, use GitHub for free hosting:\n`);
    console.log(`1. Go to: https://github.com/followupmate/character-studio/releases/new`);
    console.log(`2. Create release:`);
    console.log(`   - Tag: vivien-lora-v2-20260806`);
    console.log(`   - Title: Vivien LoRA V2 Training Dataset`);
    console.log(`   - Upload file: artifacts/vivien_lora_v2/dataset_zip/vivien_lora_v2_training_dataset.zip`);
    console.log(`   - Click "Publish release"\n`);
    console.log(`3. Wait for upload to complete, then get download link`);
    console.log(`4. Run this command:`);
    console.log(
      `   npx tsx lib/trainFluxLoraViaCurl.ts 'https://github.com/.../vivien_lora_v2_training_dataset.zip'\n`
    );
    console.log(`Alternatively, use any public URL to the ZIP file.`);
    process.exit(1);
  }

  console.log(`\n🚀 Submitting training to fal.ai...\n`);
  console.log(`   Dataset URL: ${zipUrl}`);
  console.log(`   Endpoint: fal-ai/flux-lora-fast-training`);
  console.log(`   Trigger: vivienv2x`);
  console.log(`   Steps: 900\n`);

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
    if (!requestId) throw new Error("No request_id");

    console.log(`✅ Training submitted!`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   Monitor: https://fal.run/fal-ai/flux-lora-fast-training?request_id=${requestId}\n`);

    // Save submission
    await fs.writeFile(
      "artifacts/vivien_lora_v2/metadata/training-submission.json",
      JSON.stringify(
        {
          request_id: requestId,
          submitted_at: new Date().toISOString(),
          dataset_url: zipUrl,
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
      const status = await fal.queue.status("fal-ai/flux-lora-fast-training", {
        requestId,
      });

      const statusValue = (status as { status?: string }).status;

      if (statusValue === "COMPLETED") {
        try {
          const result = await fal.queue.result("fal-ai/flux-lora-fast-training", {
            requestId,
          });

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
    console.error(`\n❌ Error:`, err instanceof Error ? err.message : err, `\n`);
    process.exit(1);
  }
}

trainWithUrl();
