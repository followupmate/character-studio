import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";
import { readFileSync } from "fs";
import { resolve } from "path";

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
fal.config({ credentials: env.FAL_API_KEY });

const loraUrl =
  "https://v3b.fal.media/files/b/0aa539ce/TUuw_lMO8xowMXl5jxonP_pytorch_lora_weights.safetensors";
const loraStrength = 0.7;

// Smoke test: 3 scény, LoRA + baseline
const smokeScenes = [
  {
    id: "A",
    name: "Close-up",
    prompt:
      "photo of vivienv2x woman, close-up portrait, looking directly at the camera, neutral relaxed expression, plain light background, soft natural daylight, photorealistic, natural skin texture",
    seed: 42001,
  },
  {
    id: "D",
    name: "Full-body",
    prompt:
      "photo of vivienv2x woman, full-body fashion photograph, standing naturally in an elegant hotel interior, wearing a simple black dress, realistic body proportions, soft natural light, photorealistic",
    seed: 42004,
  },
  {
    id: "F",
    name: "Soft boudoir",
    prompt:
      "photo of vivienv2x woman, seated on the edge of a bed in an elegant hotel room, wearing a cream silk robe, tasteful boudoir photography, soft natural window light, photorealistic",
    seed: 42006,
  },
];

interface TestResult {
  scene_id: string;
  scene_name: string;
  prompt: string;
  seed: number;
  lora_enabled: boolean;
  lora_strength?: number;
  image_url?: string;
  image_size: string;
  status: "success" | "error";
  error_message?: string;
  endpoint: string;
  request_timestamp: string;
  response_timestamp: string;
  raw_request?: Record<string, unknown>;
  raw_response?: Record<string, unknown>;
}

