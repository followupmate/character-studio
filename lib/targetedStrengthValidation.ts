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

// Targeted tests
const tests = [
  {
    category: "A. Close-up",
    prompt:
      "photo of vivienv2x woman, close-up portrait, looking directly at the camera, neutral relaxed expression, plain light background, soft natural daylight, photorealistic, natural skin texture",
    seed: 42001,
    strengths: [0.55, 0.7, 0.85],
  },
  {
    category: "B. Full-body",
    prompt:
      "photo of vivienv2x woman, full-body fashion photograph, standing naturally in an elegant hotel interior, wearing a simple black dress, realistic body proportions, soft natural light, photorealistic",
    seed: 42004,
    strengths: [0.6, 0.75, 0.9],
  },
  {
    category: "C. Original boudoir",
    prompt:
      "photo of vivienv2x woman, seated on the edge of a bed in an elegant hotel room, wearing a cream silk robe, tasteful boudoir photography, soft natural window light, photorealistic",
    seed: 42006,
    strengths: [0.7, 0.85, 0.95],
  },
  {
    category: "D. Waist-up boudoir",
    prompt:
      "photo of vivienv2x woman, waist-up boudoir portrait, sitting upright on the edge of an elegant bed, face clearly visible, looking toward the camera, wearing a cream silk robe, soft natural window light, tasteful sensual photography, photorealistic, natural skin texture",
    seed: 42009,
    strengths: [0.7, 0.85, 0.95],
  },
];

interface TestResult {
  test_id: string;
  category: string;
  prompt: string;
  seed: number;
  strength: number;
  image_url?: string;
  status: "success" | "error";
  error_message?: string;
  inference_time?: number;
  request_timestamp: string;
  response_timestamp: string;
}

async function runTargetedValidation() {
  console.log(`\n🧪 VIVIEN LORA V2 — TARGETED STRENGTH VALIDATION\n`);
  console.log(`   Endpoint: fal-ai/flux-lora`);
  console.log(`   LoRA: vivien_flux1dev_lora_v2_900steps.safetensors`);
  console.log(`   Trigger: vivienv2x`);
  console.log(`   Tests: 4 categories × 3 strength levels = 12 images\n`);

  const results: TestResult[] = [];
  let count = 0;
  const totalTests = tests.reduce((sum, t) => sum + t.strengths.length, 0);

  for (const test of tests) {
    console.log(`\n📸 ${test.category}`);

    for (const strength of test.strengths) {
      count++;
      const testId = `${test.category.split(".")[0].toLowerCase()}_${strength}`;
      process.stdout.write(
        `   [${count}/${totalTests}] strength ${strength}... `
      );

      const requestTime = new Date().toISOString();

      try {
        const result = await fal.subscribe("fal-ai/flux-lora", {
          input: {
            prompt: test.prompt,
            image_size: "portrait_4_3",
            num_inference_steps: 28,
            guidance_scale: 3.5,
            num_images: 1,
            seed: test.seed,
            loras: [
              {
                path: loraUrl,
                scale: strength,
              },
            ],
          },
        });

        const responseTime = new Date().toISOString();
        const imageUrl = (result as any)?.data?.images?.[0]?.url;
        const inferenceTime = (result as any)?.data?.timings?.inference;

        if (imageUrl) {
          results.push({
            test_id: testId,
            category: test.category,
            prompt: test.prompt,
            seed: test.seed,
            strength,
            image_url: imageUrl,
            status: "success",
            inference_time: inferenceTime,
            request_timestamp: requestTime,
            response_timestamp: responseTime,
          });
          console.log(`✅ (${inferenceTime?.toFixed(2)}s)`);
        } else {
          results.push({
            test_id: testId,
            category: test.category,
            prompt: test.prompt,
            seed: test.seed,
            strength,
            status: "error",
            error_message: "No image URL in response",
            request_timestamp: requestTime,
            response_timestamp: responseTime,
          });
          console.log(`⚠️ (no image)`);
        }
      } catch (err) {
        const responseTime = new Date().toISOString();
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({
          test_id: testId,
          category: test.category,
          prompt: test.prompt,
          seed: test.seed,
          strength,
          status: "error",
          error_message: errorMsg,
          request_timestamp: requestTime,
          response_timestamp: responseTime,
        });
        console.log(`❌ (${errorMsg})`);
      }
    }
  }

  // Save results
  const output = {
    test_name: "VIVIEN LORA V2 — Targeted Strength Validation",
    endpoint: "fal-ai/flux-lora",
    lora_url: loraUrl,
    lora_trigger: "vivienv2x",
    test_categories: 4,
    strengths_per_category: 3,
    total_tests: totalTests,
    completed_tests: results.filter((r) => r.status === "success").length,
    failed_tests: results.filter((r) => r.status === "error").length,
    test_started_at: new Date(Date.now() - 60000).toISOString(),
    test_completed_at: new Date().toISOString(),
    results,
  };

  await fs.writeFile(
    "artifacts/vivien_lora_v2/tests/targeted_validation/targeted_strength_results.json",
    JSON.stringify(output, null, 2)
  );

  console.log(`\n✅ Targeted validation complete!\n`);
  console.log(
    `   Generated: ${output.completed_tests} images / ${totalTests} target`
  );
  console.log(`   Failed: ${output.failed_tests}`);
  console.log(
    `   Saved: artifacts/vivien_lora_v2/tests/targeted_validation/targeted_strength_results.json\n`
  );

  if (output.completed_tests > 0) {
    console.log(`📊 Next: Download images and create contact sheet`);
    console.log(`   Check identity consistency across strength levels`);
    console.log(`   Identify optimal strength for each scene\n`);
  }
}

runTargetedValidation().catch((err) => {
  console.error(`Fatal error:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
