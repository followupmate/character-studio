import { fal } from "@fal-ai/client";

// FLUX LoRA Training runner — trains a new identity LoRA for Vivien v2
// Dataset: 19 curated images with captions, trigger token: vivienv2x

export async function trainFluxLoRA(opts: {
  projectName: string;
  triggerToken: string;
  imageUrls: string[];
  captions: string[];
  steps?: number;
  resolution?: number;
}): Promise<{ lora_url: string; request_id: string; status: string }> {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falApiKey });

  const steps = opts.steps ?? 900;
  const resolution = opts.resolution ?? 1024;

  if (opts.imageUrls.length !== opts.captions.length) {
    throw new Error(`Image/caption count mismatch: ${opts.imageUrls.length} vs ${opts.captions.length}`);
  }

  // Prepare training dataset — fal.ai expects either:
  // - Presigned URLs with captions, or
  // - Images + captions as files
  // We'll use URLs with inline captions.
  const trainingData = opts.imageUrls.map((url, idx) => ({
    image_url: url,
    caption: opts.captions[idx],
  }));

  const input = {
    images_data: trainingData,
    trigger_word: opts.triggerToken,
    steps: steps.toString(),
    resolution: resolution.toString(),
    learning_rate: "0.0001",
    lora_rank: 32,
  };

  console.log(`Starting FLUX LoRA training: ${opts.projectName}, ${opts.imageUrls.length} images, ${steps} steps`);
  const submitResult = await fal.queue.submit("fal-ai/flux-lora-training", {
    input: input as Record<string, unknown>,
  });

  const requestId = (submitResult as { request_id: string }).request_id;
  if (!requestId) throw new Error(`No request_id returned from fal.ai`);

  console.log(`Training job submitted: ${requestId}`);
  console.log(`Monitor status at: https://fal.run/fal-ai/flux-lora-training?request_id=${requestId}`);

  // Poll until completion
  let status: string | undefined;
  let attempts = 0;
  const maxAttempts = 720; // ~2 hours with 10s polling

  while (attempts < maxAttempts) {
    const result = await fal.queue.status("fal-ai/flux-lora-training", { requestId });
    status = (result as { status?: string }).status;

    if (status === "COMPLETED") {
      const finalResult = await fal.queue.result("fal-ai/flux-lora-training", { requestId });
      const loraUrl = (finalResult as { data?: { lora?: { url?: string } } | { lora_url?: string } })?.data?.lora?.url ||
        (finalResult as { lora_url?: string }).lora_url ||
        (finalResult as { output?: { lora_url?: string } }).output?.lora_url;

      if (!loraUrl) throw new Error(`No LoRA URL in result: ${JSON.stringify(finalResult).slice(0, 200)}`);

      console.log(`✅ Training complete. LoRA: ${loraUrl}`);
      return { lora_url: loraUrl, request_id: requestId, status: "completed" };
    }

    if (status === "FAILED" || status === "ERROR") {
      const error = (result as { error?: unknown }).error || JSON.stringify(result).slice(0, 200);
      throw new Error(`Training failed: ${error}`);
    }

    // Still processing
    attempts++;
    console.log(`[${attempts}/${maxAttempts}] Status: ${status}, waiting 10s...`);
    await new Promise((r) => setTimeout(r, 10000));
  }

  throw new Error(`Training timed out after ${maxAttempts} attempts`);
}
