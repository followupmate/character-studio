import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
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
if (!env.FAL_API_KEY) throw new Error("FAL_API_KEY not found in .env.local");
fal.config({ credentials: env.FAL_API_KEY });

// Post-training inference tests for Vivien LoRA V2
// Tests 6 prompts × 3 LoRA strength levels = 18 images

interface TestResult {
  prompt_id: string;
  prompt: string;
  strength: number;
  seed: number;
  generated_url: string;
  generated_at: string;
}

const testPrompts = [
  {
    id: "A1_direct_gaze",
    prompt: `A photo of vivienv2x woman, close-up portrait, looking directly at camera,
neutral expression, soft natural daylight, plain light background, photorealistic`,
    seed: 12345,
  },
  {
    id: "A2_profile",
    prompt: `A photo of vivienv2x woman, close-up portrait, profile view, contemplative expression,
soft window light, beige wall background, elegant, subtle makeup`,
    seed: 23456,
  },
  {
    id: "A3_three_quarter",
    prompt: `A photo of vivienv2x woman, close-up portrait, three-quarter angle, soft smile,
natural light, neutral background, warm golden hour lighting`,
    seed: 34567,
  },
  {
    id: "B1_blazer",
    prompt: `A photo of vivienv2x woman, waist-up portrait, wearing a tailored linen blazer,
calm confident expression, neutral interior background, natural window light`,
    seed: 45678,
  },
  {
    id: "B2_hotel_blouse",
    prompt: `A photo of vivienv2x woman, waist-up portrait, wearing a cream silk blouse,
relaxed elegant pose, luxury hotel interior, natural daylight, sophisticated`,
    seed: 56789,
  },
  {
    id: "B3_tank_top",
    prompt: `A photo of vivienv2x woman, waist-up portrait, white tank top, standing casually,
warm interior lighting, relaxed posture, natural beauty, approachable`,
    seed: 67890,
  },
  {
    id: "C1_hotel_lobby",
    prompt: `A photo of vivienv2x woman, full-body standing portrait, elegant hotel lobby,
wearing a simple black dress, relaxed sophisticated posture, soft natural light,
marble columns, contemporary interior`,
    seed: 78901,
  },
  {
    id: "C2_terrace",
    prompt: `A photo of vivienv2x woman, full-body standing portrait, terrace or balcony,
blue jeans and neutral linen top, natural daylight, casual elegant lifestyle,
sunset golden hour, architectural background`,
    seed: 89012,
  },
  {
    id: "C3_bedroom",
    prompt: `A photo of vivienv2x woman, full-body standing, elegant bedroom, silk slip dress
in cream or rose tones, soft daylight from window, relaxed elegant pose,
intimate luxury ambiance, mood lighting`,
    seed: 90123,
  },
];

const loraStrengths = [0.55, 0.7, 0.85];

async function runInferenceTests(loraUrl: string): Promise<void> {
  if (!env.FAL_API_KEY) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: env.FAL_API_KEY });

  if (!loraUrl) {
    throw new Error("LoRA URL required. Provide training-result.json with lora_url");
  }

  console.log(`🧪 Starting Vivien LoRA V2 inference tests`);
  console.log(`   LoRA URL: ${loraUrl}`);
  console.log(`   Prompts: ${testPrompts.length}`);
  console.log(`   Strength levels: ${loraStrengths.length}`);
  console.log(`   Total tests: ${testPrompts.length * loraStrengths.length}\n`);

  const results: TestResult[] = [];
  let testCount = 0;

  for (const testPrompt of testPrompts) {
    for (const strength of loraStrengths) {
      testCount++;
      const testLabel = `[${testCount}/${testPrompts.length * loraStrengths.length}]`;

      console.log(`${testLabel} Testing: ${testPrompt.id} @ strength ${strength}...`);

      try {
        // Call fal.ai FLUX inference with LoRA
        const inferenceResult = await fal.queue.submit("fal-ai/flux-inference", {
          input: {
            prompt: testPrompt.prompt,
            image_size: { width: 1024, height: 1024 },
            num_inference_steps: 28,
            guidance_scale: 3.5,
            seed: testPrompt.seed,
            lora_url: loraUrl,
            lora_strength: strength.toString(),
          } as Record<string, unknown>,
        });

        const requestId = (inferenceResult as { request_id: string }).request_id;
        if (!requestId) {
          console.log(`   ⚠️  No request_id returned`);
          continue;
        }

        // Poll for completion
        let maxAttempts = 120; // ~20 minutes
        let attempts = 0;

        while (attempts < maxAttempts) {
          const status = await fal.queue.status("fal-ai/flux-inference", {
            requestId,
          });

          const statusValue = (status as { status?: string }).status;

          if (statusValue === "COMPLETED") {
            const result = await fal.queue.result("fal-ai/flux-inference", {
              requestId,
            });

            // Extract image URL from result
            const imageUrl =
              (result as any)?.data?.image?.url ||
              (result as any)?.image?.url ||
              (result as any)?.output?.image?.url;

            if (imageUrl) {
              results.push({
                prompt_id: testPrompt.id,
                prompt: testPrompt.prompt,
                strength,
                seed: testPrompt.seed,
                generated_url: imageUrl,
                generated_at: new Date().toISOString(),
              });

              console.log(`   ✅ Generated: ${imageUrl.slice(0, 60)}...`);
            } else {
              console.log(`   ⚠️  No image URL in result`);
            }
            break;
          }

          if (statusValue === "FAILED" || statusValue === "ERROR") {
            console.log(`   ❌ Inference failed`);
            break;
          }

          attempts++;
          if (attempts % 6 === 0) {
            console.log(`   ⏳ Waiting... (${attempts * 10}s elapsed)`);
          }

          await new Promise((r) => setTimeout(r, 10000));
        }

        if (attempts >= maxAttempts) {
          console.log(`   ⏱️  Timed out`);
        }
      } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Save results
  const resultsJson = {
    lora_url: loraUrl,
    total_tests: testPrompts.length * loraStrengths.length,
    completed_tests: results.length,
    results,
    generated_at: new Date().toISOString(),
  };

  await fs.writeFile(
    "artifacts/vivien_lora_v2/tests/inference_results.json",
    JSON.stringify(resultsJson, null, 2)
  );

  console.log(`\n✅ Inference tests complete!`);
  console.log(`   Generated: ${results.length} images`);
  console.log(`   Results saved: artifacts/vivien_lora_v2/tests/inference_results.json`);
}

// Entry point
async function main() {
  try {
    // Try to load LoRA URL from training result
    const trainingResultPath =
      "artifacts/vivien_lora_v2/metadata/training-result.json";
    let loraUrl: string | undefined;

    try {
      const resultJson = await fs.readFile(trainingResultPath, "utf8");
      const result = JSON.parse(resultJson);
      loraUrl =
        result?.data?.diffusers_lora_file?.url ||
        result?.diffusers_lora_file?.url ||
        result?.lora_url;
    } catch {
      console.log(
        `⚠️  Could not load LoRA URL from ${trainingResultPath}`
      );
    }

    if (!loraUrl) {
      // Try to load from command line argument
      loraUrl = process.argv[2];
      if (!loraUrl) {
        console.error(`❌ LoRA URL not provided`);
        console.error(
          `Usage: npx tsx lib/testFluxLoraInference.ts <lora-url>`
        );
        process.exit(1);
      }
    }

    await runInferenceTests(loraUrl);
  } catch (err) {
    console.error(
      `❌ Error:`,
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }
}

main();
