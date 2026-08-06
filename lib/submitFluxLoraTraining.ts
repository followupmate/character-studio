import { fal } from "@fal-ai/client";
import { readFileSync } from "fs";
import { resolve } from "path";

// Submit Vivien LoRA V2 training to fal-ai/flux-lora-fast-training
// Uses ZIP archive with 19 images + captions

async function submitFluxLoraTraining() {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falApiKey });

  const zipPath = resolve(
    "artifacts/vivien_lora_v2/dataset_zip/vivien_lora_v2_training_dataset.zip"
  );

  // Try to read ZIP file
  let zipData: Buffer;
  try {
    zipData = readFileSync(zipPath);
    console.log(`✅ ZIP file loaded: ${zipPath} (${zipData.length} bytes)`);
  } catch {
    throw new Error(
      `Failed to load ZIP: ${zipPath}. Use the scratchpad ZIP instead or upload to storage.`
    );
  }

  // Convert to data URL for fal.ai submission
  const dataUrl = `data:application/zip;base64,${zipData.toString("base64")}`;

  const trainingInput = {
    images_data_url: dataUrl,
    trigger_word: "vivienv2x",
    steps: "900",
    create_masks: true,
    is_style: false,
    is_input_format_already_preprocessed: false,
    data_archive_format: "zip",
  };

  console.log("\n🚀 Submitting training to fal-ai/flux-lora-fast-training...");
  console.log("   Trigger: vivienv2x");
  console.log("   Steps: 900");
  console.log("   Images: 19 (with captions)");
  console.log("   Model: FLUX.1 Dev (inferred)");

  const submitResult = await fal.queue.submit("fal-ai/flux-lora-fast-training", {
    input: trainingInput as Record<string, unknown>,
  });

  const requestId = (submitResult as { request_id: string }).request_id;
  if (!requestId) throw new Error(`No request_id returned from fal.ai`);

  console.log(`\n✅ Training job submitted!`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Monitor: https://fal.run/fal-ai/flux-lora-fast-training?request_id=${requestId}`);

  // Poll for completion (up to 2 hours)
  let attempts = 0;
  const maxAttempts = 720; // ~2 hours with 10s polling

  while (attempts < maxAttempts) {
    const status = await fal.queue.status("fal-ai/flux-lora-fast-training", {
      requestId,
    });

    const statusValue = (status as { status?: string }).status;

    if (statusValue === "COMPLETED") {
      const result = await fal.queue.result("fal-ai/flux-lora-fast-training", {
        requestId,
      });

      const loraUrl =
        (result as { data?: { diffusers_lora_file?: { url?: string } } })
          ?.data?.diffusers_lora_file?.url ||
        (result as { diffusers_lora_file?: { url?: string } })
          ?.diffusers_lora_file?.url;

      console.log(`\n✅ Training COMPLETED!`);
      console.log(`   LoRA URL: ${loraUrl}`);
      console.log(`   Full result saved to artifacts/vivien_lora_v2/training-result.json`);

      // Save result
      const fs = await import("fs").then((m) => m.promises);
      await fs.writeFile(
        "artifacts/vivien_lora_v2/metadata/training-result.json",
        JSON.stringify(result, null, 2)
      );

      return {
        request_id: requestId,
        status: "completed",
        lora_url: loraUrl,
        result,
      };
    }

    if (statusValue === "FAILED" || statusValue === "ERROR") {
      throw new Error(
        `Training failed: ${JSON.stringify(status).slice(0, 200)}`
      );
    }

    attempts++;
    if (attempts % 6 === 0) {
      // Log every 60s
      console.log(`[${attempts}/${maxAttempts}] Status: ${statusValue}, waiting...`);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }

  throw new Error(`Training timed out after ${maxAttempts} attempts`);
}

submitFluxLoraTraining().catch((err) => {
  console.error("❌ Training submission failed:", err.message);
  process.exit(1);
});