async function runSmokeTest() {
  console.log(`\n🧪 VIVIEN LORA V2 — SMOKE TEST (fal-ai/flux-lora)\n`);
  console.log(`   Endpoint: fal-ai/flux-lora`);
  console.log(`   LoRA: ${loraUrl.split("/").pop()}`);
  console.log(`   Trigger: vivienv2x`);
  console.log(`   Strength: ${loraStrength}`);
  console.log(`   Scenes: 3 (with LoRA + baseline)`);
  console.log(`   Total images: 6\n`);

  const results: TestResult[] = [];

  for (const scene of smokeScenes) {
    console.log(`📸 Scene ${scene.id}: ${scene.name}`);

    // Test WITH LoRA
    console.log(`   ├─ With LoRA (strength ${loraStrength})...`);
    const withLoraStartTime = new Date().toISOString();

    try {
      const request = {
        prompt: scene.prompt,
        image_size: "portrait_4_3",
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        seed: scene.seed,
        loras: [
          {
            path: loraUrl,
            scale: loraStrength,
          },
        ],
      };

      console.log(`       Request payload (first call):`, JSON.stringify(request, null, 2));

      const result = await fal.subscribe("fal-ai/flux-lora", { input: request });

      const withLoraEndTime = new Date().toISOString();
      const imageUrl = (result as any)?.data?.images?.[0]?.url;

      if (imageUrl) {
        results.push({
          scene_id: scene.id,
          scene_name: scene.name,
          prompt: scene.prompt,
          seed: scene.seed,
          lora_enabled: true,
          lora_strength: loraStrength,
          image_url: imageUrl,
          image_size: "portrait_4_3",
          status: "success",
          endpoint: "fal-ai/flux-lora",
          request_timestamp: withLoraStartTime,
          response_timestamp: withLoraEndTime,
          raw_request: request,
          raw_response: result,
        });
        console.log(`       ✅ Success`);
        console.log(`       Image: ${imageUrl}`);
      } else {
        results.push({
          scene_id: scene.id,
          scene_name: scene.name,
          prompt: scene.prompt,
          seed: scene.seed,
          lora_enabled: true,
          lora_strength: loraStrength,
          image_size: "portrait_4_3",
          status: "error",
          error_message: "No image URL in response",
          endpoint: "fal-ai/flux-lora",
          request_timestamp: withLoraStartTime,
          response_timestamp: withLoraEndTime,
          raw_request: request,
          raw_response: result,
        });
        console.log(`       ⚠️ No image in response`);
        console.log(`       Raw response:`, JSON.stringify(result, null, 2));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        scene_id: scene.id,
        scene_name: scene.name,
        prompt: scene.prompt,
        seed: scene.seed,
        lora_enabled: true,
        lora_strength: loraStrength,
        image_size: "portrait_4_3",
        status: "error",
        error_message: errorMsg,
        endpoint: "fal-ai/flux-lora",
        request_timestamp: withLoraStartTime,
        response_timestamp: new Date().toISOString(),
      });
      console.log(`       ❌ Error: ${errorMsg}`);
    }

    // Test WITHOUT LoRA (baseline)
    console.log(`   └─ Baseline (no LoRA)...`);
    const baselineStartTime = new Date().toISOString();

    try {
      const baselinePrompt = scene.prompt.replace(/vivienv2x\s*/g, "").trim();

      const request = {
        prompt: baselinePrompt,
        image_size: "portrait_4_3",
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        seed: scene.seed,
      };

      const result = await fal.subscribe("fal-ai/flux-lora", { input: request });

      const baselineEndTime = new Date().toISOString();
      const imageUrl = (result as any)?.data?.images?.[0]?.url;

      if (imageUrl) {
        results.push({
          scene_id: `${scene.id}-baseline`,
          scene_name: `${scene.name} (baseline)`,
          prompt: baselinePrompt,
          seed: scene.seed,
          lora_enabled: false,
          image_url: imageUrl,
          image_size: "portrait_4_3",
          status: "success",
          endpoint: "fal-ai/flux-lora",
          request_timestamp: baselineStartTime,
          response_timestamp: baselineEndTime,
          raw_request: request,
          raw_response: result,
        });
        console.log(`       ✅ Success`);
        console.log(`       Image: ${imageUrl}`);
      } else {
        results.push({
          scene_id: `${scene.id}-baseline`,
          scene_name: `${scene.name} (baseline)`,
          prompt: baselinePrompt,
          seed: scene.seed,
          lora_enabled: false,
          image_size: "portrait_4_3",
          status: "error",
          error_message: "No image URL in response",
          endpoint: "fal-ai/flux-lora",
          request_timestamp: baselineStartTime,
          response_timestamp: baselineEndTime,
          raw_request: request,
          raw_response: result,
        });
        console.log(`       ⚠️ No image in response`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        scene_id: `${scene.id}-baseline`,
        scene_name: `${scene.name} (baseline)`,
        prompt: scene.prompt.replace(/vivienv2x\s*/g, "").trim(),
        seed: scene.seed,
        lora_enabled: false,
        image_size: "portrait_4_3",
        status: "error",
        error_message: errorMsg,
        endpoint: "fal-ai/flux-lora",
        request_timestamp: baselineStartTime,
        response_timestamp: new Date().toISOString(),
      });
      console.log(`       ❌ Error: ${errorMsg}`);
    }

    console.log();
  }

  // Save results
  const output = {
    test_name: "VIVIEN LORA V2 — Smoke Test",
    endpoint: "fal-ai/flux-lora",
    lora_url: loraUrl,
    lora_trigger: "vivienv2x",
    lora_strength_tested: loraStrength,
    num_scenes: smokeScenes.length,
    total_images_target: smokeScenes.length * 2, // with LoRA + baseline
    completed_images: results.filter((r) => r.status === "success").length,
    failed_images: results.filter((r) => r.status === "error").length,
    test_started_at: new Date(Date.now() - 60000).toISOString(),
    test_completed_at: new Date().toISOString(),
    results,
  };

  await fs.writeFile(
    "artifacts/vivien_lora_v2/tests/smoke_test_flux_lora.json",
    JSON.stringify(output, null, 2)
  );

  console.log(`✅ Smoke test complete!\n`);
  console.log(
    `   Generated: ${output.completed_images} images / ${output.total_images_target} target`
  );
  console.log(`   Failed: ${output.failed_images}`);
  console.log(`   Saved: artifacts/vivien_lora_v2/tests/smoke_test_flux_lora.json\n`);

  if (output.completed_images > 0) {
    console.log(`📊 Next: Visual assessment of generated images`);
    console.log(`   Criteria: identity consistency, eye/face geometry, full-body stability`);
    console.log(`   If smoke test passes → extend to strength levels 0.55, 0.70, 0.85\n`);
  } else {
    console.log(
      `⚠️ No images generated. Check raw_response fields in smoke_test_flux_lora.json\n`
    );
  }
}

runSmokeTest().catch((err) => {
  console.error(`Fatal error:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
