import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";

// Submit Vivien LoRA V2 training using presigned/public ZIP URL
// Avoids 502 Bad Gateway from large base64 payloads

async function trainFluxLoraWithUrl() {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falApiKey });

  // ZIP URL - provide as command line arg or use default
  let zipUrl = process.argv[2];

  if (!zipUrl) {
    console.error(`❌ ZIP URL required as command line argument`);
    console.error(`Usage: npx tsx lib/trainFluxLoraWithUrl.ts <zip-url>`);
    console.error(
      `\nExample: npx tsx lib/trainFluxLoraWithUrl.ts https://github.com/followupmate/character-studio/releases/download/vivien-lora-v2-20260806/vivien_lora_v2_training_dataset.zip`
    );
    process.exit(1);
  }

  console.log(`🧪 Training Vivien LoRA V2 with URL-based dataset`);
  console.log(`   ZIP URL: ${zipUrl}`);
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

  console.log(`🚀 Submitting training...`);

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

    console.log(`✅ Training submitted!`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   Monitor: https://fal.run/fal-ai/flux-lora-fast-training?request_id=${requestId}\n`);

    // Save submission metadata
    const submissionData = {
      request_id: requestId,
      submitted_at: new Date().toISOString(),
      endpoint: "fal-ai/flux-lora-fast-training",
      dataset_url: zipUrl,
      config: {
        trigger_word: "vivienv2x",
        steps: 900,
        images: 19,
        base_model: "FLUX.1 Dev (provider default)",
      },
    };

    await fs.writeFile(
      "artifacts/vivien_lora_v2/metadata/training-submission.json",
      JSON.stringify(submissionData, null, 2)
    );
    console.log(`✅ Submission saved: artifacts/vivien_lora_v2/metadata/training-submission.json\n`);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 720; // ~120 minutes

    console.log(`⏳ Monitoring training progress (max 120 minutes)...`);

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

        // Extract LoRA file
        let loraUrl: string | undefined;
        const resultData = (result as { data?: unknown }).data || result;
        if (typeof resultData === "object" && resultData !== null) {
          const diffusersFile = (resultData as any).diffusers_lora_file;
          if (diffusersFile && typeof diffusersFile === "object") {
            loraUrl = (diffusersFile as any).url;
          }
        }

        if (loraUrl) {
          console.log(`   LoRA URL: ${loraUrl}`);
        } else {
          console.log(`   ⚠️  LoRA URL not found in standard fields (check JSON)`);
        }

        // Save result
        await fs.writeFile(
          "artifacts/vivien_lora_v2/metadata/training-result.json",
          JSON.stringify(result, null, 2)
        );
        console.log(`   Result saved: artifacts/vivien_lora_v2/metadata/training-result.json\n`);

        console.log(`🎯 Next step: Run inference testing`);
        console.log(`   npx tsx lib/testFluxLoraInference.ts`);

        return {
          request_id: requestId,
          status: "completed",
          lora_url: loraUrl,
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

    console.error(`❌ Training timed out after 120 minutes`);
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

trainFluxLoraWithUrl();
