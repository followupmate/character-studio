import { fal } from "@fal-ai/client";
import { readFileSync } from "fs";
import { resolve } from "path";

// Submit Vivien LoRA V2 training using local ZIP file
// fal-ai/flux-lora-fast-training expects images_data_url, but we'll try with file path first

async function trainFluxLoraWithZip() {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falApiKey });

  const zipPath = resolve("artifacts/vivien_lora_v2/dataset_zip/vivien_lora_v2_training_dataset.zip");

  // Read ZIP file
  let zipData: Buffer;
  try {
    zipData = readFileSync(zipPath);
    console.log(`✅ ZIP loaded: ${zipPath}`);
    console.log(`   Size: ${(zipData.length / (1024 * 1024)).toFixed(2)} MB`);
  } catch (err) {
    console.error(`❌ Failed to load ZIP: ${err}`);
    process.exit(1);
  }

  // Strategy 1: Try images_data_url as file:// URL (may not work)
  // Strategy 2: Try as base64 data URL (works but large payload)
  // Strategy 3: Upload to fal.ai file storage first

  // For now, use base64 data URL (fal-ai should accept it)
  const base64Zip = zipData.toString("base64");
  const dataUrl = `data:application/zip;base64,${base64Zip}`;

  console.log(`\n📤 Preparing training submission...`);
  console.log(`   Endpoint: fal-ai/flux-lora-fast-training`);
  console.log(`   Trigger: vivienv2x`);
  console.log(`   Steps: 900`);
  console.log(`   Images: 19 + captions`);
  console.log(`   Payload size: ${(base64Zip.length / (1024 * 1024)).toFixed(2)} MB`);

  const trainingInput = {
    images_data_url: dataUrl,
    trigger_word: "vivienv2x",
    steps: "900",
    create_masks: true,
    is_style: false,
    is_input_format_already_preprocessed: false,
    data_archive_format: "zip",
  };

  console.log(`\n🚀 Submitting training...`);

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
    console.log(`   Monitor: https://fal.run/fal-ai/flux-lora-fast-training?request_id=${requestId}`);

    // Save request ID for monitoring
    const { promises: fs } = await import("fs");
    await fs.writeFile(
      "artifacts/vivien_lora_v2/metadata/training-submission.json",
      JSON.stringify(
        {
          request_id: requestId,
          submitted_at: new Date().toISOString(),
          endpoint: "fal-ai/flux-lora-fast-training",
          config: {
            trigger_word: "vivienv2x",
            steps: 900,
            images: 19,
            base_model: "FLUX.1 Dev (provider default)",
          },
          dataset_zip_size: `${(zipData.length / (1024 * 1024)).toFixed(2)} MB`,
        },
        null,
        2
      )
    );

    // Poll for completion (up to 2 hours)
    let attempts = 0;
    const maxAttempts = 720;

    console.log(`\n⏳ Monitoring training progress (max 120 minutes)...`);

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

        // Extract LoRA URL from various possible response formats
        let loraUrl: string | undefined;
        let diffusersFile: Record<string, unknown> | undefined;
        let configFile: Record<string, unknown> | undefined;
        let debugOutput: unknown;

        const resultData = (result as { data?: unknown }).data || result;
        if (typeof resultData === "object" && resultData !== null) {
          diffusersFile = (resultData as any).diffusers_lora_file;
          configFile = (resultData as any).config_file;
          debugOutput = (resultData as any).debug_preprocessed_output;

          if (diffusersFile && typeof diffusersFile === "object") {
            loraUrl = (diffusersFile as any).url;
          }
        }

        console.log(`   LoRA URL: ${loraUrl || "(not found in standard fields)"}`);

        // Save full result
        await fs.writeFile(
          "artifacts/vivien_lora_v2/metadata/training-result.json",
          JSON.stringify(result, null, 2)
        );
        console.log(`   Result saved: artifacts/vivien_lora_v2/metadata/training-result.json`);

        return {
          request_id: requestId,
          status: "completed",
          lora_url: loraUrl,
          full_result: result,
        };
      }

      if (statusValue === "FAILED" || statusValue === "ERROR") {
        console.error(`❌ Training FAILED:`);
        console.error(JSON.stringify(status, null, 2));
        process.exit(1);
      }

      attempts++;
      if (attempts % 6 === 0) {
        // Log every 60 seconds
        const elapsed = Math.round((attempts * 10) / 60);
        console.log(`   [${elapsed}m] Status: ${statusValue}`);
      }

      await new Promise((r) => setTimeout(r, 10000));
    }

    console.error(`❌ Training timed out after ${maxAttempts * 10 / 60} minutes`);
    process.exit(1);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(`❌ Submission failed: ${err.message}`);
      if ("cause" in err) {
        console.error(`   Cause: ${err.cause}`);
      }
    } else {
      console.error(`❌ Submission failed:`, err);
    }
    process.exit(1);
  }
}

trainFluxLoraWithZip();
